// 13. AI 앱 연결 — 원격 MCP 서버 (담당: 서버 세션)
//
// Claude·ChatGPT·Gemini 같은 AI 앱이 Tachyon의 일정·빈 시간·할 일·eTL 공지와 강의자료·브리핑·메모를 읽고, 일정·할 일을 넣게 한다
// (11-19 사람 "클로드에서 새로운 일정을 등록하려고 하면, 기존의 타키온 캘린더를 읽고 빈 시간을 알려준다던지, etl에서 받아온 자료들을 읽고 답변").
// 사람은 AI 앱 설정에 주소 하나(https://<배포 주소>/mcp)만 넣고, 뜨는 Tachyon 허락 화면에서 '허락'을 누른다.
//
//   POST /mcp                          MCP(JSON-RPC, 답은 JSON 하나 · SSE 없음). Authorization: Bearer <access>. 없거나 틀리면 401 + 아래 안내 주소
//   GET  /.well-known/oauth-protected-resource[/mcp]   이 MCP의 로그인 서버가 어디인지(RFC 9728)
//   GET  /.well-known/oauth-authorization-server       로그인 서버 정보(RFC 8414)
//   POST /oauth/register               AI 앱 등록(DCR, RFC 7591). 표 없이 client_id 안에 돌아갈 주소를 잠가 넣는다
//   GET  /oauth/authorize              허락 화면(Tachyon 로그인 안 했으면 로그인부터) · POST = 허락/거절 버튼
//   POST /oauth/token                  code → 토큰 · refresh → 새 토큰
//   GET  /api/ai                       { mcp, links } 연결 주소와 연결된 AI 앱 목록(화면 메뉴의 'AI 에이전트 연결')
//   DELETE /api/ai/:id                 연결 끊기 → 그 앱의 토큰이 바로 안 먹는다
//
// 로그인(OAuth 2.1): PKCE(S256)만, 비밀 없는 앱(token_endpoint_auth_method none)만. client_id가 https 주소면 그 문서(CIMD)를 받아
//   돌아갈 주소를 확인하고, 'dcr.'로 시작하면 /oauth/register가 준 것. 내 컴퓨터 주소(http://localhost)는 포트를 따지지 않는다(RFC 8252).
// code·토큰은 표 없이 APP_SECRET으로 잠근 글(lib/secret.js seal). 연결 하나 = ai_links 줄 하나 → 줄을 지우면(끊기·계정 지우기) 바로 무효.
//   code 5분 · access 1시간 · refresh 90일(새로 받을 때마다 새 refresh).
//   ponytail: code·옛 refresh는 기한 안에 다시 쓸 수 있다(PKCE 비밀·토큰을 가진 그 앱만). 한 번만 쓰게 하려면 쓴 것을 표에 적는다.
// 도구는 화면이 쓰는 주소(7_items·4_night·3_memo_popup·9_etl)를 안에서 그대로 부른다 → 검사·순서가 화면과 같다. 넣은 일정은 구글 캘린더로도 간다(12_gcal).
// 표(ai_links)가 원격 D1에 아직 없으면: 허락 화면까지는 되고 토큰 받기가 503, 목록은 ready: false.
// log: ai_link { client }(연결) · ai_unlink(끊기) · ai_tool { tool }(도구 부름)

import { seal, unseal, b64url, utf8 } from './lib/secret.js';
import { json, fail, readJson } from './lib/http.js';
import { logAction, logStatement } from './lib/log.js';
import { kstDate, kstIso, DAY_MS } from './lib/time.js';
import { handle as items } from './7_items.js';
import { handle as night } from './4_night.js';
import { handle as memo } from './3_memo_popup.js';
import { listItems } from './9_etl.js';
import { afterWrite } from './12_gcal.js';
import { STUDY_TOOLS, STUDY_RESOURCES, StudyError } from './14_study.js';

