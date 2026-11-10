// 1. 구글 로그인 (담당: 서버 세션)
//
// 구글 기본 범위(openid·email·profile)만 쓴다 → 이름·이메일만 받는다. 구글 캘린더 권한은 쓰지 않는다.
//
//   GET  /api/login?next=/          구글 로그인 화면으로 보낸다(next = 끝나고 돌아올 화면 주소)
//   GET  /api/login?app=<확인값>     안드로이드 앱의 로그인(아래 '앱 로그인')
//   GET  /api/login/ticket?t=&v=     앱 로그인의 마지막: 표를 로그인 쿠키로 바꾼다
//   GET  /api/login/callback        구글이 돌려보내는 곳. users 행을 만들고(google_sub로 찾음, 있으면 이메일·이름만 고침) 로그인 쿠키를 준다
//   GET  /api/login/me              내 정보 {id, email, name, dept, year} + needsSetup(학과·학년이 비었으면 true)
//   PUT  /api/login/me              첫 설정: {"dept": "동물생명공학전공", "year": 2}
//   POST /api/login/logout          로그아웃(쿠키 지움)
//   DELETE /api/login/me            계정 지우기 {"confirm": true}: 내 주소·일정·할 일·메모·브리핑·기록·시간표 사진을 모두 지우고 로그아웃
//
// 로그인 실패는 화면으로 돌려보내며 ?login_error=<이유>를 붙인다: denied · state · google · email · config
//
// 앱 로그인: 구글은 앱 안 화면(WebView)에서의 로그인을 막는다. 그래서 앱은 폰의 브라우저로 /api/login?app=… 을 열고,
//   구글 로그인이 끝나면 이 서버가 tachyon://login?ticket=… 으로 돌려보내 앱이 다시 뜬다(2분짜리 서명한 표, 쿠키는 브라우저에 안 준다).
//   앱 화면이 /api/login/ticket 으로 표를 내면 로그인 쿠키를 받는다. 표를 다른 앱이 가로채도 못 쓰게, 앱이 처음에 만든
//   비밀(v)의 SHA-256(app=확인값)을 표에 넣어 두고 v를 같이 내야만 받아 준다(PKCE와 같은 방식).
//   ponytail: 표는 2분 안에 여러 번 쓸 수 있다(v를 아는 그 앱만). 한 번만 쓰게 하려면 쓴 표를 DB에 적는다.
//   /api/login/ticket은 이 사이트 화면이 연 것만 받는다(Sec-Fetch-Site: same-origin, 없으면 Referer가 이 사이트).
//   남이 자기 표를 링크로 보내 피해자 브라우저를 '남의 계정'으로 로그인시키는 것(로그인 CSRF)을 막는다.
//
// 필요한 비밀값: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_SECRET
// 구글 콘솔의 '승인된 리디렉션 URI'에 <배포 주소>/api/login/callback 을 넣어야 한다.

import { makeSessionCookie, clearSessionCookie, getCookie, cookie } from './lib/auth.js';
import { deriveKey, b64url, fromB64url, utf8 } from './lib/secret.js';
import { json, fail, readJson } from './lib/http.js';
import { logAction, logStatement } from './lib/log.js';
import { kstIso } from './lib/time.js';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const FLOW_COOKIE = 'tachyon_oauth';
const FLOW_SECONDS = 600;
const APP_RETURN = 'tachyon://login'; // 앱(app/README.md)이 받는 주소
const TICKET_SECONDS = 120;

export async function handle(request, env, ctx, user) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/login' && method === 'GET') return startLogin(url, env);
  if (pathname === '/api/login/callback' && method === 'GET') return finishLogin(request, url, env, user);
  if (pathname === '/api/login/ticket' && method === 'GET') return useTicket(request, url, env);
  if (pathname === '/api/login/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  }
  if (pathname === '/api/login/me') {
    if (!user) return fail(401, '로그인이 필요해요');
    if (method === 'GET') return json({ ok: true, user: publicUser(user), needsSetup: needsSetup(user) });
    if (method === 'PUT') return saveProfile(request, env, user);
    if (method === 'DELETE') return deleteAccount(request, env, user);
  }
  return fail(404, '없는 주소예요');
}

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || null, dept: user.dept || null, year: user.year ?? null };
}

const needsSetup = (user) => !user.dept || !user.year;

// ── 로그인 시작: 구글로 보낸다 ───────────────────────────────────

