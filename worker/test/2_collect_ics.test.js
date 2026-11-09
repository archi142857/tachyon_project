// 2_collect_ics.js 시험 (담당: 서버 세션). 주소·일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { calendar, vevent } from './ics_fixtures.js';
import { handle, scheduled, collectDue, collectUser, normalizeUrl, syncWindow, urlHint } from '../2_collect_ics.js';
import { seal } from '../lib/secret.js';

const NOW = Date.parse('2026-11-09T08:00:00Z'); // 한국 17:00
const MIN = 60 * 1000;
// 모양은 진짜와 같지만 값은 지어낸 주소(가짜 인터넷만 씀)
const ETL_URL = 'https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLEtokenabcd.ics';
const GOOGLE_URL = 'https://calendar.google.com/calendar/ical/exampleuser/private-EXAMPLEsecret1234/basic.ics';

// 가짜 인터넷: 주소 → ICS 글(또는 상태 번호). 시계도 멈춰 날짜가 지나도 같은 결과가 나오게 한다.
const web = new Map();
const realFetch = globalThis.fetch;
const realNow = Date.now;
let clock = NOW;
test.before(() => {
  Date.now = () => clock;
  globalThis.fetch = async (input) => {
    const body = web.get(typeof input === 'string' ? input : input.url);
    if (body === undefined) return new Response('not found', { status: 404 });
    if (typeof body === 'number') return new Response('error', { status: body });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/calendar' } });
  };
});
test.after(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
});
test.beforeEach(() => {
  clock = NOW;
});

function etlCalendar({ title101 = '예시 과제 1 [예시 과목]', drop102 = false } = {}) {
  return calendar(
    vevent(['UID:event-assignment-101', `SUMMARY:${title101}`, 'DTSTART;VALUE=DATE:20261112T000000', 'DTEND;VALUE=DATE:20261112T000000']),
    drop102 ? [] : vevent(['UID:event-assignment-102', 'SUMMARY:예시 과제 2 [예시 과목]', 'DTSTART:20261120T145900Z', 'DTEND:20261120T145900Z']),
    vevent(['UID:event-calendar-event-7', 'SUMMARY:예시 지난 시험', 'DTSTART:20260920T010000Z', 'DTEND:20260920T030000Z']), // 기간(지난 30일) 밖
    vevent(['UID:event-calendar-event-8', 'SUMMARY:예시 보강', 'DTSTART:20261125T010000Z', 'DTEND:20261125T030000Z']),
  );
}

function googleCalendar({ withParty = true } = {}) {
  return calendar(
    vevent(['UID:class@example', 'SUMMARY:예시 수업', 'LOCATION:예시 301동', 'DTSTART;TZID=Asia/Seoul:20261102T100000', 'DTEND;TZID=Asia/Seoul:20261102T111500', 'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261207T145959Z']),
    withParty ? vevent(['UID:party@example', 'SUMMARY:예시 모임', 'DTSTART;TZID=Asia/Seoul:20261128T180000', 'DTEND;TZID=Asia/Seoul:20261128T200000']) : [],
  );
}

async function setup() {
  web.clear();
  web.set(ETL_URL, etlCalendar());
  web.set(GOOGLE_URL, googleCalendar());
  const env = makeEnv();
  const user = await addTestUser(env);
  return { env, user };
}

const req = (path, init = {}) => new Request(`https://tachyon.example.invalid${path}`, init);
const count = async (env, table, where = '1') => (await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first()).n;

async function saveBoth(env, user) {
  const body = JSON.stringify({ etl: ETL_URL.replace('https://', 'webcal://'), google: GOOGLE_URL });
  const res = await handle(req('/api/feeds', { method: 'PUT', body }), env, makeCtx(), user);
  return { res, data: await res.json() };
}

