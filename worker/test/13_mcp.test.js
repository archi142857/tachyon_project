// 13_mcp.js 시험: AI 앱 연결(OAuth + MCP). 사람·일정·주소는 모두 지어낸 예시다.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { b64url, utf8 } from '../lib/secret.js';

const ORIGIN = 'https://tachyon.example.invalid';
const AI = 'https://ai.example.invalid';
const REDIRECT = `${AI}/oauth/callback`;
const NOW = Date.parse('2026-11-19T01:00:00Z'); // 한국 11/19(목) 10:00
const VERIFIER = 'verifier-예시-0123456789-abcdefghijklmnopqrstuvwxyz';
const realNow = Date.now;
const realFetch = globalThis.fetch;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
});

async function setup() {
  const env = makeEnv();
  const a = await addTestUser(env, { sub: 'sub-a', email: 'a@example.invalid' });
  const b = await addTestUser(env, { sub: 'sub-b', email: 'b@example.invalid' });
  const cookieOf = async (u) => (await makeSessionCookie(env, u.id)).split(';')[0];
  const add = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();
  return { env, a, b, cookie: await cookieOf(a), cookieB: await cookieOf(b), add };
}

function req(env, path, { method = 'GET', body, cookie, origin = ORIGIN, headers = {}, ctx = makeCtx() } = {}) {
  const h = { ...headers };
  if (origin) h.origin = origin;
  if (cookie) h.cookie = cookie;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: h, body, redirect: 'manual' }), env, ctx);
}

const form = (data) => new URLSearchParams(data).toString();
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const challenge = async (v) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(v))));

async function authorizeUrl(clientId, { redirect = REDIRECT, state = 'state-예시' } = {}) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: await challenge(VERIFIER), code_challenge_method: 'S256', state, resource: `${ORIGIN}/mcp` });
  return `/oauth/authorize?${q}`;
}

/** 등록 → 허락 화면 → 허락 → 토큰. { clientId, access, refresh } */
async function connect(s, { name = '예시 AI' } = {}) {
  const reg = await req(s.env, '/oauth/register', { method: 'POST', origin: AI, body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT] }), headers: { 'content-type': 'application/json' } });
  assert.equal(reg.status, 201);
  const clientId = (await reg.json()).client_id;
  const consent = await req(s.env, await authorizeUrl(clientId), { cookie: s.cookie });
  const html = await consent.text();
  const ask = /name="ask" value="([^"]+)"/.exec(html)[1];
  const back = await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookie, body: form({ ask, allow: '1' }), headers: formHeaders });
  const code = new URL(back.headers.get('location')).searchParams.get('code');
  const tok = await req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: VERIFIER }), headers: formHeaders });
  assert.equal(tok.status, 200);
  const t = await tok.json();
  return { clientId, access: t.access_token, refresh: t.refresh_token };
}

async function rpc(env, token, method, params, { headers = {}, id = 1 } = {}) {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: AI, ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }), // id: null = 알림(id 없음)
    }),
    env,
    makeCtx(),
  );
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

const tool = async (env, token, name, args = {}) => {
  const { body } = await rpc(env, token, 'tools/call', { name, arguments: args });
  return body.result;
};

test('안내 문서 · 토큰 없으면 401 + 안내 주소 · CORS', async () => {
  const { env } = await setup();
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const prm = await (await req(env, path)).json();
    assert.equal(prm.resource, `${ORIGIN}/mcp`);
    assert.deepEqual(prm.authorization_servers, [ORIGIN]);
  }
  const as = await (await req(env, '/.well-known/oauth-authorization-server')).json();
  assert.equal(as.issuer, ORIGIN);
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.equal((await req(env, '/.well-known/openid-configuration')).status, 404);

  const none = await rpc(env, '', 'initialize', {});
  assert.equal(none.status, 401);
  const res = await req(env, '/mcp', { method: 'POST', origin: AI, body: '{}' });
  assert.match(res.headers.get('www-authenticate'), /resource_metadata="https:\/\/tachyon\.example\.invalid\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal((await req(env, '/mcp', { method: 'OPTIONS', origin: AI })).status, 204);
  assert.equal((await req(env, '/mcp', { method: 'GET', origin: AI })).status, 405);
});

