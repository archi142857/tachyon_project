// 7_items.js 시험 (담당: 서버 세션). 사람·일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-09T03:00:00Z'); // 한국 11/9(월) 12:00
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
  const add = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();
  const task = (user, title, due, extra = {}) =>
    add(
      'INSERT INTO tasks (user_id, title, due, minutes, done, source, ext_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      user.id, title, due, extra.minutes ?? null, extra.done ?? 0, extra.source ?? 'memo', extra.ext ?? `memo:${title}`,
    );
  const event = (user, title, start, end, source = 'memo') =>
    add('INSERT INTO events (user_id, title, start, "end", source, ext_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', user.id, title, start, end, source, `x:${title}`);
  const ids = {
    report: (await task(a, '예시 보고서', '2026-11-13T23:59:00+09:00', { minutes: 600 })).id,
    quiz: (await task(a, '예시 퀴즈', '2026-11-10T09:00:00+09:00', { minutes: 30 })).id,
    later: (await task(a, '예시 먼 과제', '2026-12-20T23:59:00+09:00')).id,
    noDue: (await task(a, '예시 언젠가', null)).id,
    doneOne: (await task(a, '예시 끝낸 것', '2026-11-05T23:59:00+09:00', { done: 1 })).id,
    etlTask: (await task(a, '예시 과제 [예시 과목]', '2026-11-12T23:59:00+09:00', { source: 'etl', ext: 'event-assignment-1' })).id,
    bTask: (await task(b, '예시 남의 할 일', '2026-11-11T23:59:00+09:00')).id,
    class: (await event(a, '예시 수업', '2026-11-09T10:00:00+09:00', '2026-11-09T11:15:00+09:00', 'google')).id,
    fest: (await event(a, '예시 축제', '2026-11-12', '2026-11-14')).id,
    nextWeek: (await event(a, '예시 다음 주', '2026-11-16T10:00:00+09:00', '2026-11-16T11:00:00+09:00')).id,
    lastSun: (await event(a, '예시 지난 일요일 종일', '2026-11-08', '2026-11-09')).id,
    bEvent: (await event(b, '예시 남의 일정', '2026-11-10T10:00:00+09:00', '2026-11-10T11:00:00+09:00')).id,
  };
  const cookieOf = async (user) => (await makeSessionCookie(env, user.id)).split(';')[0];
  return { env, a, b, ids, cookieA: await cookieOf(a), cookieB: await cookieOf(b) };
}

function call(env, cookie, path, { method = 'GET', body } = {}) {
  const headers = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, makeCtx());
}
const read = async (res) => ({ status: res.status, data: await res.json() });

test('할 일 3개: 안 끝낸 내 것만, 여유 적은 순(rankTasks), 몰린 주 경고', async () => {
  const { env, cookieA, ids } = await setup();
  const { status, data } = await read(await call(env, cookieA, '/api/tasks?limit=3'));
  assert.equal(status, 200);
  // 내일 아침 퀴즈(여유 0.8일) → 600분짜리 보고서(1.2일) → eTL 과제(3.5일). 순서 계산은 4_night.js rankTasks 그대로
  assert.deepEqual(
    data.tasks.map((t) => [t.id, t.slack_days]),
    [[ids.quiz, 0.8], [ids.report, 1.2], [ids.etlTask, 3.5]],
  );
  assert.ok(data.tasks.every((t) => t.done === 0 && 'slack_days' in t && !('user_id' in t)));
  assert.equal(typeof data.warning === 'string' || data.warning === null, true);

  const all = (await read(await call(env, cookieA, '/api/tasks'))).data.tasks;
  assert.equal(all.length, 5); // 끝낸 것·남의 것 빼고
  assert.equal(all.at(-1).id, ids.noDue); // 마감 없는 것은 맨 뒤

  const done = (await read(await call(env, cookieA, '/api/tasks?done=1'))).data.tasks;
  assert.deepEqual(done.map((t) => t.id), [ids.doneOne]);
  assert.equal((await call(env, cookieA, '/api/tasks?done=maybe')).status, 400);
});

test('주간 달력: 기간과 겹치는 내 일정만(종일·시각 섞여도 맞게)', async () => {
  const { env, cookieA, ids } = await setup();
  const { status, data } = await read(await call(env, cookieA, '/api/events?from=2026-11-09&to=2026-11-16'));
  assert.equal(status, 200);
  assert.deepEqual(data.events.map((e) => e.id), [ids.class, ids.fest]); // 지난 일요일 종일(end=11-09)·다음 주·남의 것 빠짐
  assert.deepEqual(data.events[1], { id: ids.fest, title: '예시 축제', start: '2026-11-12', end: '2026-11-14', place: null, source: 'memo', important: 0 });
  const dflt = (await read(await call(env, cookieA, '/api/events'))).data.events; // 기본: 오늘부터 7일
  assert.deepEqual(dflt.map((e) => e.id), [ids.class, ids.fest]);
  for (const q of ['from=2026-11-16&to=2026-11-09', 'from=2026-11-01&to=2027-03-01', 'from=11/9&to=11/16']) {
    assert.equal((await call(env, cookieA, `/api/events?${q}`)).status, 400, q);
  }
});