const MODERN = '2026-07-28';
export const VERSIONS = [MODERN, '2025-11-25', '2025-06-18', '2025-03-26'];
const SERVER = { name: 'tachyon', title: 'Tachyon', version: '1.0.0' };
const CODE_MS = 5 * 60 * 1000;
const ASK_MS = 10 * 60 * 1000;
const ACCESS_S = 60 * 60;
const REFRESH_MS = 90 * DAY_MS;
const CACHE = { ttlMs: 60 * 60 * 1000, cacheScope: 'public' };
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
};
const INSTRUCTIONS =
  "Tachyon is a Seoul National University student's second-brain app: one calendar (classes, eTL course events, Google Calendar, events added in Tachyon), " +
  'tasks ranked by slack (eTL assignments included), eTL announcements and course materials, quick memos, and a daily briefing. ' +
  'All times are KST (+09:00). Before suggesting a time for something new, call find_free_time. ' +
  'Before add_event or add_task, confirm the title and time with the user. Answer in the user’s language. ' +
  'For studying or exam prep (tutor, quiz, study room, 공부방, 시험 공부), call study_rooms first and follow the playbook it returns.';

export async function handle(request, env, ctx, user) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  if (pathname === '/api/ai' || pathname.startsWith('/api/ai/')) return links(request, env, url, user);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (pathname === '/mcp') return mcp(request, env, ctx, url);
  if (method === 'GET' && (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp')) {
    return open({ resource: `${url.origin}/mcp`, authorization_servers: [url.origin], bearer_methods_supported: ['header'], resource_name: 'Tachyon' });
  }
  if (method === 'GET' && pathname === '/.well-known/oauth-authorization-server') return open(serverInfo(url.origin));
  if (method === 'POST' && pathname === '/oauth/register') return register(request, env);
  if (method === 'GET' && pathname === '/oauth/authorize') return authorize(url, env, user);
  if (method === 'POST' && pathname === '/oauth/authorize') return decide(request, env, url, user);
  if (method === 'POST' && pathname === '/oauth/token') return token(request, env);
  return open({ error: 'not_found' }, 404);
}

const open = (data, status = 200, headers = {}) => json(data, status, { ...CORS, ...headers });
const noTable = (err) => /no such table/i.test(String(err && err.message));

function serverInfo(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

// ── AI 앱 확인 ───────────────────────────────────────────────────

function okRedirect(uri) {
  if (typeof uri !== 'string' || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    return !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)));
  } catch {
    return false;
  }
}

