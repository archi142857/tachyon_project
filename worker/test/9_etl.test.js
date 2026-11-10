// 9_etl.js 시험 (컨셉 세션, 11-10). 토큰·강의·공지·파일은 모두 지어낸 예시다(가짜 eTL만 씀).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { calendar, vevent } from './ics_fixtures.js';
import { checkToken, collectDue, collectUser, handle, nextLink, noticeEvents, query, tagOf, termNames, toDue } from '../9_etl.js';
import { collectUser as collectIcs } from '../2_collect_ics.js';
import { mightHaveDates, noticeText } from '../prompts/etl_notice.js';
import { seal } from '../lib/secret.js';

const NOW = Date.parse('2026-11-10T07:00:00Z'); // 한국 16:00
const TOKEN = `10260~${'EXAMPLEtoken'.repeat(6)}`; // 모양만 진짜와 같은 지어낸 토큰
const BAD_TOKEN = `10260~${'REVOKEDtoken'.repeat(6)}`;

// 가짜 eTL(Canvas)·Claude. 부른 주소를 모아 둔다.
const calls = [];
let filesStatus = 403; // 과목 103은 파일 탭이 닫혀 있다
let aiReplies = [];
let coursesStatus = 200;
const realFetch = globalThis.fetch;
const realNow = Date.now;

const j = (data, init = {}) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });

async function fakeFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  calls.push(url);
  if (url.startsWith('https://api.anthropic.com/')) {
    const input = aiReplies.shift() || { items: [] };
    return j({ model: 'claude-haiku-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'answer', input }], usage: { input_tokens: 600, output_tokens: 50 } });
  }
  const u = new URL(url);
  assert.equal(u.origin, 'https://myetl.snu.ac.kr', '토큰은 eTL에만 보낸다');
  const auth = (init.headers && init.headers.authorization) || '';
  if (auth !== `Bearer ${TOKEN}`) return new Response('{"errors":[{"message":"Invalid access token."}]}', { status: 401 });
  const p = u.pathname;
  if (p === '/api/v1/users/self') return j({ id: '1', name: '예시 학생' });
  if (p === '/api/v1/courses') {
    if (coursesStatus !== 200) return new Response('{}', { status: coursesStatus });
    if (u.searchParams.get('page') === '2') return j([{ id: '103', name: '예시 화학', term: { name: '2026년 2학기' } }]);
    return j(
      [
        { id: '101', name: '예시 생물', term: { name: '2026년 2학기' } },
        { id: '102', name: '지난 학기 과목', term: { name: '2026년 1학기' } },
        { id: '9', access_restricted_by_date: true },
      ],
      { headers: { link: '<https://myetl.snu.ac.kr/api/v1/courses?page=2&per_page=100>; rel="next", <https://evil.example/steal>; rel="last"' } },
    );
  }
  if (p === '/api/v1/courses/101/assignments')
    return j([
      { id: '11', name: '과제 1', due_at: '2026-11-20T14:59:59Z', published: true, submission: { workflow_state: 'submitted', submitted_at: '2026-11-09T10:00:00Z' } },
      { id: '12', name: '과제 2', due_at: null, published: true, submission: { workflow_state: 'unsubmitted' } },
    ]);
  if (p === '/api/v1/courses/103/assignments') return j([{ id: '31', name: '보고서', due_at: '2026-11-25T05:00:00Z', submission: { workflow_state: 'unsubmitted' } }]);
  if (p === '/api/v1/announcements') {
    assert.deepEqual(u.searchParams.getAll('context_codes[]'), ['course_101', 'course_103']);
    return j([
      { id: '501', title: '[중간고사 안내]', message: '<p>중간고사는 11월 18일(수) 오후 2시~3시 15분, 26동 101호</p>', posted_at: '2026-11-05T01:00:00Z', html_url: 'https://myetl.snu.ac.kr/courses/101/discussion_topics/501', context_code: 'course_101' },
      { id: '502', title: '과제 안내', message: '<p>과제 2를 올렸어요</p>', posted_at: '2026-11-06T01:00:00Z', html_url: 'https://myetl.snu.ac.kr/courses/103/discussion_topics/502', context_code: 'course_103' },
      { id: '503', title: '다른 과목 공지', message: '<p>휴강</p>', posted_at: '2026-11-06T01:00:00Z', context_code: 'course_999' },
    ]);
  }
  if (p === '/api/v1/courses/101/files')
    return j([{ id: '701', display_name: '1주차 강의자료.pdf', created_at: '2026-09-02T00:00:00Z', url: 'https://myetl.snu.ac.kr/files/701/download?download_frd=1&verifier=SECRETVERIFIER' }]);
  if (p === '/api/v1/courses/103/files') return new Response('{}', { status: filesStatus });
  if (p === '/api/v1/calendar_events')
    return j([{ id: '801', title: '현장 학습', start_at: '2026-11-21T01:00:00Z', end_at: '2026-11-21T05:00:00Z', location_name: '예시 장소', all_day: false, context_code: 'course_101' }]);
  return new Response('{}', { status: 404 });
}

test.before(() => {
  Date.now = () => NOW;
  globalThis.fetch = fakeFetch;
});
test.after(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
});
test.beforeEach(() => {
  calls.length = 0;
  filesStatus = 403;
  coursesStatus = 200;
  aiReplies = [{ items: [{ kind: 'exam', title: '중간고사', date: '2026-11-18', time: '14:00', end_time: '15:15', place: '26동 101호' }] }];
});