test('주소 저장 → 바로 받기: eTL 과제는 tasks, 나머지는 events', async () => {
  const { env, user } = await setup();
  const { res, data } = await saveBoth(env, user);
  assert.equal(res.status, 200);
  assert.equal(data.results.length, 2);
  assert.ok(data.results.every((r) => r.ok && r.saved), JSON.stringify(data.results));
  assert.deepEqual(data.results.map((r) => [r.kind, r.tasks, r.events]), [['etl', 2, 1], ['google', 0, 7]]); // 화면: '과제 2개를 찾았어요'

  assert.equal(await count(env, 'tasks', "source = 'etl'"), 2);
  assert.equal(await count(env, 'events', "source = 'etl'"), 1); // 지난 시험은 기간 밖
  assert.equal(await count(env, 'events', "source = 'google'"), 7); // 수업 11/2~12/7 월요일 6번 + 모임 1

  const t101 = await env.DB.prepare("SELECT due FROM tasks WHERE ext_id = 'event-assignment-101'").first();
  assert.equal(t101.due, '2026-11-12T23:59:00+09:00'); // 하루 종일 과제 = 그날 23:59
  const t102 = await env.DB.prepare("SELECT due FROM tasks WHERE ext_id = 'event-assignment-102'").first();
  assert.equal(t102.due, '2026-11-20T23:59:00+09:00');
  const cls = await env.DB.prepare("SELECT start, \"end\", place FROM events WHERE ext_id = 'class@example#20261109T010000Z'").first();
  assert.deepEqual(cls, { start: '2026-11-09T10:00:00+09:00', end: '2026-11-09T11:15:00+09:00', place: '예시 301동' });

  // 응답과 DB 어디에도 주소 원문이 없다
  const dump = JSON.stringify(data) + JSON.stringify((await env.DB.prepare('SELECT * FROM feeds').all()).results);
  assert.ok(!dump.includes('EXAMPLEtoken') && !dump.includes('private-'), '주소가 새면 안 됨');
  assert.equal(data.feeds.find((f) => f.kind === 'etl').hint, 'myetl.snu.ac.kr/…abcd');
  assert.equal(data.feeds.find((f) => f.kind === 'google').hint, 'calendar.google.com/…1234');
  assert.deepEqual(data.feeds.find((f) => f.kind === 'apple'), { kind: 'apple', set: false });
});

test('같은 주소를 두 번 받아도 개수 그대로(중복 없음)', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  const before = [await count(env, 'tasks'), await count(env, 'events')];
  const again = await collectUser(env, user.id, { force: true, now: NOW + 60 * MIN });
  assert.ok(again.every((r) => r.ok && r.changes === 0), JSON.stringify(again)); // 쓴 줄도 0
  assert.deepEqual([await count(env, 'tasks'), await count(env, 'events')], before);
});

test('Cron: 15분 안에는 다시 안 받고, 내용이 같으면 쓰지 않는다(same)', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  assert.deepEqual(await collectDue(env, NOW + 5 * MIN), { feeds: 0 });
  assert.deepEqual(await collectDue(env, NOW + 20 * MIN), { feeds: 2, changed: 0, same: 2, failed: 0 });
  assert.equal(await count(env, 'log', "action = 'ics_sync'"), 2); // 처음 받을 때 한 번씩만
  // 다음 날에는 기간이 움직였으니 다시 펼친다(바뀐 줄이 없으면 쓰지는 않음)
  const nextDay = await collectDue(env, NOW + 24 * 60 * MIN);
  assert.equal(nextDay.changed, 2);
  assert.equal(await count(env, 'log', "action = 'ics_sync'"), 2);
});

test('바뀐 내용 반영: 제목은 고치고, 사라진 과제는 지우고, 끝낸 표시·중요 표시는 지킨다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  await env.DB.prepare("UPDATE tasks SET done = 1, minutes = 30 WHERE ext_id = 'event-assignment-101'").run();
  await env.DB.prepare("UPDATE events SET important = 1 WHERE ext_id = 'party@example'").run();

  web.set(ETL_URL, etlCalendar({ title101: '예시 과제 1 (마감 연장) [예시 과목]', drop102: true }));
  const summary = await collectDue(env, NOW + 20 * MIN);
  assert.deepEqual(summary, { feeds: 2, changed: 1, same: 1, failed: 0 });

  const t101 = await env.DB.prepare("SELECT * FROM tasks WHERE ext_id = 'event-assignment-101'").first();
  assert.equal(t101.title, '예시 과제 1 (마감 연장) [예시 과목]');
  assert.equal(t101.done, 1);
  assert.equal(t101.minutes, 30);
  assert.equal(await count(env, 'tasks', "ext_id = 'event-assignment-102'"), 0);
  assert.equal((await env.DB.prepare("SELECT important FROM events WHERE ext_id = 'party@example'").first()).important, 1);
});

test('기간 밖 지난 일정은 지우지 않고, 빈 캘린더(잠깐 오류)일 때는 아무것도 지우지 않는다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  await env.DB.prepare('INSERT INTO events (user_id, title, start, "end", source, ext_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(user.id, '예시 지난 일정', '2026-09-01T10:00:00+09:00', '2026-09-01T11:00:00+09:00', 'google', 'gone@example')
    .run();
  web.set(GOOGLE_URL, googleCalendar({ withParty: false }));
  await collectUser(env, user.id, { force: true, now: NOW });
  assert.equal(await count(env, 'events', "ext_id = 'party@example'"), 0); // 기간 안에서 사라짐 → 지움
  assert.equal(await count(env, 'events', "ext_id = 'gone@example'"), 1); // 기간 밖 → 그대로

  const before = await count(env, 'events', "source = 'google'");
  web.set(GOOGLE_URL, calendar());
  await collectUser(env, user.id, { force: true, now: NOW });
  assert.equal(await count(env, 'events', "source = 'google'"), before);
});