function sameRedirect(registered, uri) {
  if (registered === uri) return true;
  try {
    const a = new URL(registered);
    const b = new URL(uri);
    return a.protocol === 'http:' && b.protocol === 'http:' && LOOPBACK.has(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

const clientName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'AI 앱';

async function register(request, env) {
  const body = await readJson(request);
  const uris = body && Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) {
    return open({ error: 'invalid_redirect_uri', error_description: 'redirect_uris는 https 주소(내 컴퓨터면 http://localhost)만 받아요' }, 400);
  }
  const name = clientName(body.client_name);
  const client_id = `dcr.${await seal(env, JSON.stringify({ r: uris, n: name }))}`;
  return open(
    {
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    201,
  );
}

/** client_id → { name, redirects } 또는 null(모르는 앱) */
async function loadClient(env, clientId) {
  if (typeof clientId !== 'string' || clientId.length > 4000) return null;
  try {
    if (clientId.startsWith('dcr.')) {
      const { r, n } = JSON.parse(await unseal(env, clientId.slice(4)));
      return { name: n, redirects: r };
    }
    if (!clientId.startsWith('https://')) return null;
    // CIMD: client_id 주소에 있는 앱 소개 문서(JSON). 그 안의 client_id가 주소와 같아야 한다
    const res = await fetch(clientId, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 20000) return null;
    const doc = JSON.parse(text);
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    return { name: clientName(doc.client_name), redirects: doc.redirect_uris.filter(okRedirect) };
  } catch {
    return null;
  }
}

// ── 허락 화면 ────────────────────────────────────────────────────

async function authorize(url, env, user) {
  const p = Object.fromEntries(url.searchParams);
  const client = await loadClient(env, p.client_id);
  if (!client) return page('연결할 수 없어요', '<p>이 AI 앱을 확인하지 못했어요(client_id). AI 앱에서 다시 연결해 주세요.</p>', 400);
  const redirect = p.redirect_uri || (client.redirects.length === 1 ? client.redirects[0] : '');
  if (!redirect || !client.redirects.some((r) => sameRedirect(r, redirect))) {
    return page('연결할 수 없어요', '<p>돌아갈 주소가 이 AI 앱에 등록된 것과 달라요.</p>', 400);
  }
  const back = { state: p.state, iss: url.origin };
  if (p.response_type !== 'code') return redirectTo(redirect, { error: 'unsupported_response_type', ...back });
  if (p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge || '')) {
    return redirectTo(redirect, { error: 'invalid_request', error_description: 'PKCE(S256)가 필요해요', ...back });
  }
  if (!user) return new Response(null, { status: 302, headers: { location: `${url.origin}/api/login?next=${encodeURIComponent(url.pathname + url.search)}` } });
  const ask = await seal(env, JSON.stringify({ k: 'q', u: user.id, c: p.client_id, n: client.name, r: redirect, p: p.code_challenge, s: p.state ?? null, e: Date.now() + ASK_MS }));
  return page(
    `${client.name}에 Tachyon을 연결할까요?`,
    `<p class="who">${esc(user.email)} 계정 · 돌아갈 곳 <b>${esc(new URL(redirect).host)}</b></p>
<ul>
<li><b>읽기</b> 일정 · 빈 시간 · 할 일 · eTL 공지와 강의자료 목록 · 오늘 브리핑 · 메모</li>
<li><b>넣기</b> 일정 · 할 일 (고치기 · 지우기는 못 해요)</li>
<li><b>공부방</b> 시험 범위 안의 eTL 강의자료를 쪽마다 글로 옮겨 그 앱의 튜터에게 줘요(옮긴 글은 저장 안 함) · 개념 지도 · 문제 결과 · 오답 노트</li>
</ul>
<p class="note">허락하면 그 AI 앱이 부를 때마다 위 내용이 그 앱의 대화로 가고, 그 뒤 처리는 그 앱의 약관을 따릅니다. 끊기: Tachyon 메뉴 › AI 에이전트 연결.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="ask" value="${esc(ask)}">
<button name="allow" value="1">허락</button>
<button name="allow" value="0" class="no">거절</button>
</form>`,
  );
}

async function decide(request, env, url, user) {
  const form = new URLSearchParams(await request.text());
  const q = await openSealed(env, form.get('ask'), 'q');
  if (!q) return page('시간이 지났어요', '<p>AI 앱에서 다시 연결해 주세요.</p>', 400);
  if (!user || user.id !== q.u) return page('다른 계정이에요', '<p>허락 화면을 연 Tachyon 계정으로 다시 해 주세요.</p>', 403);
  const back = { state: q.s, iss: url.origin };
  if (form.get('allow') !== '1') return redirectTo(q.r, { error: 'access_denied', ...back });
  const code = await seal(env, JSON.stringify({ k: 'c', u: q.u, c: q.c, n: q.n, r: q.r, p: q.p, e: Date.now() + CODE_MS }));
  return redirectTo(q.r, { code, ...back });
}

function redirectTo(uri, params) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: u.toString(), 'cache-control': 'no-store' } });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tachyon · AI 앱 연결</title><style>
:root{color-scheme:light dark;--bg:#f6f6f4;--card:#fff;--ink:#1d1d1b;--soft:#6b6b66;--line:#e2e2dd;--go:#1d1d1b;--go-ink:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--ink:#ededea;--soft:#a3a39d;--line:#33332f;--go:#ededea;--go-ink:#141413}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;display:grid;place-items:center;min-height:100vh}
main{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;margin:16px;max-width:420px}
h1{font-size:20px;line-height:1.4;margin:0 0 8px}.who,.note{color:var(--soft);font-size:14px}ul{padding-left:20px}li{margin:6px 0}
form{display:flex;gap:8px;margin-top:20px}button{flex:1;font:inherit;padding:12px;border-radius:10px;border:1px solid var(--go);background:var(--go);color:var(--go-ink);cursor:pointer}
button.no{background:transparent;color:var(--ink);border-color:var(--line)}
</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
    },
  });
}