const req = (path, init = {}) => new Request(`https://tachyon.example.invalid${path}`, init);
const put = (token) => req('/api/etl', { method: 'PUT', body: JSON.stringify({ token }) });
const rows = (env, sql, ...args) => env.DB.sqlite.prepare(sql).all(...args).map((r) => ({ ...r }));

async function setup(extra = {}) {
  const env = makeEnv({ ANTHROPIC_API_KEY: 'test-key', ...extra });
  const user = await addTestUser(env);
  return { env, user };
}

/** DB 어디에도 토큰·파일 내려받기 검증값이 남지 않았는지 */
function assertNoSecrets(env) {
  for (const { name } of rows(env, "SELECT name FROM sqlite_master WHERE type = 'table'")) {
    const text = JSON.stringify(rows(env, `SELECT * FROM ${name}`));
    assert.ok(!text.includes(TOKEN), `${name}에 토큰 원문`);
    assert.ok(!text.includes('SECRETVERIFIER') && !text.includes('verifier='), `${name}에 내려받기 주소`);
  }
}

test('토큰 모양: 비밀번호처럼 짧거나 띄어쓰기가 있으면 eTL에 보내지도 않는다', async () => {
  assert.ok(checkToken('mypassword1!').error.includes('비밀번호가 아니라'));
  assert.ok(checkToken('pass word with spaces and more than forty characters long').error);
  assert.ok(checkToken('').error);
  assert.equal(checkToken(` Bearer ${TOKEN} `).token, TOKEN);
  const { env, user } = await setup();
  const res = await handle(put('mypassword1!'), env, makeCtx(), user);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
  assert.equal(rows(env, 'SELECT * FROM etl').length, 0);
});

test('eTL이 받지 않는 토큰은 저장하지 않는다', async () => {
  const { env, user } = await setup();
  const res = await handle(put(BAD_TOKEN), env, makeCtx(), user);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /받지 않아요/);
  assert.equal(rows(env, 'SELECT * FROM etl').length, 0);
});

