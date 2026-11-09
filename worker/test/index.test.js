// worker/index.js 시험 (담당: 서버 세션)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { routeFor, loadModule, CRONS } from '../index.js';
import { makeEnv, makeCtx } from './helpers/server.js';

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
  env.DB.prepare = () => {
    throw new Error('예시 DB 고장');
  };
  const realError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(req('/api/health'), env, makeCtx());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, '서버에서 오류가 났다');
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
