// 1_login.js 시험 (담당: 서버 세션). 구글 응답은 가짜, 사람은 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { safeNext } from '../1_login.js';
import { makeEnv, makeCtx } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const CLIENT_ID = 'example-client.apps.googleusercontent.com';

const realFetch = globalThis.fetch;
let tokenReply; // 가짜 구글 토큰 주소가 돌려줄 것
let tokenRequests = [];
test.before(() => {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url !== 'https://oauth2.googleapis.com/token') return new Response('unexpected', { status: 599 });
    tokenRequests.push(Object.fromEntries(new URLSearchParams(String(init.body))));
    return tokenReply();
  };
});
test.after(() => {
  globalThis.fetch = realFetch;
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function idToken(claims) {
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.signature`;
}
function googleSays(claims, status = 200) {
  tokenReply = () =>
    status === 200 ? Response.json({ access_token: 'x', id_token: idToken(claims), token_type: 'Bearer' }) : new Response('bad', { status });
}
const goodClaims = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: '1000000000000000000001',
  email: 'Student@Example.invalid',
  email_verified: true,
  name: '예시 학생',
  ...extra,
});

const env = () => makeEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'example-secret' });
const call = (e, path, init = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }), e, makeCtx());
const cookiesOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]);

async function login(e, { next = '/week', claims = goodClaims(), status = 200, tamperState = false } = {}) {
  const start = await call(e, `/api/login?next=${encodeURIComponent(next)}`);
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  const flowCookie = cookiesOf(start)[0];
  googleSays(claims, status);
  const state = tamperState ? 'wrong' : google.searchParams.get('state');
  const back = await call(e, `/api/login/callback?code=example-code&state=${state}`, { headers: { cookie: flowCookie } });
  return { start, google, back };
}

test('로그인 시작: 구글로 보내고, 범위는 이름·이메일만', async () => {
  const e = env();
  const { google, start } = await login(e);
  assert.equal(google.origin + google.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(google.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(google.searchParams.get('scope'), 'openid email profile');
  assert.equal(google.searchParams.get('redirect_uri'), `${ORIGIN}/api/login/callback`);
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  assert.match(start.headers.get('set-cookie'), /^tachyon_oauth=.+; Path=\/api\/login; Max-Age=600; HttpOnly; Secure; SameSite=Lax/);
});

test('구글에서 돌아오면 users 행을 만들고 로그인 쿠키를 주고 next로 보낸다', async () => {
  const e = env();
  tokenRequests = [];
  const { back } = await login(e);
  assert.equal(back.status, 302);
  assert.equal(back.headers.get('location'), `${ORIGIN}/week`);
  const cookies = cookiesOf(back);
  assert.ok(cookies.some((c) => c.startsWith('tachyon_session=') && c.length > 30));
  assert.ok(cookies.includes('tachyon_oauth='));
  assert.equal(tokenRequests[0].grant_type, 'authorization_code');
  assert.equal(tokenRequests[0].code, 'example-code');
  assert.ok(tokenRequests[0].code_verifier.length >= 43);

  const user = await e.DB.prepare('SELECT * FROM users').first();
  assert.equal(user.google_sub, '1000000000000000000001');
  assert.equal(user.email, 'student@example.invalid'); // 소문자로
  assert.equal(user.name, '예시 학생');
  assert.match(user.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/);
  assert.equal((await e.DB.prepare("SELECT count(*) n FROM log WHERE action = 'login'").first()).n, 1);

  // 내 정보 → 첫 설정 필요
  const session = cookies.find((c) => c.startsWith('tachyon_session='));
  const me = await (await call(e, '/api/login/me', { headers: { cookie: session } })).json();
  assert.deepEqual(me, { ok: true, user: { id: user.id, email: 'student@example.invalid', name: '예시 학생', dept: null, year: null }, needsSetup: true });
});

test('다시 로그인하면 같은 사람(google_sub로 찾음), 이메일·이름만 새로', async () => {
  const e = env();
  await login(e);
  await login(e, { claims: goodClaims({ name: '예시 학생(바뀐 이름)', email: 'new@example.invalid' }) });
  await login(e, { claims: goodClaims({ sub: '1000000000000000000002', email: 'other@example.invalid' }) });
  const rows = (await e.DB.prepare('SELECT * FROM users ORDER BY id').all()).results;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, '예시 학생(바뀐 이름)');
  assert.equal(rows[0].email, 'new@example.invalid');
});

test('첫 설정(학과·학년) 저장, 잘못된 값은 400', async () => {
  const e = env();
  const { back } = await login(e);
  const session = cookiesOf(back).find((c) => c.startsWith('tachyon_session='));
  const put = (body) => call(e, '/api/login/me', { method: 'PUT', headers: { cookie: session, origin: ORIGIN }, body: JSON.stringify(body) });

  const bad = await put({ dept: '예시학과', year: 12 });
  assert.equal(bad.status, 400);
  const ok = await (await put({ dept: '예시학과', year: 2 })).json();
  assert.equal(ok.needsSetup, false);
  assert.equal(ok.user.dept, '예시학과');
  assert.equal(ok.user.year, 2);
});

test('실패하면 화면으로 돌려보내며 login_error를 붙인다', async () => {
  const cases = [
    [{ tamperState: true }, 'state'],
    [{ status: 400 }, 'google'],
    [{ claims: goodClaims({ email_verified: false }) }, 'email'],
    [{ claims: goodClaims({ sub: undefined }) }, 'email'],
    [{ claims: goodClaims({ aud: 'someone-else' }) }, 'google'],
    [{ claims: goodClaims({ iss: 'https://evil.example' }) }, 'google'],
  ];
  for (const [opts, reason] of cases) {
    const e = env();
    const { back } = await login(e, opts);
    assert.equal(back.status, 302, reason);
    const target = new URL(back.headers.get('location'));
    assert.equal(target.searchParams.get('login_error'), reason, JSON.stringify(opts));
    assert.equal((await e.DB.prepare('SELECT count(*) n FROM users').first()).n, 0);
  }

  const e = env();
  const cancelled = await call(e, '/api/login/callback?error=access_denied');
  assert.equal(new URL(cancelled.headers.get('location')).searchParams.get('login_error'), 'denied');

  const noConfig = await call(makeEnv(), '/api/login');
  assert.equal(new URL(noConfig.headers.get('location')).searchParams.get('login_error'), 'config');
});

test('로그아웃은 쿠키를 지우고, 로그인 없이 내 정보는 401', async () => {
  const e = env();
  const out = await call(e, '/api/login/logout', { method: 'POST', headers: { origin: ORIGIN } });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /^tachyon_session=; .*Max-Age=0/);
  assert.equal((await call(e, '/api/login/me')).status, 401);
});

test('돌아갈 곳은 이 사이트 안의 경로만', () => {
  assert.equal(safeNext('/week?x=1'), '/week?x=1');
  for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/api/login', 'week']) {
    assert.equal(safeNext(bad), '/', String(bad));
  }
});

test('이미 로그인돼 있으면 콜백이 실패해도(같은 콜백이 두 번 오는 아이폰 홈 화면 앱) 오류 없이 돌아간다', async () => {
  const e = env();
  const { back } = await login(e, { next: '/week' });
  const session = cookiesOf(back).find((c) => c.startsWith('tachyon_session='));
  // 두 번째 콜백: 흐름 쿠키는 이미 지워졌고, 구글은 쓴 code에 invalid_grant
  googleSays(goodClaims(), 400);
  const again = await call(e, '/api/login/callback?code=example-code&state=old', { headers: { cookie: session } });
  assert.equal(again.status, 302);
  const target = new URL(again.headers.get('location'));
  assert.equal(target.pathname, '/');
  assert.equal(target.searchParams.get('login_error'), null);
  assert.ok(!cookiesOf(again).some((c) => c.startsWith('tachyon_session=')), '로그인 쿠키는 그대로 둔다');
  // 로그인 안 된 사람에게는 그대로 오류를 알린다
  const stranger = await call(e, '/api/login/callback?code=example-code&state=old');
  assert.equal(new URL(stranger.headers.get('location')).searchParams.get('login_error'), 'state');
});

test('계정 지우기: confirm이 있어야 하고, 내 줄·시간표 사진만 모두 지우고 로그아웃', async () => {
  const photos = new Map([['timetable/1/a.jpg', 1], ['timetable/1/b.jpg', 1], ['timetable/2/c.jpg', 1], ['timetable/10/d.jpg', 1]]);
  const PHOTOS = {
    list: async ({ prefix }) => ({ objects: [...photos.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    delete: async (keys) => [].concat(keys).forEach((k) => photos.delete(k)),
  };
  const e = makeEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'example-secret', PHOTOS });
  const { back } = await login(e); // 사용자 1
  const session = cookiesOf(back).find((c) => c.startsWith('tachyon_session='));
  const other = await e.DB.prepare("INSERT INTO users (google_sub, email) VALUES ('sub-other', 'other@example.invalid') RETURNING id").first();
  assert.equal(other.id, 2);
  for (const id of [1, 2]) {
    const run = (sql) => e.DB.sqlite.prepare(sql).run(id);
    run("INSERT INTO feeds (user_id, kind, url) VALUES (?, 'etl', 'v1.example.sealed')");
    run("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '예시 일정', '2026-11-10T10:00:00+09:00', 'memo', 'memo:1')");
    run("INSERT INTO tasks (user_id, title, source, ext_id) VALUES (?, '예시 할 일', 'memo', 'memo:2')");
    run("INSERT INTO memos (user_id, text) VALUES (?, '예시 메모')");
    run("INSERT INTO briefings (user_id, date, text) VALUES (?, '2026-11-10', '{}')");
    run("INSERT INTO log (user_id, action) VALUES (?, 'popup_save')");
  }
  const del = (body) => call(e, '/api/login/me', { method: 'DELETE', headers: { origin: ORIGIN, cookie: session }, body: body && JSON.stringify(body) });
  assert.equal((await del()).status, 400);
  assert.equal((await del({ confirm: 'yes' })).status, 400);
  const res = await del({ confirm: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /^tachyon_session=; .*Max-Age=0/);

  const left = (table) => e.DB.sqlite.prepare(`SELECT user_id, count(*) n FROM ${table} GROUP BY user_id ORDER BY user_id`).all().map((r) => [r.user_id, r.n]);
  for (const table of ['feeds', 'events', 'tasks', 'memos', 'briefings']) assert.deepEqual(left(table), [[2, 1]], table);
  assert.deepEqual(e.DB.sqlite.prepare('SELECT id FROM users').all().map((r) => r.id), [2]);
  assert.deepEqual(e.DB.sqlite.prepare('SELECT user_id, action FROM log ORDER BY id').all().map((r) => [r.user_id, r.action]), [[2, 'popup_save'], [null, 'account_delete']]);
  assert.deepEqual([...photos.keys()], ['timetable/2/c.jpg', 'timetable/10/d.jpg']);
  // 지운 뒤 같은 쿠키는 로그인 안 된 것
  assert.equal((await call(e, '/api/login/me', { headers: { cookie: session } })).status, 401);
});