async function startLogin(url, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return backToApp(url, '/', 'config');
  const state = randomText(16);
  const verifier = randomText(32);
  const next = safeNext(url.searchParams.get('next'));
  const app = url.searchParams.get('app');
  if (app != null && !/^[A-Za-z0-9_-]{43}$/.test(app)) return backToApp(url, '/', 'state'); // SHA-256의 base64url은 43자
  const flow = await signFlow(env, { state, verifier, next, ...(app && { app }), exp: Math.floor(Date.now() / 1000) + FLOW_SECONDS });

  const google = new URL(GOOGLE_AUTH);
  google.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(url),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return new Response(null, {
    status: 302,
    headers: { location: google.toString(), 'set-cookie': cookie(FLOW_COOKIE, flow, FLOW_SECONDS, { path: '/api/login' }) },
  });
}

// ── 구글이 돌려보냄: 사용자 확인 → users 행 → 로그인 쿠키 ───────────

async function finishLogin(request, url, env, user) {
  const flow = await readFlow(env, getCookie(request, FLOW_COOKIE));
  const next = flow ? flow.next : '/';
  const clearFlow = cookie(FLOW_COOKIE, '', 0, { path: '/api/login' });
  // 이미 로그인돼 있으면 실패를 보이지 않고 그냥 돌아간다: 아이폰 홈 화면 앱은 같은 콜백이 두 번 와서
  // (작은 브라우저와 앱) 두 번째가 state·google 실패가 될 수 있다(화면 세션 11-09 18:30 쪽지).
  const back = (reason) =>
    flow?.app ? toApp({ error: reason }, clearFlow) : backToApp(url, next, user ? null : reason, clearFlow);

  if (url.searchParams.get('error')) return back('denied'); // 사용자가 취소
  if (!flow || flow.state !== url.searchParams.get('state')) return back('state');
  const code = url.searchParams.get('code');
  if (!code) return back('state');

  let claims;
  try {
    claims = await exchangeCode(env, code, flow.verifier, redirectUri(url));
  } catch (err) {
    console.error('구글 토큰 교환 실패', err && err.message);
    return back('google');
  }
  if (!claims.sub || !claims.email || claims.email_verified !== true) return back('email');

  // 구글 계정 고유 번호(sub)로 찾는다(이메일은 바뀔 수 있음). 있으면 이메일·이름만 새로.
  const row = await env.DB.prepare(
    `INSERT INTO users (google_sub, email, name, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name
     RETURNING *`,
  )
    .bind(String(claims.sub), String(claims.email).toLowerCase(), claims.name ? String(claims.name).slice(0, 100) : null, kstIso())
    .first();
  await logAction(env, row.id, 'login', flow.app ? { app: true } : null);
  if (flow.app) {
    const ticket = await signFlow(env, { uid: row.id, app: flow.app, exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS });
    return toApp({ ticket }, clearFlow);
  }

  const headers = new Headers({ location: new URL(next, url.origin).toString() });
  headers.append('set-cookie', await makeSessionCookie(env, row.id));
  headers.append('set-cookie', clearFlow);
  return new Response(null, { status: 302, headers });
}

/** 앱으로 돌려보낸다(tachyon://login?ticket=… 또는 ?error=…). 이 브라우저에는 로그인 쿠키를 주지 않는다. */
function toApp(params, clearFlow) {
  return new Response(null, { status: 302, headers: { location: `${APP_RETURN}?${new URLSearchParams(params)}`, 'set-cookie': clearFlow } });
}

/** 앱 화면이 표(t)와 처음 만든 비밀(v)을 낸다 → 로그인 쿠키 */
async function useTicket(request, url, env) {
  if (!openedHere(request, url)) return backToApp(url, '/', 'state');
  const ticket = await readFlow(env, url.searchParams.get('t'));
  const v = url.searchParams.get('v') || '';
  if (!ticket || ticket.uid == null || !ticket.app || (await challenge(v)) !== ticket.app) return backToApp(url, '/', 'state');
  return new Response(null, { status: 302, headers: { location: new URL('/', url.origin).toString(), 'set-cookie': await makeSessionCookie(env, ticket.uid) } });
}

/** 이 사이트 화면에서 연 요청인가(앱의 window.location 이동). 다른 사이트·다른 앱에서 연 링크는 아니다. */
function openedHere(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  try {
    return new URL(request.headers.get('referer') || '').origin === url.origin; // Sec-Fetch-*가 없는 오래된 브라우저
  } catch {
    return false;
  }
}