test('허락 화면: 로그인 전엔 로그인부터 · 이름은 이스케이프 · 모르는 앱·주소는 거기서 멈춤', async () => {
  const s = await setup();
  const reg = await req(s.env, '/oauth/register', { method: 'POST', origin: AI, body: JSON.stringify({ client_name: '<b>예시</b>', redirect_uris: [REDIRECT] }) });
  const { client_id } = await reg.json();
  assert.match(client_id, /^dcr\./);

  const path = await authorizeUrl(client_id);
  const login = await req(s.env, path);
  assert.equal(login.status, 302);
  const next = new URL(login.headers.get('location')).searchParams.get('next');
  assert.equal(next, path);

  const html = await (await req(s.env, path, { cookie: s.cookie })).text();
  assert.match(html, /&#60;b&#62;예시&#60;\/b&#62;에 Tachyon을 연결할까요/);
  assert.match(html, /a@example\.invalid 계정 · 돌아갈 곳 <b>ai\.example\.invalid<\/b>/);

  assert.equal((await req(s.env, await authorizeUrl('dcr.망가진'), { cookie: s.cookie })).status, 400);
  assert.equal((await req(s.env, await authorizeUrl(client_id, { redirect: 'https://evil.example.invalid/cb' }), { cookie: s.cookie })).status, 400);
  const bad = await req(s.env, '/oauth/register', { method: 'POST', origin: AI, body: JSON.stringify({ redirect_uris: ['http://evil.example.invalid/cb'] }) });
  assert.equal(bad.status, 400);

  // PKCE 없으면 앱으로 오류를 돌려보낸다
  const noPkce = await req(s.env, `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=st`, { cookie: s.cookie });
  const loc = new URL(noPkce.headers.get('location'));
  assert.equal(loc.searchParams.get('error'), 'invalid_request');
  assert.equal(loc.searchParams.get('state'), 'st');
});

test('허락 → code(state·iss) → 토큰 · 거절 · 다른 계정 · PKCE 틀림', async () => {
  const s = await setup();
  const reg = await (await req(s.env, '/oauth/register', { method: 'POST', origin: AI, body: JSON.stringify({ client_name: '예시 AI', redirect_uris: [REDIRECT] }) })).json();
  const html = await (await req(s.env, await authorizeUrl(reg.client_id), { cookie: s.cookie })).text();
  const ask = /name="ask" value="([^"]+)"/.exec(html)[1];

  const other = await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookieB, body: form({ ask, allow: '1' }), headers: formHeaders });
  assert.equal(other.status, 403);
  const foreign = await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookie, origin: AI, body: form({ ask, allow: '1' }), headers: formHeaders });
  assert.equal(foreign.status, 403); // 다른 사이트에서 보낸 허락은 안 받는다

  const deny = new URL((await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookie, body: form({ ask }), headers: formHeaders })).headers.get('location'));
  assert.equal(deny.searchParams.get('error'), 'access_denied');

  const back = new URL((await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookie, body: form({ ask, allow: '1' }), headers: formHeaders })).headers.get('location'));
  assert.equal(back.origin + back.pathname, REDIRECT);
  assert.equal(back.searchParams.get('state'), 'state-예시');
  assert.equal(back.searchParams.get('iss'), ORIGIN);
  const code = back.searchParams.get('code');

  const token = (extra) => req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, ...extra }), headers: formHeaders });
  const wrong = await token({ code_verifier: 'x'.repeat(43) });
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).error, 'invalid_grant');
  const ok = await token({ code_verifier: VERIFIER });
  const t = await ok.json();
  assert.equal(t.token_type, 'Bearer');
  assert.equal(t.expires_in, 3600);
  assert.ok(t.access_token && t.refresh_token);
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  Date.now = () => NOW + 6 * 60 * 1000; // code는 5분
  assert.equal((await token({ code_verifier: VERIFIER })).status, 400);
  Date.now = () => NOW;
});