test('연결하면 바로 받는다: 이번 학기 과목만, 과제(제출하면 끝), 공지, 강의자료 목록, 과목 일정, 공지 속 시험', async () => {
  const { env, user } = await setup();
  const res = await handle(put(TOKEN), env, makeCtx(), user);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.connected, true);
  assert.deepEqual(
    { courses: data.result.courses, tasks: data.result.tasks, notices: data.result.notices, files: data.result.files, calendar: data.result.calendar, ai: data.result.ai },
    { courses: 2, tasks: 3, notices: 2, files: 1, calendar: 1, ai: 1 },
  );
  assert.ok(!calls.some((u) => u.includes('evil.example')), "eTL 밖 '다음 쪽'은 따라가지 않는다");
  assert.ok(!calls.some((u) => u.includes('/courses/102/')), '지난 학기 과목은 안 부른다');

  const tasks = rows(env, "SELECT title, due, done, ext_id FROM tasks WHERE source = 'etl' ORDER BY ext_id");
  assert.deepEqual(tasks, [
    { title: '과제 1', due: '2026-11-20T23:59:00+09:00', done: 1, ext_id: 'event-assignment-11' },
    { title: '과제 2', due: null, done: 0, ext_id: 'event-assignment-12' },
    { title: '보고서', due: '2026-11-25T14:00:00+09:00', done: 0, ext_id: 'event-assignment-31' },
  ]);

  const items = rows(env, 'SELECT kind, course, title, url, posted_at, tag, ext_id FROM etl_items ORDER BY ext_id');
  assert.deepEqual(items, [
    { kind: 'file', course: '예시 생물', title: '1주차 강의자료.pdf', url: 'https://myetl.snu.ac.kr/courses/101/files/701', posted_at: '2026-09-02T09:00:00+09:00', tag: null, ext_id: 'file-701' },
    { kind: 'notice', course: '예시 생물', title: '[중간고사 안내]', url: 'https://myetl.snu.ac.kr/courses/101/discussion_topics/501', posted_at: '2026-11-05T10:00:00+09:00', tag: 'exam', ext_id: 'notice-501' },
    { kind: 'notice', course: '예시 화학', title: '과제 안내', url: 'https://myetl.snu.ac.kr/courses/103/discussion_topics/502', posted_at: '2026-11-06T10:00:00+09:00', tag: 'none', ext_id: 'notice-502' },
  ]);
  assert.equal(calls.filter((u) => u.startsWith('https://api.anthropic.com/')).length, 1, '낱말이 없는 공지는 AI를 부르지 않는다');

  const events = rows(env, 'SELECT title, start, "end", place, source, ext_id FROM events ORDER BY source, ext_id');
  assert.deepEqual(events, [
    { title: '현장 학습', start: '2026-11-21T10:00:00+09:00', end: '2026-11-21T14:00:00+09:00', place: '예시 장소', source: 'etl', ext_id: 'api-calendar-801' },
    { title: '예시 생물 중간고사', start: '2026-11-18T14:00:00+09:00', end: '2026-11-18T15:15:00+09:00', place: '26동 101호', source: 'notice', ext_id: 'notice-501-0' },
  ]);
  assertNoSecrets(env);
  const log = rows(env, 'SELECT action, detail FROM log ORDER BY id').map((r) => r.action);
  assert.deepEqual(log, ['etl_connect', 'llm', 'etl_sync']);

  const list = await (await handle(req('/api/etl/items'), env, makeCtx(), user)).json();
  assert.deepEqual(list.notices.map((n) => n.title), ['과제 안내', '[중간고사 안내]']);
  assert.equal(list.files[0].url, 'https://myetl.snu.ac.kr/courses/101/files/701');
});

test('다시 받아도 줄이 늘지 않고, 사용자가 고친 공지 일정은 덮지 않는다', async () => {
  const { env, user } = await setup();
  await handle(put(TOKEN), env, makeCtx(), user);
  env.DB.sqlite.prepare("UPDATE events SET title = '중간고사(내가 고침)' WHERE source = 'notice'").run();
  const before = rows(env, 'SELECT count(*) AS n FROM events')[0].n;
  const r = await collectUser(env, user.id, { force: true });
  assert.equal(r.ok, true);
  assert.equal(r.ai, 0, '이미 읽은 공지는 다시 AI로 읽지 않는다');
  assert.equal(rows(env, 'SELECT count(*) AS n FROM events')[0].n, before);
  assert.equal(rows(env, "SELECT title FROM events WHERE source = 'notice'")[0].title, '중간고사(내가 고침)');
  assert.equal(rows(env, 'SELECT count(*) AS n FROM etl_items')[0].n, 3);
});