test('남의 것은 읽히지도 고쳐지지도 지워지지도 않는다(404)', async () => {
  const { env, cookieB, ids } = await setup();
  assert.equal((await call(env, cookieB, `/api/tasks/${ids.report}`, { method: 'PATCH', body: { done: true } })).status, 404);
  assert.equal((await call(env, cookieB, `/api/tasks/${ids.report}`, { method: 'DELETE' })).status, 404);
  assert.equal((await call(env, cookieB, `/api/events/${ids.fest}`, { method: 'PATCH', body: { title: '예시 가로채기' } })).status, 404);
  assert.equal((await call(env, cookieB, `/api/events/${ids.fest}`, { method: 'DELETE' })).status, 404);
  const mine = (await read(await call(env, cookieB, '/api/tasks'))).data.tasks;
  assert.deepEqual(mine.map((t) => t.title), ['예시 남의 할 일']);
  const row = await env.DB.prepare('SELECT done FROM tasks WHERE id = ?').bind(ids.report).first();
  assert.equal(row.done, 0);
  assert.equal((await call(env, null, '/api/tasks')).status, 401);
});

test('체크하면 끝(task_done 기록), 내 메모 할 일은 제목·마감도 고친다', async () => {
  const { env, cookieA, ids } = await setup();
  const { status, data } = await read(await call(env, cookieA, `/api/tasks/${ids.quiz}`, { method: 'PATCH', body: { done: true } }));
  assert.equal(status, 200);
  assert.equal(data.task.done, 1);
  const log = await env.DB.prepare("SELECT user_id, action, detail FROM log WHERE action = 'task_done'").first();
  assert.equal(JSON.parse(log.detail).id, ids.quiz);
  // 끝낸 일 목록: 방금 끝낸 것이 맨 위(done_at = 끝낸 시각), 기록 없이 끝나 있던 것은 뒤
  const done = (await read(await call(env, cookieA, '/api/tasks?done=1'))).data.tasks;
  assert.deepEqual(done.map((t) => t.id), [ids.quiz, ids.doneOne]);
  assert.match(done[0].done_at, /^2026-11-09T12:00/);
  assert.equal(done[1].done_at, null);

  const edited = await read(await call(env, cookieA, `/api/tasks/${ids.report}`, { method: 'PATCH', body: { title: '  예시 보고서   초안 ', due: '2026-11-14', minutes: 240 } }));
  assert.deepEqual([edited.data.task.title, edited.data.task.due, edited.data.task.minutes], ['예시 보고서 초안', '2026-11-14', 240]);
  for (const body of [{ minutes: 0 }, { due: '11월 14일' }, { title: '' }, { done: 'yes' }, { nothing: 1 }]) {
    assert.equal((await call(env, cookieA, `/api/tasks/${ids.report}`, { method: 'PATCH', body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(env, cookieA, `/api/tasks/${ids.noDue}`, { method: 'DELETE' })).status, 200);
  assert.equal(await env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(ids.noDue).first(), null);
});

test('캘린더에서 온 것: 체크·중요 표시는 되고, 제목·시각 고치기와 지우기는 막는다(409)', async () => {
  const { env, cookieA, ids } = await setup();
  assert.equal((await call(env, cookieA, `/api/tasks/${ids.etlTask}`, { method: 'PATCH', body: { done: true, minutes: 90 } })).status, 200);
  const blocked = await read(await call(env, cookieA, `/api/tasks/${ids.etlTask}`, { method: 'PATCH', body: { title: '예시 바꾼 제목' } }));
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /eTL에서 고쳐/);
  assert.equal((await call(env, cookieA, `/api/tasks/${ids.etlTask}`, { method: 'DELETE' })).status, 409);

  const star = await read(await call(env, cookieA, `/api/events/${ids.class}`, { method: 'PATCH', body: { important: true } }));
  assert.equal(star.data.event.important, 1);
  assert.equal((await call(env, cookieA, `/api/events/${ids.class}`, { method: 'PATCH', body: { place: '예시 302동' } })).status, 409);
  assert.equal((await call(env, cookieA, `/api/events/${ids.class}`, { method: 'DELETE' })).status, 409);
});

test('내 일정 고치기: 시각 모양·순서 확인', async () => {
  const { env, cookieA, ids } = await setup();
  const ok = await read(await call(env, cookieA, `/api/events/${ids.nextWeek}`, { method: 'PATCH', body: { start: '2026-11-17T14:00:00+09:00', end: '2026-11-17T15:30:00+09:00', place: '예시 301동' } }));
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.data.event.start, ok.data.event.end, ok.data.event.place], ['2026-11-17T14:00:00+09:00', '2026-11-17T15:30:00+09:00', '예시 301동']);
  for (const body of [
    { end: '2026-11-17T13:00:00+09:00' }, // start보다 앞
    { start: '2026-11-17', end: '2026-11-17T15:00:00+09:00' }, // 종일·시각 섞임
    { start: '2026-11-17 14:00' },
    { start: null },
  ]) {
    assert.equal((await call(env, cookieA, `/api/events/${ids.nextWeek}`, { method: 'PATCH', body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(env, cookieA, `/api/events/${ids.fest}`, { method: 'PATCH', body: { end: '2026-11-13' } })).status, 200); // 종일 하루로 줄이기
  assert.equal((await call(env, cookieA, '/api/events/abc', { method: 'PATCH', body: {} })).status, 404);
  assert.equal((await call(env, cookieA, `/api/events/${ids.fest}/x`)).status, 404);
});