// ── 토큰 ─────────────────────────────────────────────────────────

async function openSealed(env, text, kind) {
  try {
    const data = JSON.parse(await unseal(env, text || ''));
    return data.k === kind && data.e > Date.now() ? data : null;
  } catch {
    return null;
  }
}

async function sha256(text) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text))));
}

async function token(request, env) {
  const f = new URLSearchParams(await request.text());
  const bad = (error, error_description) => open({ error, error_description }, 400);
  const grant = f.get('grant_type');
  try {
    if (grant === 'authorization_code') {
      const c = await openSealed(env, f.get('code'), 'c');
      if (!c) return bad('invalid_grant', 'code가 틀렸거나 5분이 지났어요');
      if ((f.has('client_id') && f.get('client_id') !== c.c) || (f.has('redirect_uri') && f.get('redirect_uri') !== c.r)) {
        return bad('invalid_grant', 'client_id·redirect_uri가 허락할 때와 달라요');
      }
      if (!f.get('code_verifier') || (await sha256(f.get('code_verifier'))) !== c.p) return bad('invalid_grant', 'PKCE가 맞지 않아요');
      const [res] = await env.DB.batch([
        env.DB.prepare('INSERT INTO ai_links (user_id, client, host) VALUES (?, ?, ?) RETURNING id').bind(c.u, c.n, new URL(c.r).host),
        logStatement(env, c.u, 'ai_link', { client: c.n }),
      ]);
      return tokens(env, res.results[0].id, c.u, c.c);
    }
    if (grant === 'refresh_token') {
      const r = await openSealed(env, f.get('refresh_token'), 'r');
      if (!r || (f.has('client_id') && f.get('client_id') !== r.c)) return bad('invalid_grant', 'refresh 토큰이 틀렸거나 기한이 지났어요');
      const done = await env.DB.prepare('UPDATE ai_links SET used_at = ? WHERE id = ? AND user_id = ?').bind(kstIso(), r.l, r.u).run();
      if (!done.meta.changes) return bad('invalid_grant', 'Tachyon에서 연결을 끊었어요. AI 앱에서 다시 연결해 주세요');
      return tokens(env, r.l, r.u, r.c);
    }
  } catch (err) {
    if (noTable(err)) return open({ error: 'temporarily_unavailable', error_description: 'AI 앱 연결은 아직 준비 중이에요' }, 503);
    throw err;
  }
  return bad('unsupported_grant_type', 'authorization_code·refresh_token만 받아요');
}

async function tokens(env, link, userId, clientId) {
  const now = Date.now();
  return open({
    access_token: await seal(env, JSON.stringify({ k: 'a', l: link, u: userId, e: now + ACCESS_S * 1000 })),
    token_type: 'Bearer',
    expires_in: ACCESS_S,
    refresh_token: await seal(env, JSON.stringify({ k: 'r', l: link, u: userId, c: clientId, e: now + REFRESH_MS })),
  });
}

// ── 연결 목록 · 끊기(화면) ───────────────────────────────────────