test('받기 실패: 오류 문장에 주소가 없고 feeds.last_error와 log에 남는다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  web.set(ETL_URL, 401);
  const [etl] = await collectUser(env, user.id, { force: true, kinds: ['etl'], now: NOW });
  assert.equal(etl.ok, false);
  assert.match(etl.error, /HTTP 401/);
  assert.ok(!etl.error.includes('example.invalid'));
  assert.match((await env.DB.prepare("SELECT last_error FROM feeds WHERE kind = 'etl'").first()).last_error, /HTTP 401/);
  assert.equal(await count(env, 'log', "action = 'ics_fail'"), 1);
  assert.equal(await count(env, 'tasks'), 2); // 실패해도 있던 할 일은 그대로

  web.set(GOOGLE_URL, '<!doctype html><title>로그인</title>');
  const [g] = await collectUser(env, user.id, { force: true, kinds: ['google'], now: NOW });
  assert.match(g.error, /ICS가 아닌 응답/);

  const feeds = (await (await handle(req('/api/feeds'), env, makeCtx(), user)).json()).feeds;
  assert.match(feeds.find((f) => f.kind === 'etl').error, /HTTP 401/);
});

test('받다가 멈춘 주소(처리 시간 한도 등)는 목록에 멈춤으로 보인다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  // 시도 시각만 적히고 결과가 안 남은 상태(중간에 끊김)
  await env.DB.prepare("UPDATE feeds SET last_try_at = ?, last_ok_at = ? WHERE kind = 'google'")
    .bind('2026-11-09T17:30:00+09:00', '2026-11-09T17:00:00+09:00')
    .run();
  clock = NOW + 40 * MIN;
  const feeds = (await (await handle(req('/api/feeds'), env, makeCtx(), user)).json()).feeds;
  assert.match(feeds.find((f) => f.kind === 'google').error, /멈췄어요/);
  assert.equal(feeds.find((f) => f.kind === 'etl').error, null);
});

test('주소 지우기: 그 칸의 일정·할 일도 지운다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  const res = await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify({ etl: null }) }), env, makeCtx(), user);
  const data = await res.json();
  assert.equal(data.feeds.find((f) => f.kind === 'etl').set, false);
  assert.equal(await count(env, 'tasks'), 0);
  assert.equal(await count(env, 'events', "source = 'etl'"), 0);
  assert.ok((await count(env, 'events', "source = 'google'")) > 0);
});

test('모양이 틀린 주소는 저장하지 않고 칸마다 알아듣는 문장, 로그인 안 하면 401', async () => {
  const { env, user } = await setup();
  const put = async (body) => {
    const res = await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify(body) }), env, makeCtx(), user);
    return { status: res.status, data: await res.json() };
  };
  for (const [body, pattern] of [
    [{ etl: 'http://myetl.snu.ac.kr/feeds/calendars/a.ics' }, /https/],
    [{ etl: 'https://evil.example/feeds/calendars/a.ics' }, /myetl\.snu\.ac\.kr/],
    [{ google: '캘린더 주소' }, /주소 형식/],
    [{ google: 'https://calendar.google.com/calendar/ical/exampleuser/public/basic.ics' }, /비공개 주소/],
    [{ google: 'https://calendar.example.invalid/x/private-a/basic.ics' }, /비공개 주소/],
    [{ apple: 'webcal://evil.example/published/2/x' }, /공개 캘린더/],
    [{ apple: 42 }, /글로/],
  ]) {
    const { status, data } = await put(body);
    assert.equal(status, 200);
    const [r] = data.results;
    assert.equal(r.saved, false, JSON.stringify(body));
    assert.match(r.error, pattern, JSON.stringify(body));
  }
  assert.equal(await count(env, 'feeds'), 0);
  assert.equal((await put({})).status, 400);
  assert.equal((await handle(req('/api/feeds'), env, makeCtx(), null)).status, 401);
  assert.equal(normalizeUrl(' webcal://p01-caldav.icloud.com/published/2/abc ', 'apple'), 'https://p01-caldav.icloud.com/published/2/abc');
});

test('붙이자마자 받아 보기: 이미 안 열리는 주소는 저장 안 함, 잠깐 오류면 저장하고 나중에 다시', async () => {
  const { env, user } = await setup();
  const put = async (body) => (await (await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify(body) }), env, makeCtx(), user)).json()).results[0];

  web.set(ETL_URL, 404);
  let r = await put({ etl: ETL_URL });
  assert.equal(r.saved, false);
  assert.match(r.error, /HTTP 404.*다시 복사/);

  web.set(ETL_URL, '<!doctype html><title>로그인</title>');
  r = await put({ etl: ETL_URL });
  assert.equal(r.saved, false);
  assert.match(r.error, /ICS가 아닌 응답/);
  assert.equal(await count(env, 'feeds'), 0);

  web.set(ETL_URL, 503);
  r = await put({ etl: ETL_URL });
  assert.equal(r.saved, true);
  assert.match(r.error, /HTTP 503.*다시 받아요/);
  assert.equal(await count(env, 'feeds'), 1);
  web.set(ETL_URL, etlCalendar());
  assert.equal((await collectDue(env, NOW + 20 * MIN)).changed, 1); // Cron이 다시 받아 채움
  assert.equal(await count(env, 'tasks'), 2);
});