test('MCP: 옛 방식(initialize) · 새 방식(server/discover) · 머리글 검사', async () => {
  const s = await setup();
  const { access } = await connect(s);

  const init = await rpc(s.env, access, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'tachyon');
  assert.equal(init.body.result.resultType, undefined);
  const old = await rpc(s.env, access, 'initialize', { protocolVersion: '2024-11-05' });
  assert.equal(old.body.result.protocolVersion, '2025-11-25');
  const note = await rpc(s.env, access, 'notifications/initialized', {}, { id: null });
  assert.equal(note.status, 202);

  const list = await rpc(s.env, access, 'tools/list', {}, { headers: { 'mcp-protocol-version': '2025-06-18' } });
  const names = list.body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['get_briefing', 'get_schedule', 'find_free_time', 'list_tasks', 'get_etl', 'list_memos', 'add_event', 'add_task']);
  assert.ok(list.body.result.tools.every((t) => t.inputSchema.type === 'object' && !('run' in t)));
  assert.equal(list.body.result.tools.find((t) => t.name === 'get_etl').annotations.readOnlyHint, true);
  assert.equal(list.body.result.tools.find((t) => t.name === 'add_event').annotations.readOnlyHint, false);

  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
  const modern = { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' };
  const disc = await rpc(s.env, access, 'server/discover', { _meta: meta }, { headers: modern });
  assert.equal(disc.body.result.resultType, 'complete');
  assert.ok(disc.body.result.supportedVersions.includes('2026-07-28'));
  assert.equal(disc.body.result._meta['io.modelcontextprotocol/serverInfo'].name, 'tachyon');
  const tl = await rpc(s.env, access, 'tools/list', { _meta: meta }, { headers: { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' } });
  assert.equal(tl.body.result.resultType, 'complete');
  assert.equal(tl.body.result.cacheScope, 'public');

  const mismatch = await rpc(s.env, access, 'tools/list', { _meta: meta }, { headers: { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' } });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error.code, -32020);
  const noCaps = await rpc(s.env, access, 'server/discover', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } });
  assert.equal(noCaps.status, 400);
  assert.equal(noCaps.body.error.code, -32602);
  const future = await rpc(s.env, access, 'server/discover', { _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } });
  assert.equal(future.body.error.code, -32022);
  assert.equal(future.body.error.data.requested, '2099-01-01');
  assert.equal((await rpc(s.env, access, 'resources/list', {})).body.error.code, -32601);
  assert.equal((await rpc(s.env, access, 'tools/call', { name: 'delete_everything' })).body.error.code, -32602);
});

test('도구: 일정 · 빈 시간 · 할 일 · eTL · 메모 · 브리핑', async () => {
  const s = await setup();
  const { access } = await connect(s);
  const event = (title, start, end, user = s.a) => s.add('INSERT INTO events (user_id, title, start, "end", source, ext_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', user.id, title, start, end, 'memo', `memo:${title}`);
  await event('예시 수업', '2026-11-19T13:00:00+09:00', '2026-11-19T14:30:00+09:00');
  await event('예시 축제', '2026-11-19', '2026-11-20');
  await event('예시 아침', '2026-11-20T09:30:00+09:00', '2026-11-20T10:00:00+09:00');
  await event('예시 겹침', '2026-11-20T09:45:00+09:00', '2026-11-20T11:00:00+09:00');
  await event('남의 일정', '2026-11-19T10:00:00+09:00', '2026-11-19T22:00:00+09:00', s.b);

  const sched = (await tool(s.env, access, 'get_schedule', { from: '2026-11-19', to: '2026-11-19' })).structuredContent;
  assert.equal(sched.today, '2026-11-19 (목)');
  assert.deepEqual(sched.events.map((e) => e.title).sort(), ['예시 수업', '예시 축제']);

  const free = (await tool(s.env, access, 'find_free_time', { from: '2026-11-19', to: '2026-11-20' })).structuredContent;
  assert.deepEqual(free.days, [
    { date: '2026-11-19 (목)', free: [{ start: '10:00', end: '13:00', minutes: 180 }, { start: '14:30', end: '22:00', minutes: 450 }], all_day: ['예시 축제'] },
    { date: '2026-11-20 (금)', free: [{ start: '11:00', end: '22:00', minutes: 660 }], all_day: [] },
  ]);
  const short = (await tool(s.env, access, 'find_free_time', { from: '2026-11-20', to: '2026-11-20', minutes: 30, day_start: '08:00', day_end: '12:00' })).structuredContent;
  assert.deepEqual(short.days[0].free, [{ start: '08:00', end: '09:30', minutes: 90 }, { start: '11:00', end: '12:00', minutes: 60 }]);
  const tooLong = await tool(s.env, access, 'find_free_time', { from: '2026-11-01', to: '2026-12-31' });
  assert.equal(tooLong.isError, true);

  await s.add("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, '예시 과제', '2026-11-21T23:59:00+09:00', 'etl', 'a1') RETURNING id", s.a.id);
  const tasks = (await tool(s.env, access, 'list_tasks')).structuredContent;
  assert.deepEqual(tasks.tasks.map((t) => t.title), ['예시 과제']);

  await s.add("INSERT INTO etl_items (user_id, kind, course, title, url, posted_at, ext_id) VALUES (?, 'notice', '예시 미적분', '예시 공지', 'https://etl.example.invalid/1', '2026-11-18T09:00:00+09:00', 'n1') RETURNING id", s.a.id);
  await s.add("INSERT INTO etl_items (user_id, kind, course, title, url, posted_at, ext_id) VALUES (?, 'file', '예시 물리', '예시 자료.pdf', 'https://etl.example.invalid/2', '2026-11-17T09:00:00+09:00', 'f1') RETURNING id", s.a.id);
  const etl = (await tool(s.env, access, 'get_etl', { course: '미적' })).structuredContent;
  assert.deepEqual(etl.notices.map((i) => i.title), ['예시 공지']);
  assert.deepEqual(etl.files, []);
  assert.deepEqual(Object.keys((await tool(s.env, access, 'get_etl', { kind: 'files' })).structuredContent), ['files']);

  await s.add("INSERT INTO memos (user_id, text) VALUES (?, '예시 메모') RETURNING id", s.a.id);
  const memos = (await tool(s.env, access, 'list_memos')).structuredContent;
  assert.equal(memos.memos.at(-1).text, '예시 메모');

  const brief = await tool(s.env, access, 'get_briefing');
  assert.equal(brief.isError, undefined);
  assert.ok(brief.structuredContent.briefing);
  assert.equal(JSON.parse(brief.content[0].text).today, '2026-11-19 (목)');
});

test('도구: 일정 · 할 일 넣기(시각 모양 맞춤 · 잘못이면 isError)', async () => {
  const s = await setup();
  const { access } = await connect(s);
  const ev = await tool(s.env, access, 'add_event', { title: '예시 스터디', start: '2026-11-21T15:00', place: '예시 도서관' });
  assert.equal(ev.structuredContent.event.start, '2026-11-21T15:00:00+09:00');
  assert.equal(ev.structuredContent.event.end, '2026-11-21T16:00:00+09:00');
  const day = await tool(s.env, access, 'add_event', { title: '예시 엠티', start: '2026-11-22', end: '2026-11-24' });
  assert.equal(day.structuredContent.event.end, '2026-11-24');
  const bad = await tool(s.env, access, 'add_event', { title: '예시', start: '내일 3시' });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /start/);

  const t1 = await tool(s.env, access, 'add_task', { title: '예시 보고서', due: '2026-11-25', minutes: 90 });
  assert.equal(t1.structuredContent.task.due, '2026-11-25T23:59:00+09:00');
  assert.equal(t1.structuredContent.task.minutes, 90);
  const t2 = await tool(s.env, access, 'add_task', { title: '예시 연락' });
  assert.equal(t2.structuredContent.task.due, null);
  const rows = await s.env.DB.prepare("SELECT action FROM log WHERE user_id = ? AND action IN ('item_add', 'ai_tool', 'ai_link')").bind(s.a.id).all();
  assert.ok(rows.results.some((r) => r.action === 'ai_link'));
  assert.equal(rows.results.filter((r) => r.action === 'item_add').length, 4);
});

test('refresh → 새 토큰 · 목록 · 끊으면 access·refresh 모두 안 먹음 · 계정 지우기', async () => {
  const s = await setup();
  const { access, refresh, clientId } = await connect(s);
  const refreshed = await req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }), headers: formHeaders });
  const t = await refreshed.json();
  assert.ok(t.access_token);
  assert.equal((await rpc(s.env, t.access_token, 'ping', {})).status, 200);
  assert.equal((await req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'refresh_token', refresh_token: access }), headers: formHeaders })).status, 400); // access로 refresh 못 함

  const list = await (await req(s.env, '/api/ai', { cookie: s.cookie })).json();
  assert.equal(list.mcp, `${ORIGIN}/mcp`);
  assert.equal(list.links.length, 1);
  assert.equal(list.links[0].client, '예시 AI');
  assert.equal(list.links[0].host, 'ai.example.invalid');
  assert.ok(list.links[0].used_at);
  assert.equal((await (await req(s.env, '/api/ai', { cookie: s.cookieB })).json()).links.length, 0);
  assert.equal((await req(s.env, `/api/ai/${list.links[0].id}`, { method: 'DELETE', cookie: s.cookieB })).status, 404); // 남의 연결

  assert.equal((await req(s.env, `/api/ai/${list.links[0].id}`, { method: 'DELETE', cookie: s.cookie })).status, 200);
  assert.equal((await rpc(s.env, access, 'ping', {})).status, 401);
  assert.equal((await req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'refresh_token', refresh_token: refresh }), headers: formHeaders })).status, 400);

  await connect(s);
  const del = await req(s.env, '/api/login/me', { method: 'DELETE', cookie: s.cookie, body: JSON.stringify({ confirm: true }) });
  assert.equal(del.status, 200);
  assert.equal((await s.env.DB.prepare('SELECT count(*) AS n FROM ai_links').first()).n, 0);
});