test('eTL ICS 주소도 있으면 과제 이름·마감은 ICS 것을 두고 제출 여부만 올린다', async () => {
  const { env, user } = await setup();
  await env.DB.prepare("INSERT INTO feeds (user_id, kind, url) VALUES (?, 'etl', ?)").bind(user.id, await seal(env, 'https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics')).run();
  await env.DB.prepare("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, '과제 1 [예시 생물]', '2026-11-20T23:59:00+09:00', 'etl', 'event-assignment-11')").bind(user.id).run();
  await env.DB.prepare("INSERT INTO etl (user_id, token) VALUES (?, ?)").bind(user.id, await seal(env, TOKEN)).run();
  await collectUser(env, user.id, { force: true });
  const t = rows(env, "SELECT title, done FROM tasks WHERE ext_id = 'event-assignment-11'");
  assert.deepEqual(t, [{ title: '과제 1 [예시 생물]', done: 1 }]);
});

test('ICS 수집은 eTL API가 넣은 과목 일정(api-…)을 지우지 않고, ICS에 있는 과목 일정은 두 번 넣지 않는다', async () => {
  const { env, user } = await setup();
  const icsUrl = 'https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLEtokenabcd.ics';
  const ics = calendar(vevent(['UID:event-assignment-11', 'SUMMARY:과제 1 [예시 생물]', 'DTSTART;VALUE=DATE:20261120T000000', 'DTEND;VALUE=DATE:20261120T000000']));
  const realFake = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    (typeof input === 'string' ? input : input.url) === icsUrl ? new Response(ics, { status: 200, headers: { 'content-type': 'text/calendar' } }) : realFake(input, init);
  try {
    await env.DB.prepare("INSERT INTO feeds (user_id, kind, url) VALUES (?, 'etl', ?)").bind(user.id, await seal(env, icsUrl)).run();
    await env.DB.prepare("INSERT INTO etl (user_id, token) VALUES (?, ?)").bind(user.id, await seal(env, TOKEN)).run();
    await collectUser(env, user.id, { force: true });
    assert.equal(rows(env, "SELECT count(*) AS n FROM events WHERE ext_id = 'api-calendar-801'")[0].n, 1);
    await collectIcs(env, user.id, { force: true });
    assert.equal(rows(env, "SELECT count(*) AS n FROM events WHERE ext_id = 'api-calendar-801'")[0].n, 1, 'ICS 수집 뒤에도 남는다');
    // ICS에 같은 과목 일정이 생기면 api- 줄은 다음 차례에 빠진다
    env.DB.sqlite.prepare("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '현장 학습', '2026-11-21T10:00:00+09:00', 'etl', 'event-calendar-event-801')").run(user.id);
    await collectUser(env, user.id, { force: true });
    assert.equal(rows(env, "SELECT count(*) AS n FROM events WHERE title = '현장 학습'")[0].n, 1);
  } finally {
    globalThis.fetch = realFake;
  }
});

test('강의 목록이 401이면 두 번 만에 멈추고, 과목 하나의 403은 건너뛴다', async () => {
  const { env, user } = await setup();
  await handle(put(TOKEN), env, makeCtx(), user);
  assert.equal(rows(env, 'SELECT last_error FROM etl')[0].last_error, null, '파일 탭이 닫힌 과목(403)은 실패가 아니다');
  coursesStatus = 401;
  for (let i = 0; i < 2; i++) assert.equal((await collectUser(env, user.id, { force: true })).ok, false);
  const status = await (await handle(req('/api/etl'), env, makeCtx(), user)).json();
  assert.equal(status.dead, true);
  assert.match(status.last_error, /다시 연결/);
  const before = calls.length;
  const summary = await collectDue(env, NOW + 2 * 3600 * 1000);
  assert.equal(summary.users, 0, '멈춘 연결은 Cron이 건너뛴다');
  assert.equal(calls.length, before);
});

test('Cron은 요청 한도가 모자라면 시작하지 않고, 지금 받기는 1분에 한 번', async () => {
  const { env, user } = await setup({ ETL_REQUESTS_PER_RUN: '10' });
  await env.DB.prepare('INSERT INTO etl (user_id, token) VALUES (?, ?)').bind(user.id, await seal(env, TOKEN)).run();
  assert.equal((await collectDue(env)).users, 0);
  const first = await (await handle(req('/api/etl/collect', { method: 'POST' }), env, makeCtx(), user)).json();
  assert.equal(first.result.ok, true);
  const again = await (await handle(req('/api/etl/collect', { method: 'POST' }), env, makeCtx(), user)).json();
  assert.equal(again.result.recent, true);
});

