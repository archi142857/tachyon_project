// 11_admin.js 시험 (담당: 서버 세션). 사람·기록은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { isAdmin } from '../11_admin.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-13T03:00:00Z'); // 한국 11/13(금) 12:00
const realNow = Date.now;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
});

async function setup({ admins = 'admin@example.invalid, Other@Example.invalid' } = {}) {
  const env = makeEnv();
  if (admins !== null) env.ADMIN_EMAILS = admins;
  const admin = await addTestUser(env, { sub: 'sub-admin', email: 'admin@example.invalid', name: '예시 개발자' });
  const plain = await addTestUser(env, { sub: 'sub-plain', email: 'plain@example.invalid', name: '예시 사용자' });
  const cookie = async (u) => (await makeSessionCookie(env, u.id)).split(';')[0];
  const log = (userId, action, detail, at) =>
    env.DB.sqlite.prepare('INSERT INTO log (user_id, action, detail, at) VALUES (?, ?, ?, ?)').run(userId, action, detail === null ? null : JSON.stringify(detail), at);
  return { env, admin, plain, adminCookie: await cookie(admin), plainCookie: await cookie(plain), log };
}

const get = async (env, cookie, path = '/api/admin/summary') => {
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }), env, makeCtx());
  return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') };
};

test('개발자가 아니면 404로 숨긴다: 로그인 안 함 · 목록에 없음 · ADMIN_EMAILS 없음(아무도 못 봄)', async () => {
  const { env, plainCookie, adminCookie } = await setup();
  assert.equal((await get(env, null)).status, 404);
  assert.equal((await get(env, plainCookie)).status, 404);
  assert.equal((await get(env, adminCookie)).status, 200);
  const none = await setup({ admins: null });
  assert.equal((await get(none.env, none.adminCookie)).status, 404);
  assert.equal(isAdmin({ ADMIN_EMAILS: ' x@example.invalid ,OTHER@example.invalid' }, { email: 'other@example.invalid' }), true); // 빈칸·대소문자 무시
  assert.equal(isAdmin({ ADMIN_EMAILS: 'x@example.invalid' }, { email: 'xx@example.invalid' }), false);
});

test('합계: 날마다 쓴 사람(Cron·AI 줄 빼고)·새 사용자·메모, 행동별 횟수, 팝업 흐름, AI 횟수·토큰·대략 비용, 수집, 오류, 표 크기', async () => {
  const { env, admin, plain, adminCookie, log } = await setup();
  const today = '2026-11-13T10:00:00+09:00';
  const yesterday = '2026-11-12T21:00:00+09:00';
  log(plain.id, 'login', null, today);
  log(plain.id, 'popup_save', { memo_id: 1 }, today);
  log(plain.id, 'popup_cancel', { memo_id: 2 }, today);
  log(admin.id, 'popup_save', { memo_id: 3 }, yesterday);
  log(plain.id, 'llm', { use: 'memo_popup', model: 'claude-haiku-5-5', ms: 1200, in: 600000, out: 100000 }, today);
  log(plain.id, 'llm', { use: 'memo_popup', model: 'claude-haiku-5-5', ms: 1400, in: 400000, out: 100000 }, yesterday);
  log(null, 'llm_fail', { use: 'night', error: '예시' }, today);
  log(admin.id, 'ics_sync', { changes: 3 }, today); // Cron이라 '쓴 사람'에 안 셈
  log(null, 'error_report', { fp: 'x' }, today);
  log(plain.id, 'login', null, '2026-10-01T09:00:00+09:00'); // 기간 밖
  env.DB.sqlite.prepare("INSERT INTO memos (user_id, text, created_at) VALUES (?, '예시 비밀 메모', ?)").run(plain.id, today);
  env.DB.sqlite.prepare('UPDATE users SET created_at = ? WHERE id = ?').run('2026-10-01T09:00:00+09:00', admin.id);

  const { status, data, cache } = await get(env, adminCookie);
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(cache, 'private, no-store');
  assert.deepEqual([data.from, data.to, data.days, data.daily.length], ['2026-10-31', '2026-11-13', 14, 14]);
  assert.deepEqual(data.daily.at(-1), { day: '2026-11-13', users: 1, newUsers: 1, memos: 1, actions: 7 }); // 쓴 사람은 plain만(admin은 ics_sync뿐), 줄은 7개 다
  assert.deepEqual(data.daily.at(-2), { day: '2026-11-12', users: 1, newUsers: 0, memos: 0, actions: 2 });
  assert.equal(data.activeUsers, 2);
  assert.deepEqual(data.actions.find((a) => a.action === 'popup_save'), { action: 'popup_save', total: 2, days: { '2026-11-13': 1, '2026-11-12': 1 } });
  assert.equal(data.actions.find((a) => a.action === 'login').total, 1); // 기간 밖 줄은 빠짐
  assert.deepEqual(data.popup, { memos: 1, saved: 2, edited: 0, cancelled: 1 });
  assert.deepEqual([data.ai.calls, data.ai.failures, data.ai.input, data.ai.output, data.ai.costUsd], [2, 1, 1000000, 200000, 0.2]); // Haiku 5.5: $0.10·$0.50 / 백만
  assert.deepEqual(data.ai.byModel, [{ model: 'claude-haiku-5-5', use: 'memo_popup', calls: 2, avgMs: 1300, input: 1000000, output: 200000, costUsd: 0.2 }]);
  assert.deepEqual(data.ai.failuresByUse, { night: 1 });
  assert.deepEqual(data.collect.ics, { ok: 1, fail: 0 });
  assert.deepEqual(data.errors, { reports: 1, feedback: 0 });
  assert.deepEqual([data.tables.users, data.tables.memos], [2, 1]);
  assert.ok(data.tables.log_about >= 10);
  const text = JSON.stringify(data);
  for (const secret of ['@example.invalid', '예시 비밀 메모', '예시 사용자', '예시 개발자']) assert.ok(!text.includes(secret), `${secret}이 새면 안 됨`);
});

test('days는 1~30, 다른 주소·방법은 막는다', async () => {
  const { env, adminCookie } = await setup();
  for (const bad of ['0', '31', '2.5', 'x']) assert.equal((await get(env, adminCookie, `/api/admin/summary?days=${bad}`)).status, 400, bad);
  assert.equal((await get(env, adminCookie, '/api/admin/summary?days=30')).data.daily.length, 30);
  assert.equal((await get(env, adminCookie, '/api/admin/other')).status, 404);
  const post = await worker.fetch(new Request(`${ORIGIN}/api/admin/summary`, { method: 'POST', headers: { cookie: adminCookie, origin: ORIGIN } }), env, makeCtx());
  assert.equal(post.status, 405);
});
