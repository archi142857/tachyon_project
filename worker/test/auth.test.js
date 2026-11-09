// lib/auth.js · lib/secret.js · lib/time.js 시험 (담당: 서버 세션)

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSessionCookie, clearSessionCookie, readSession, getUser, getCookie, SESSION_COOKIE } from '../lib/auth.js';
import { seal, unseal } from '../lib/secret.js';
import { kstIso, kstDate, kstMidnight } from '../lib/time.js';
import { makeEnv, addTestUser } from './helpers/server.js';

const withCookie = (setCookie) => new Request('https://tachyon.example.invalid/', { headers: { cookie: setCookie.split(';')[0] } });
const OTHER = { APP_SECRET: 'another-secret-0123456789' };

test('주소 잠그기: 다시 열면 같고, 키가 다르면 못 연다', async () => {
  const env = makeEnv();
  const url = 'https://calendar.example.invalid/private-EXAMPLE/basic.ics';
  const sealed = await seal(env, url);
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+$/);
  assert.ok(!sealed.includes('EXAMPLE'));
  assert.notEqual(await seal(env, url), sealed); // 매번 다른 글(같은 주소인지도 안 보이게)
  assert.equal(await unseal(env, sealed), url);
  await assert.rejects(unseal(OTHER, sealed));
  await assert.rejects(seal({ APP_SECRET: 'short' }, 'x'), /APP_SECRET/);
});

test('로그인 쿠키: 맞으면 uid, 고치거나 기한이 지나거나 키가 다르면 null', async () => {
  const env = makeEnv();
  const now = Date.parse('2026-11-09T00:00:00Z');
  const set = await makeSessionCookie(env, 7, now);
  assert.match(set, /^tachyon_session=.+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal((await readSession(withCookie(set), env, now + 1000)).uid, 7);

  const [payload, sig] = set.split(';')[0].split('=')[1].split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 8, exp: 9999999999 })).toString('base64url');
  assert.equal(await readSession(withCookie(`${SESSION_COOKIE}=${forged}.${sig}`), env, now), null);
  assert.equal(await readSession(withCookie(`${SESSION_COOKIE}=${payload}.${sig}x`), env, now), null);
  assert.equal(await readSession(withCookie(set), env, now + 31 * 86400000), null);
  assert.equal(await readSession(withCookie(set), OTHER, now), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test('getUser: 쿠키의 uid로 users 행을 찾는다', async () => {
  const env = makeEnv();
  const user = await addTestUser(env);
  const found = await getUser(withCookie(await makeSessionCookie(env, user.id)), env);
  assert.equal(found.email, 'student@example.invalid');
  assert.equal(await getUser(new Request('https://tachyon.example.invalid/'), env), null);
});

test('쿠키 읽기', () => {
  const r = new Request('https://x.invalid/', { headers: { cookie: 'a=1; tachyon_session=abc.def; b=2' } });
  assert.equal(getCookie(r, 'tachyon_session'), 'abc.def');
  assert.equal(getCookie(r, 'none'), null);
});

test('시각 글자는 schema.sql 모양(+09:00, 종일은 날짜만)', () => {
  const ms = Date.parse('2026-11-09T15:30:05.123Z'); // 한국 11/10 00:30
  assert.equal(kstIso(ms), '2026-11-10T00:30:05+09:00');
  assert.equal(kstDate(ms), '2026-11-10');
  assert.equal(new Date(kstMidnight(ms)).toISOString(), '2026-11-09T15:00:00.000Z');
});