test('CIMD: client_id 주소의 문서로 확인 · 내 컴퓨터 주소는 포트 무시', async () => {
  const s = await setup();
  const CID = 'https://cli.example.invalid/client.json';
  globalThis.fetch = async (input) => {
    assert.equal(String(input), CID);
    return Response.json({ client_id: CID, client_name: '예시 CLI', redirect_uris: ['http://localhost/callback', 'myapp://cb'] });
  };
  try {
    const ok = await req(s.env, await authorizeUrl(CID, { redirect: 'http://localhost:53682/callback' }), { cookie: s.cookie });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /예시 CLI에 Tachyon을/);
    assert.equal((await req(s.env, await authorizeUrl(CID, { redirect: 'http://localhost:53682/other' }), { cookie: s.cookie })).status, 400);
    assert.equal((await req(s.env, await authorizeUrl(CID, { redirect: 'myapp://cb' }), { cookie: s.cookie })).status, 400); // https·localhost만
    globalThis.fetch = async () => Response.json({ client_id: 'https://other.example.invalid/x.json', redirect_uris: ['http://localhost/callback'] });
    assert.equal((await req(s.env, await authorizeUrl(CID, { redirect: 'http://localhost/callback' }), { cookie: s.cookie })).status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('ai_links 표가 아직 없으면: 토큰 503 · 목록 ready false · MCP 401', async () => {
  const s = await setup();
  s.env.DB.sqlite.exec('DROP TABLE ai_links');
  const reg = await (await req(s.env, '/oauth/register', { method: 'POST', origin: AI, body: JSON.stringify({ redirect_uris: [REDIRECT] }) })).json();
  const html = await (await req(s.env, await authorizeUrl(reg.client_id), { cookie: s.cookie })).text();
  const ask = /name="ask" value="([^"]+)"/.exec(html)[1];
  const code = new URL((await req(s.env, '/oauth/authorize', { method: 'POST', cookie: s.cookie, body: form({ ask, allow: '1' }), headers: formHeaders })).headers.get('location')).searchParams.get('code');
  const tok = await req(s.env, '/oauth/token', { method: 'POST', origin: AI, body: form({ grant_type: 'authorization_code', code, code_verifier: VERIFIER }), headers: formHeaders });
  assert.equal(tok.status, 503);
  const list = await (await req(s.env, '/api/ai', { cookie: s.cookie })).json();
  assert.equal(list.ready, false);
  assert.equal((await rpc(s.env, 'v1.x.y', 'ping', {})).status, 401);
});
