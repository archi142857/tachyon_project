// 8_calendar_feed.js 시험 (담당: 서버 세션). 사람·일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { escapeText, fold } from '../8_calendar_feed.js';
import { parseIcs } from '../lib/ics.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-09T03:00:00Z');
const realNow = Date.now;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
});

async function setup() {
  const env = makeEnv();
  const a = await addTestUser(env, { sub: 'sub-a', email: 'a@example.invalid' });
  const b = await addTestUser(env, { sub: 'sub-b', email: 'b@example.invalid' });
  const ev = (user, title, start, end, source, place = null) =>
    env.DB.prepare('INSERT INTO events (user_id, title, start, "end", place, source, ext_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(user.id, title, start, end, place, source, `x:${title}`)
      .run();
  const task = (user, title, due, done = 0, source = 'etl') =>
    env.DB.prepare('INSERT INTO tasks (user_id, title, due, done, source, ext_id) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, title, due, done, source, `t:${title}`).run();
  await ev(a, '예시 스터디, 2회차; 복습', '2026-11-10T15:00:00+09:00', '2026-11-10T16:30:00+09:00', 'memo', '예시 301동');
  await ev(a, '예시 수업', '2026-11-11T09:00:00+09:00', '2026-11-11T10:15:00+09:00', 'timetable');
  await ev(a, '예시 축제', '2026-11-12', '2026-11-14', 'memo');
  await ev(a, '예시 시각 모름', '2026-11-13T18:00:00+09:00', null, 'memo');
  await ev(a, '예시 구글 일정', '2026-11-10T12:00:00+09:00', '2026-11-10T13:00:00+09:00', 'google'); // 이미 폰에 있음 → 뺌
  await ev(a, '예시 아주 옛날', '2026-01-01T10:00:00+09:00', '2026-01-01T11:00:00+09:00', 'memo'); // 기간 밖
  await task(a, '예시 보고서 [예시 과목]', '2026-11-13T23:59:00+09:00');
  await task(a, '예시 끝낸 과제', '2026-11-12T23:59:00+09:00', 1);
  await task(a, '예시 언젠가', null, 0, 'memo');
  await ev(b, '예시 남의 일정', '2026-11-10T10:00:00+09:00', '2026-11-10T11:00:00+09:00', 'memo');
  return { env, a, b };
}

const get = (env, path, cookie) => worker.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }), env, makeCtx());
const cookieOf = async (env, user) => (await makeSessionCookie(env, user.id)).split(';')[0];

test('내 구독 주소: 로그인해야 받고, 사람마다 다르다', async () => {
  const { env, a, b } = await setup();
  assert.equal((await get(env, '/api/calendar')).status, 401);
  const mine = await (await get(env, '/api/calendar', await cookieOf(env, a))).json();
  const theirs = await (await get(env, '/api/calendar', await cookieOf(env, b))).json();
  assert.match(mine.url, new RegExp(`^${ORIGIN}/api/calendar/${a.id}\\.[\\w-]{24}\\.ics$`));
  assert.equal(mine.webcal, mine.url.replace('https://', 'webcal://'));
  assert.notEqual(mine.url.split('/').at(-1).split('.')[1], theirs.url.split('/').at(-1).split('.')[1]);
});

test('ICS: 내 메모·시간표 일정과 안 끝낸 마감만, 구글에서 온 것·남의 것·기간 밖은 뺀다', async () => {
  const { env, a } = await setup();
  const { url } = await (await get(env, '/api/calendar', await cookieOf(env, a))).json();
  const res = await get(env, new URL(url).pathname);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/calendar/);
  const text = await res.text();
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n') && text.endsWith('END:VCALENDAR\r\n'));
  for (const line of text.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `75바이트 넘음: ${line}`);

  // 우리 수집기로 다시 읽어 보면(왕복) 시각이 그대로다
  const { items } = parseIcs(text, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') });
  const got = Object.fromEntries(items.map((it) => [it.title, [it.start, it.end, it.place]]));
  assert.deepEqual(got, {
    '예시 스터디, 2회차; 복습': ['2026-11-10T15:00:00+09:00', '2026-11-10T16:30:00+09:00', '예시 301동'],
    '예시 수업': ['2026-11-11T09:00:00+09:00', '2026-11-11T10:15:00+09:00', ''],
    '예시 축제': ['2026-11-12', '2026-11-14', ''],
    '예시 시각 모름': ['2026-11-13T18:00:00+09:00', '2026-11-13T18:00:00+09:00', ''],
    '마감 23:59 · 예시 보고서 [예시 과목]': ['2026-11-13', '2026-11-14', ''],
  });
  assert.ok(text.includes('SUMMARY:예시 스터디\\, 2회차\\; 복습'));
  assert.ok(!text.includes('예시 남의 일정') && !text.includes('예시 구글 일정') && !text.includes('예시 끝낸 과제'));
});

test('서명이 틀리거나 남의 번호에 내 서명을 붙이면 404', async () => {
  const { env, a, b } = await setup();
  const { url } = await (await get(env, '/api/calendar', await cookieOf(env, a))).json();
  const sig = new URL(url).pathname.split('.')[1];
  assert.equal((await get(env, `/api/calendar/${a.id}.${'x'.repeat(24)}.ics`)).status, 404);
  assert.equal((await get(env, `/api/calendar/${b.id}.${sig}.ics`)).status, 404);
  assert.equal((await get(env, `/api/calendar/${a.id}.${sig}`)).status, 404);
  assert.equal((await get(env, `/api/calendar/999.${sig}.ics`)).status, 404);
});

test('글 이스케이프와 75바이트 접기(한글을 자르지 않음)', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = `SUMMARY:${'가'.repeat(60)}`;
  const folded = fold(long);
  const parts = folded.split('\r\n ');
  assert.ok(parts.length > 1);
  assert.equal(parts.join(''), long);
  for (const [i, p] of parts.entries()) assert.ok(new TextEncoder().encode(p).length <= (i ? 74 : 75));
});

test('/api/health는 아직 안 넣은 비밀값 이름만 알려 준다(값은 안 보임)', async () => {
  const env = makeEnv({ GOOGLE_CLIENT_ID: 'example-id' });
  const data = await (await get(env, '/api/health')).json();
  assert.deepEqual(data.missing, ['GOOGLE_CLIENT_SECRET', 'ANTHROPIC_API_KEY']);
  assert.ok(!JSON.stringify(data).includes('example-id'));
});