async function links(request, env, url, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const [, , , idPart, extra] = url.pathname.split('/'); // '' / api / ai / :id
  const mcpUrl = `${url.origin}/mcp`;
  try {
    if (idPart === undefined && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, client, host, created_at, used_at FROM ai_links WHERE user_id = ? ORDER BY id DESC').bind(user.id).all();
      return json({ ok: true, mcp: mcpUrl, links: results });
    }
    const id = Number(idPart);
    if (extra === undefined && Number.isInteger(id) && id > 0 && request.method === 'DELETE') {
      const done = await env.DB.prepare('DELETE FROM ai_links WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      if (!done.meta.changes) return fail(404, '없는 연결이에요');
      await logAction(env, user.id, 'ai_unlink');
      return json({ ok: true });
    }
  } catch (err) {
    if (noTable(err)) return json({ ok: true, mcp: mcpUrl, links: [], ready: false });
    throw err;
  }
  return fail(404, '없는 주소예요');
}

// ── MCP ──────────────────────────────────────────────────────────

const rpc = (id, result) => open({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message, status = 200, data) => open({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }, status);

async function mcp(request, env, ctx, url) {
  // 사람이 이 주소를 브라우저로 열면(11-19 사람이 열어 봄) JSON 오류 대신 'AI 앱에 넣는 주소'라는 안내. AI 앱의 GET(SSE)은 그대로 405
  if (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')) {
    return page(
      '이 주소는 AI 앱에 넣는 주소예요',
      `<p>브라우저로 여는 곳이 아니에요. 이 주소를 AI 앱의 설정에 넣으면, 그 앱이 Tachyon 허락 화면을 띄워요.</p>
<p><b>${esc(`${url.origin}/mcp`)}</b></p>
<ul>
<li><b>Claude</b> 설정 › 커넥터 › 사용자 지정 커넥터 추가 → 주소 붙여 넣기 → 연결</li>
<li><b>ChatGPT</b> 설정 › 앱 › 고급 설정 › 개발자 모드 → 앱 만들기 → 주소, 인증 OAuth</li>
<li><b>Gemini CLI</b> settings.json의 mcpServers에 httpUrl로</li>
</ul>
<p class="note"><a href="/">Tachyon</a> 메뉴 › AI 에이전트 연결에도 같은 안내가 있어요.</p>`,
    );
  }
  if (request.method !== 'POST') return open({ error: '이 MCP는 POST(JSON 답)만 받아요' }, 405, { allow: 'POST, OPTIONS' });
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  const a = bearer ? await openSealed(env, bearer, 'a') : null;
  let user = null;
  if (a) {
    try {
      user = await env.DB.prepare('SELECT users.* FROM ai_links JOIN users ON users.id = ai_links.user_id WHERE ai_links.id = ? AND ai_links.user_id = ?').bind(a.l, a.u).first();
    } catch (err) {
      if (!noTable(err)) throw err;
    }
  }
  if (!user) {
    return open({ error: 'invalid_token' }, 401, { 'www-authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"` });
  }

  const msg = await readJson(request, 256 * 1024);
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, -32700, 'JSON-RPC 메시지 하나만 받아요', 400);
  if (msg.method === undefined || msg.id === undefined) return new Response(null, { status: 202, headers: CORS }); // 알림·응답은 받기만
  const { id } = msg;
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const meta = params._meta || {};
  const version = meta['io.modelcontextprotocol/protocolVersion'];
  const header = request.headers.get('mcp-protocol-version');
  const method = request.headers.get('mcp-method');
  const name = request.headers.get('mcp-name');
  if ((header && version && header !== version) || (method && method !== msg.method) || (name && msg.method === 'tools/call' && name !== params.name)) {
    return rpcError(id, -32020, '머리글과 본문이 달라요', 400);
  }
  const modern = version !== undefined || header === MODERN;
  if (modern && (!version || !meta['io.modelcontextprotocol/clientCapabilities'])) {
    return rpcError(id, -32602, '_meta에 protocolVersion·clientCapabilities가 필요해요', 400);
  }
  const asked = version ?? header;
  if (asked && !VERSIONS.includes(asked)) return rpcError(id, -32022, '지원하지 않는 MCP 버전이에요', 400, { supported: VERSIONS, requested: asked });
  const ok = (result) => rpc(id, modern ? { resultType: 'complete', ...result } : result);

  switch (msg.method) {
    case 'initialize':
      return rpc(id, {
        protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[1],
        capabilities: { tools: { listChanged: false }, resources: {} },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    case 'server/discover':
      return ok({ supportedVersions: VERSIONS, capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS, ...CACHE, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER } });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS.map(({ run, ...tool }) => tool), ...(modern ? CACHE : {}) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `없는 도구예요: ${params.name}`);
      ctx.waitUntil(logAction(env, user.id, 'ai_tool', { tool: tool.name }));
      try {
        const data = await tool.run(params.arguments || {}, { env, ctx, user });
        return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
      } catch (err) {
        if (!(err instanceof ToolError || err instanceof StudyError)) throw err;
        return ok({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    case 'resources/list': // 학습 지도 창(MCP Apps) 하나
      return ok({ resources: STUDY_RESOURCES.map(({ text, ...r }) => r), ...(modern ? CACHE : {}) });
    case 'resources/read': {
      const r = STUDY_RESOURCES.find((it) => it.uri === params.uri);
      if (!r) return rpcError(id, -32002, `없는 자료예요: ${params.uri}`);
      return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text, _meta: r._meta }] });
    }
    default:
      return rpcError(id, -32601, `모르는 방법이에요: ${msg.method}`);
  }
}

// ── 도구 ─────────────────────────────────────────────────────────

class ToolError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const withDay = (date) => `${date} (${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
const hhmm = (ms) => kstIso(ms).slice(11, 16);
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DATE_ARG = (what) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: `${what} (YYYY-MM-DD, KST)` });
const TIME_ARG = (what) => ({ type: 'string', description: `${what}: 'YYYY-MM-DDTHH:MM' (KST) or 'YYYY-MM-DD' for all-day` });
const LIMIT = (max, def) => ({ type: 'integer', minimum: 1, maximum: max, default: def });
const input = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

/** 화면이 쓰는 주소를 안에서 부른다 → 응답 JSON(ok 빼고). 실패면 그 오류 글로 ToolError */
async function call(fn, { env, ctx, user }, path, body) {
  const init = body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {};
  const res = await fn(new Request(`https://tachyon.internal${path}`, init), env, ctx, user);
  const { ok, ...data } = await res.json();
  if (!res.ok) throw new ToolError(data.error || `실패했어요(${res.status})`);
  return data;
}

function range(args, days, max) {
  const from = args.from ?? kstDate();
  const to = args.to ?? addDays(from, days - 1);
  if (!DATE.test(from) || !DATE.test(to)) throw new ToolError('from·to는 YYYY-MM-DD예요');
  const n = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (!(n >= 1 && n <= max)) throw new ToolError(`기간(from~to)은 1~${max}일이에요`);
  return { from, to, n };
}

/** AI가 흔히 쓰는 'YYYY-MM-DDTHH:MM'을 Tachyon 모양('…:00+09:00')으로. 날짜만·이미 맞는 것은 그대로(틀리면 7_items가 알려 준다) */
function kstTime(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00+09:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return `${s}+09:00`;
  return s;
}

function afterAdd(x) {
  x.ctx.waitUntil(afterWrite(x.env, x.user.id).catch((err) => console.error('구글 캘린더 보내기 실패', err && err.message)));
}

const TOOLS = [
  {
    name: 'get_briefing',
    title: '오늘 브리핑',
    description:
      "Today's Tachyon briefing card (KST): today's events, the 3 tasks with the least slack, one task worth postponing, a crowded-week warning, today's share of work and newly added tasks. Good first call for 'what should I do today?'.",
    inputSchema: input({}),
    annotations: READ,
    run: async (args, x) => ({ today: withDay(kstDate()), ...(await call(night, x, '/api/briefing')) }),
  },
  {
    name: 'get_schedule',
    title: '일정 보기',
    description:
      "Events in the user's Tachyon calendar from `from` to `to` (inclusive, KST, at most 62 days; default today + 6 days): classes, eTL course events, Google Calendar and events added in Tachyon. start/end look like '2026-11-20T15:00:00+09:00', or a date only for all-day events (all-day end = the day after, exclusive). source tells where it came from.",
    inputSchema: input({ from: DATE_ARG('First day'), to: DATE_ARG('Last day, inclusive') }),
    annotations: READ,
    run: async (args, x) => {
      const { from, to } = range(args, 7, 62);
      const { events } = await call(items, x, `/api/events?from=${from}&to=${addDays(to, 1)}`);
      return { today: withDay(kstDate()), from, to, events };
    },
  },
  {
    name: 'find_free_time',
    title: '빈 시간 찾기',
    description:
      "Free time in the user's Tachyon calendar, to suggest when to put something new. Each day, timed events between day_start and day_end block time (all-day events are listed but don't block); today starts from now. Returns gaps at least `minutes` long. Default: today + 6 days, 60 minutes, 09:00–22:00.",
    inputSchema: input({
      from: DATE_ARG('First day'),
      to: DATE_ARG('Last day, inclusive (at most 31 days)'),
      minutes: { type: 'integer', minimum: 5, maximum: 1440, default: 60, description: 'Shortest useful gap in minutes' },
      day_start: { type: 'string', pattern: '^\\d{2}:\\d{2}$', default: '09:00', description: 'Earliest time of day (HH:MM)' },
      day_end: { type: 'string', pattern: '^\\d{2}:\\d{2}$', default: '22:00', description: 'Latest time of day (HH:MM)' },
    }),
    annotations: READ,
    run: async (args, x) => {
      const { from, to, n } = range(args, 7, 31);
      const minutes = args.minutes ?? 60;
      const dayStart = args.day_start ?? '09:00';
      const dayEnd = args.day_end ?? '22:00';
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) throw new ToolError('minutes는 5~1440 사이 정수예요');
      if (!HHMM.test(dayStart) || !HHMM.test(dayEnd) || dayStart >= dayEnd) throw new ToolError('day_start·day_end는 HH:MM이고 시작이 끝보다 앞이에요');
      const { events } = await call(items, x, `/api/events?from=${from}&to=${addDays(to, 1)}`);
      const timed = events
        .filter((e) => e.start.length > 10)
        .map((e) => [Date.parse(e.start), Date.parse(e.end || e.start)])
        .sort((p, q) => p[0] - q[0]);
      const now = Math.ceil(Date.now() / 600000) * 600000; // 오늘은 지금(10분 올림)부터
      const days = [];
      for (let i = 0; i < n; i++) {
        const date = addDays(from, i);
        const end = Date.parse(`${date}T${dayEnd}:00+09:00`);
        let at = Math.max(Date.parse(`${date}T${dayStart}:00+09:00`), now);
        const free = [];
        for (const [s, e] of timed) {
          if (e <= at || s >= end) continue;
          if (s - at >= minutes * 60000) free.push({ start: hhmm(at), end: hhmm(s), minutes: (s - at) / 60000 });
          at = Math.max(at, e);
        }
        if (end - at >= minutes * 60000) free.push({ start: hhmm(at), end: hhmm(end), minutes: (end - at) / 60000 });
        const allDay = events.filter((e) => e.start.length === 10 && e.start <= date && (e.end || addDays(e.start, 1)) > date).map((e) => e.title);
        days.push({ date: withDay(date), free, all_day: allDay });
      }
      return { today: withDay(kstDate()), minutes, day_start: dayStart, day_end: dayEnd, days };
    },
  },
  {
    name: 'list_tasks',
    title: '할 일 보기',
    description:
      "The user's tasks. status 'open' (default) = unfinished, least slack first (Tachyon's ranking; eTL assignments have source 'etl'); 'done' = recently finished; 'all' = both. due is a KST time or null, minutes = estimated minutes, ready 0 = can't start yet (needs a class or material first).",
    inputSchema: input({ status: { type: 'string', enum: ['open', 'done', 'all'], default: 'open' }, limit: LIMIT(200, 50) }),
    annotations: READ,
    run: async (args, x) => {
      const done = { open: '0', done: '1', all: 'all' }[args.status ?? 'open'];
      if (!done) throw new ToolError("status는 open·done·all이에요");
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      return { today: withDay(kstDate()), ...(await call(items, x, `/api/tasks?done=${done}&limit=${limit}`)) };
    },
  },
  {
    name: 'get_etl',
    title: 'eTL 공지·강의자료',
    description:
      "Announcements (notices) and course materials (files) Tachyon collected from SNU eTL, newest first. Each item: course, title, url (an eTL page the user opens while signed in), posted_at. Only titles and links, not file contents. Assignments are in list_tasks (source 'etl') and class events in get_schedule. Empty if the user hasn't connected eTL in Tachyon.",
    inputSchema: input({
      kind: { type: 'string', enum: ['notices', 'files', 'all'], default: 'all' },
      course: { type: 'string', description: 'Only courses whose name contains this text' },
      limit: LIMIT(100, 30),
    }),
    annotations: READ,
    run: async (args, x) => {
      let data;
      try {
        data = await listItems(x.env, x.user.id);
      } catch (err) {
        if (noTable(err)) throw new ToolError('eTL 연결은 아직 준비 중이에요');
        throw err;
      }
      const kind = args.kind ?? 'all';
      const course = String(args.course ?? '').toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
      const pick = (list) => list.filter((i) => !course || String(i.course).toLowerCase().includes(course)).slice(0, limit);
      return {
        ...(kind !== 'files' ? { notices: pick(data.notices) } : {}),
        ...(kind !== 'notices' ? { files: pick(data.files) } : {}),
      };
    },
  },
  {
    name: 'list_memos',
    title: '메모 보기',
    description: "The user's latest quick memos in Tachyon (raw text, oldest first), with event_id / task_id when a memo became an event or task.",
    inputSchema: input({ limit: LIMIT(100, 20) }),
    annotations: READ,
    run: async (args, x) => call(memo, x, `/api/memo?limit=${Math.min(Math.max(Number(args.limit) || 20, 1), 100)}`),
  },
  {
    name: 'add_event',
    title: '일정 넣기',
    description:
      "Add an event to the user's Tachyon calendar (it also goes to Google Calendar if linked). Confirm title and time with the user first, and check find_free_time for conflicts. Timed: start 'YYYY-MM-DDTHH:MM' (KST), end optional (default 1 hour). All-day: start 'YYYY-MM-DD', end optional = the day after the last day.",
    inputSchema: input(
      {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        start: TIME_ARG('Start'),
        end: TIME_ARG('End'),
        place: { type: 'string', maxLength: 200 },
        remind_minutes: { type: 'integer', minimum: 0, maximum: 1440, description: 'Phone reminder this many minutes before (Tachyon app)' },
      },
      ['title', 'start'],
    ),
    annotations: WRITE,
    run: async (args, x) => {
      const out = await call(items, x, '/api/events', {
        title: args.title,
        start: kstTime(args.start),
        end: kstTime(args.end),
        place: args.place ?? null,
        remind: args.remind_minutes ?? null,
      });
      afterAdd(x);
      return out;
    },
  },
  {
    name: 'add_task',
    title: '할 일 넣기',
    description:
      "Add a task (to-do) to the user's Tachyon list. Confirm with the user first. due optional: 'YYYY-MM-DD' (counts as 23:59) or 'YYYY-MM-DDTHH:MM' (KST). minutes optional: estimated minutes to finish.",
    inputSchema: input(
      {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        due: TIME_ARG('Deadline'),
        minutes: { type: 'integer', minimum: 1, maximum: 1440 },
      },
      ['title'],
    ),
    annotations: WRITE,
    run: async (args, x) => {
      const due = DATE.test(String(args.due ?? '')) ? `${args.due}T23:59:00+09:00` : kstTime(args.due);
      const out = await call(items, x, '/api/tasks', { title: args.title, due, minutes: args.minutes ?? null });
      afterAdd(x);
      return out;
    },
  },
  ...STUDY_TOOLS, // 공부방 튜터(14_study.js)
];
