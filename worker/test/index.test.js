// worker/index.js 시험 (담당: 서버 세션)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { routeFor, loadModule, CRONS } from '../index.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { makeSessionCookie } from '../lib/auth.js';
import { forgetLimit } from '../lib/dberror.js';

const req = (path, init) => new Request(`https://tachyon.example.invalid${path}`, init);

test('주소 → 번호 파일', () => {
  assert.equal(routeFor('/api/login'), '1_login');
  assert.equal(routeFor('/api/login/callback'), '1_login');
  assert.equal(routeFor('/api/feeds/collect'), '2_collect_ics');
  assert.equal(routeFor('/api/memo/3/save'), '3_memo_popup');
  assert.equal(routeFor('/api/briefing/today'), '4_night');
  assert.equal(routeFor('/api/timetable'), '5_timetable_photo');
  assert.equal(routeFor('/api/feedback'), '6_feedback');
  assert.equal(routeFor('/api/tasks/12'), '7_items');
  assert.equal(routeFor('/api/events'), '7_items');
  assert.equal(routeFor('/api/calendar/1.abc.ics'), '8_calendar_feed');
  assert.equal(routeFor('/api/loginx'), null);
  assert.equal(routeFor('/'), null);
});

test('번호 파일: 있으면 불러오고, 아직 없으면 null', async () => {
  assert.equal(await loadModule('9_nothing'), null);
  assert.equal(await loadModule('5_does_not_exist_yet'), null);
  for (const name of ['1_login', '2_collect_ics', '3_memo_popup']) {
    assert.equal(typeof (await loadModule(name)).handle, 'function', name);
  }
});

test('/api/health는 DB 표 수, 모르는 주소는 404', async () => {
  const env = makeEnv();
  const health = await (await worker.fetch(req('/api/health'), env, makeCtx())).json();
  assert.equal(health.ok, true);
  assert.ok(health.tables >= 6);
  assert.equal((await worker.fetch(req('/api/nothing'), env, makeCtx())).status, 404);
  assert.equal((await worker.fetch(req('/week'), env, makeCtx())).status, 404); // 화면 파일은 web/(assets)이 먼저 낸다
});

test('번호 파일이 없으면 501, 다른 사이트의 쓰기 요청은 403, 로그인 없으면 user = null', async () => {
  const env = makeEnv();
  if (!(await loadModule('5_timetable_photo'))) assert.equal((await worker.fetch(req('/api/timetable'), env, makeCtx())).status, 501);
  const evil = await worker.fetch(req('/api/feeds', { method: 'PUT', headers: { origin: 'https://evil.example' }, body: '{}' }), env, makeCtx());
  assert.equal(evil.status, 403);
  assert.equal((await worker.fetch(req('/api/feeds'), env, makeCtx())).status, 401);
  assert.equal((await worker.fetch(req('/api/memo'), env, makeCtx())).status, 401); // AI 세션 파일도 user = null을 받는다
});

test('번호 파일이 던진 오류는 500 JSON으로 감싼다', async () => {
  const env = makeEnv();
  const user = await addTestUser(env);
  const cookie = (await makeSessionCookie(env, user.id)).split(';')[0];
  const realPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (/FROM users/.test(sql)) return realPrepare(sql); // 로그인 확인은 되고, 번호 파일의 DB 일에서 던진다
    throw new Error('예시 DB 고장');
  };
  const realError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(req('/api/feeds', { headers: { cookie } }), env, makeCtx());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, '서버에서 오류가 났다');
  } finally {
    console.error = realError;
  }
});

test('D1 쪽 사정(무료 하루 한도·바쁨)은 503과 안내 글, 오류 보고는 주소와 상관없이 \'서버 D1\' 하나로', async () => {
  const env = makeEnv();
  const user = await addTestUser(env);
  const cookie = (await makeSessionCookie(env, user.id)).split(';')[0];
  const realPrepare = env.DB.prepare.bind(env.DB);
  let message = '';
  env.DB.prepare = (sql) => {
    if (/FROM users/.test(sql)) return realPrepare(sql);
    throw new Error(message);
  };
  const jobs = [];
  const ctx = { ...makeCtx(), waitUntil: (p) => jobs.push(p) };
  const realError = console.error;
  console.error = () => {};
  try {
    message = "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan 예시";
    const res = await worker.fetch(req('/api/feeds', { headers: { cookie } }), env, ctx);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'db_limit');
    message = 'D1_ERROR: Network connection lost. 예시';
    const busy = await worker.fetch(req('/api/feeds', { headers: { cookie } }), env, ctx);
    assert.equal(busy.status, 503);
    assert.equal((await busy.json()).code, 'db_busy');
    await Promise.all(jobs);
    const health = await (await worker.fetch(req('/api/health'), { ...env, DB: { prepare: () => { throw new Error(message); } } }, makeCtx())).json();
    assert.equal(health.problem, 'busy');
    // 한도에 걸린 날엔 health의 작은 읽기가 지나가도: 이 Worker가 10분 안에 본 한도 오류를 같이 알린다
    const fine = { ...env, DB: { prepare: realPrepare } };
    const seen = await worker.fetch(req('/api/health'), fine, makeCtx());
    assert.equal(seen.status, 503);
    const body = await seen.json();
    assert.deepEqual([body.ok, body.problem, typeof body.tables], [false, 'limit', 'number']);
    assert.match(body.seen, /\+09:00$/);
    forgetLimit();
    assert.equal((await worker.fetch(req('/api/health'), fine, makeCtx())).status, 200);
  } finally {
    forgetLimit();
    console.error = realError;
  }
});

test('/api/health: D1이 답하지 않으면 503과 오류 글 첫 줄(긴 숫자는 지움)', async () => {
  const env = makeEnv();
  env.DB.prepare = () => {
    throw new Error('D1_ERROR: 예시 한도 초과 1234567890\n두 번째 줄');
  };
  const realError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(req('/api/health'), env, makeCtx());
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.db, 'D1_ERROR: 예시 한도 초과 #');
    assert.ok(Array.isArray(data.missing));
  } finally {
    console.error = realError;
  }
});

test('Cron: wrangler.toml과 같은 목록, 처리할 파일이 없으면 건너뛴다', async () => {
  const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  const crons = JSON.parse(/crons\s*=\s*(\[[^\]]*\])/.exec(toml)[1]);
  assert.deepEqual(crons.sort(), Object.keys(CRONS).sort());
  const realLog = console.log;
  console.log = () => {};
  try {
    await worker.scheduled({ cron: '0 0 1 1 *' }, makeEnv(), makeCtx()); // 모르는 Cron: 오류 없이 끝
    if (!(await loadModule('4_night'))) await worker.scheduled({ cron: '30 16 * * *' }, makeEnv(), makeCtx());
  } finally {
    console.log = realLog;
  }
});