test('연결 끊기: 토큰·목록·과목 일정을 지우고(ICS가 없으면 과제도), 공지에서 찾은 시험은 남긴다', async () => {
  const { env, user } = await setup();
  await handle(put(TOKEN), env, makeCtx(), user);
  const res = await handle(req('/api/etl', { method: 'DELETE' }), env, makeCtx(), user);
  assert.equal((await res.json()).connected, false);
  assert.equal(rows(env, 'SELECT count(*) AS n FROM etl')[0].n, 0);
  assert.equal(rows(env, 'SELECT count(*) AS n FROM etl_items')[0].n, 0);
  assert.equal(rows(env, "SELECT count(*) AS n FROM tasks WHERE source = 'etl'")[0].n, 0);
  assert.deepEqual(rows(env, 'SELECT source FROM events').map((r) => r.source), ['notice']);
});

test('원격 D1에 표가 아직 없으면 503(준비 중)', async () => {
  const { env, user } = await setup();
  env.DB.sqlite.exec('DROP TABLE etl_items; DROP TABLE etl;');
  const res = await handle(req('/api/etl'), env, makeCtx(), user);
  assert.equal(res.status, 503);
});

test('작은 도우미: 학기 이름, 마감 시각, 다음 쪽, 묻는 글, 공지 거르기·글, 공지 → 일정', () => {
  assert.deepEqual(termNames(Date.parse('2026-11-10T03:00:00Z')), ['2026년 2학기']);
  assert.deepEqual(termNames(Date.parse('2027-01-10T03:00:00Z')), ['2026년 2학기', '2026년 겨울학기']);
  assert.deepEqual(termNames(Date.parse('2026-12-20T03:00:00Z')), ['2026년 2학기', '2026년 겨울학기']);
  assert.deepEqual(termNames(Date.parse('2026-07-01T03:00:00Z')), ['2026년 1학기', '2026년 여름학기']);
  assert.deepEqual(termNames(Date.parse('2026-03-01T03:00:00Z')), ['2026년 1학기']);
  assert.equal(toDue('2026-11-20T14:59:59Z'), '2026-11-20T23:59:00+09:00');
  assert.equal(toDue('2026-11-20T05:30:20Z'), '2026-11-20T14:30:00+09:00');
  assert.equal(toDue(null), null);
  assert.equal(nextLink('<https://myetl.snu.ac.kr/api/v1/x?page=2>; rel="next"'), 'https://myetl.snu.ac.kr/api/v1/x?page=2');
  assert.equal(nextLink('<https://evil.example/x>; rel="next"'), null);
  assert.equal(query({ 'context_codes[]': ['course_1', 'course_2'], per_page: 50 }), 'context_codes[]=course_1&context_codes[]=course_2&per_page=50');
  assert.equal(mightHaveDates('공지', '다음 주 수요일은 휴강입니다'), true);
  assert.equal(mightHaveDates('과제 안내', '과제 2를 올렸어요'), false);
  assert.equal(noticeText('<p>중간고사&nbsp;안내</p><script>x()</script><br>26동 &amp; 101호'), '중간고사 안내\n26동 & 101호');
  const notice = { course: '예시 생물', ext_id: 'notice-9' };
  const items = [
    { kind: 'cancel', title: '휴강', date: '2026-11-12', time: '?', end_time: '?', place: '?' },
    { kind: 'makeup', title: '보강', date: '2026-11-14', time: '19:00', end_time: '?', place: '같은 강의실' },
    { kind: 'exam', title: '퀴즈', date: '?', time: '?', end_time: '?', place: '?' }, // 날짜 모름 → 뺌
    { kind: 'exam', title: '기말고사', date: '2027-09-01', time: '10:00', end_time: '11:00', place: '?' }, // 6개월 밖 → 뺌
  ];
  assert.deepEqual(noticeEvents(notice, items, NOW), [
    { extId: 'notice-9-0', title: '예시 생물 휴강', start: '2026-11-12', end: '2026-11-13', place: null },
    { extId: 'notice-9-1', title: '예시 생물 보강', start: '2026-11-14T19:00:00+09:00', end: null, place: '같은 강의실' },
  ]);
  assert.equal(tagOf(items), 'exam');
  assert.equal(tagOf([]), 'none');
});