test('주소가 죽으면(404 두 번) Cron이 멈추고 다시 붙이기를 보인다, 지금 받기·다시 붙이기로 살아난다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  web.set(GOOGLE_URL, 404); // 구글에서 '재설정'을 누른 경우
  await collectDue(env, NOW + 20 * MIN);
  await collectDue(env, NOW + 40 * MIN);
  const listed = async () => (await (await handle(req('/api/feeds'), env, makeCtx(), user)).json()).feeds.find((f) => f.kind === 'google');
  clock = NOW + 41 * MIN;
  let g = await listed();
  assert.equal(g.stopped, true);
  assert.match(g.error, /더 이상 열리지 않아요/);
  assert.deepEqual(await collectDue(env, NOW + 60 * MIN), { feeds: 1, changed: 0, same: 1, failed: 0 }); // 구글은 건너뛰고 eTL만
  assert.ok((await count(env, 'events', "source = 'google'")) > 0); // 있던 일정은 그대로

  web.set(GOOGLE_URL, 503); // 잠깐의 오류는 멈춤 횟수에 안 센다
  const [again] = await collectUser(env, user.id, { force: true, kinds: ['google'], now: NOW + 61 * MIN });
  assert.equal(again.ok, false);
  assert.equal((await env.DB.prepare("SELECT dead_count FROM feeds WHERE kind = 'google'").first()).dead_count, 2);

  web.set(GOOGLE_URL, googleCalendar());
  await collectUser(env, user.id, { force: true, kinds: ['google'], now: NOW + 62 * MIN }); // 화면의 '지금 받기'
  clock = NOW + 63 * MIN;
  g = await listed();
  assert.equal(g.stopped, false);
  assert.equal(g.error, null);
});

test('Cron 입구: 수집 요약을 로그로 남기고, feeds 표가 없으면 조용히 건너뛴다', async () => {
  const { env, user } = await setup();
  await saveBoth(env, user);
  const logs = [];
  const realLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    clock = NOW + 20 * MIN;
    await scheduled({ cron: '*/15 * * * *' }, env, makeCtx());
    env.DB.sqlite.exec('DROP TABLE feeds');
    await scheduled({ cron: '*/15 * * * *' }, env, makeCtx());
  } finally {
    console.log = realLog;
  }
  assert.ok(logs[0].startsWith('ICS 수집(Cron)') && logs[0].includes('"same":2'), logs[0]);
  assert.ok(logs[1].includes('feeds 표가 아직 없음'), logs[1]);
  assert.ok(!logs.join('\n').includes('EXAMPLEtoken'));
});

test('FEEDS_PER_RUN만큼만, 오래 안 받은 것부터', async () => {
  const env = makeEnv({ FEEDS_PER_RUN: '2' });
  web.clear();
  for (let i = 1; i <= 3; i++) {
    const url = `https://calendar.example.invalid/${i}.ics`;
    web.set(url, googleCalendar());
    const user = await addTestUser(env, { sub: `sub-${i}`, email: `s${i}@example.invalid` });
    await env.DB.prepare("INSERT INTO feeds (user_id, kind, url, last_try_at) VALUES (?, 'google', ?, ?)")
      .bind(user.id, await seal(env, url), `2026-11-0${i}T00:00:00+09:00`)
      .run();
  }
  assert.equal((await collectDue(env, NOW)).feeds, 2);
  const rows = (await env.DB.prepare('SELECT user_id, last_ok_at FROM feeds ORDER BY user_id').all()).results;
  assert.deepEqual(rows.map((r) => Boolean(r.last_ok_at)), [true, true, false]);
});

test('기간·힌트 도우미', () => {
  const w = syncWindow(NOW);
  assert.equal(w.from.toISOString(), '2026-10-09T15:00:00.000Z'); // 한국 10/10 0시
  assert.equal(w.to.toISOString(), '2027-05-10T15:00:00.000Z'); // 한국 2027-05-11 0시
  assert.equal(urlHint('https://calendar.google.com/calendar/ical/x/private-abcdef/basic.ics'), 'calendar.google.com/…cdef');
  assert.equal(urlHint('https://myetl.snu.ac.kr/feeds/calendars/user_abc123.ics'), 'myetl.snu.ac.kr/…c123');
});