/** 받은 code를 구글 토큰 주소에서 ID 토큰으로 바꾸고 내용을 확인한다. */
export async function exchangeCode(env, code, verifier, redirect) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`토큰 주소가 HTTP ${res.status}로 답함`);
  const token = await res.json();
  // 구글 토큰 주소에서 TLS로 직접 받은 ID 토큰이라 서명 대신 발급자·대상·기한을 확인한다(OIDC Core 3.1.3.7).
  const claims = JSON.parse(utf8.decode(fromB64url(String(token.id_token || '').split('.')[1] || '')));
  const issuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!issuers.includes(claims.iss)) throw new Error('발급자가 구글이 아님');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('다른 앱의 토큰');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('기한이 지난 토큰');
  return claims;
}

// ── 첫 설정: 학과·학년 ──────────────────────────────────────────

async function saveProfile(request, env, user) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return fail(400, 'JSON 본문이 필요해요: {"dept": "…", "year": 2}');
  const dept = body.dept == null ? user.dept : String(body.dept).trim().slice(0, 60);
  const year = body.year == null ? user.year : Number(body.year);
  if (!dept) return fail(400, '학과를 적어 주세요');
  if (!Number.isInteger(year) || year < 1 || year > 8) return fail(400, '학년은 1~8 사이 숫자로 적어 주세요');
  const row = await env.DB.prepare('UPDATE users SET dept = ?, year = ? WHERE id = ? RETURNING *').bind(dept, year, user.id).first();
  return json({ ok: true, user: publicUser(row), needsSetup: needsSetup(row) });
}

// ── 도우미 ───────────────────────────────────────────────────────

function redirectUri(url) {
  return `${url.origin}/api/login/callback`;
}

/** 로그인 뒤 돌아갈 곳은 이 사이트 안의 경로만(밖으로 튕기는 데 쓰이지 않게). */
export function safeNext(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/api/')) return '/';
  return next.slice(0, 200);
}

// ── 계정 지우기 ──────────────────────────────────────────────────

// 이 사람의 줄은 표마다 다 지운다(schema의 ON DELETE CASCADE에 기대지 않고 직접, 한 batch = 한 번에).
// log도 지운다(남는 것은 이름 없는 'account_delete' 한 줄). GitHub 이슈에는 '사용자 #번호'만 있어 그대로 둔다.
// 새 표에 user_id가 생기면 여기에 더한다. 원격 D1에 아직 없는 표는 건너뛴다(없는 표 하나 때문에 batch 전체가 실패하지 않게).
const USER_TABLES = ['feeds', 'events', 'tasks', 'memos', 'briefings', 'etl', 'etl_items', 'log'];

async function deleteAccount(request, env, user) {
  const body = await readJson(request);
  if (!body || body.confirm !== true) return fail(400, '정말 지우려면 confirm: true를 보내 주세요');
  if (env.PHOTOS) {
    // 시간표 사진(5_timetable_photo.js가 timetable/<사용자 번호>/… 에 둠)
    try {
      let cursor;
      do {
        const listed = await env.PHOTOS.list({ prefix: `timetable/${user.id}/`, cursor });
        if (listed.objects.length) await env.PHOTOS.delete(listed.objects.map((o) => o.key));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error('시간표 사진 지우기 실패', err && err.message);
    }
  }
  const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const present = new Set(results.map((r) => r.name));
  await env.DB.batch([
    ...USER_TABLES.filter((table) => present.has(table)).map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id)),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    logStatement(env, null, 'account_delete', null),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

function backToApp(url, next, reason, setCookie) {
  const target = new URL(safeNext(next), url.origin);
  if (reason) target.searchParams.set('login_error', reason);
  const headers = { location: target.toString() };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(null, { status: 302, headers });
}

function randomText(bytes) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function challenge(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(verifier))));
}

// 로그인 도중에만 쓰는 쿠키: state·PKCE 비밀·돌아갈 곳. 서명해서 브라우저에 맡긴다(10분).
async function signFlow(env, data) {
  const payload = b64url(utf8.encode(JSON.stringify(data)));
  const key = await deriveKey(env, 'session');
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(`flow.${payload}`))));
  return `${payload}.${sig}`;
}

async function readFlow(env, raw) {
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  try {
    const key = await deriveKey(env, 'session');
    const ok = await crypto.subtle.verify('HMAC', key, fromB64url(sig), utf8.encode(`flow.${payload}`));
    if (!ok) return null;
    const data = JSON.parse(utf8.decode(fromB64url(payload)));
    if (!data.exp || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
