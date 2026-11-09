// 로그인한 사용자 확인 (담당: 서버 세션)
//
// 로그인 쿠키에는 서명한 { uid(users.id), exp }만 담는다. DB에 세션 표를 따로 두지 않는다(30일).
// 로그아웃 = 쿠키 지우기. 서명 키는 APP_SECRET에서 만든다(lib/secret.js).
//
// 다른 파일은 getUser(request, env)만 쓰면 된다 → users 행 또는 null.

import { deriveKey, b64url, fromB64url, utf8 } from './secret.js';

export const SESSION_COOKIE = 'tachyon_session';
const SESSION_DAYS = 30;

/** 로그인 쿠키(Set-Cookie 값)를 만든다. */
export async function makeSessionCookie(env, userId, now = Date.now()) {
  const payload = b64url(utf8.encode(JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 })));
  const key = await deriveKey(env, 'session');
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(payload))));
  return cookie(SESSION_COOKIE, `${payload}.${sig}`, SESSION_DAYS * 86400);
}

export function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', 0);
}

/** 쿠키가 맞게 서명됐고 기한 안이면 { uid, exp }, 아니면 null */
export async function readSession(request, env, now = Date.now()) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  try {
    const key = await deriveKey(env, 'session');
    const ok = await crypto.subtle.verify('HMAC', key, fromB64url(sig), utf8.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(utf8.decode(fromB64url(payload)));
    if (data.uid == null || !data.exp || data.exp * 1000 < now) return null;
    return data;
  } catch {
    return null;
  }
}

/** 로그인한 사용자의 users 행. 로그인 안 했으면 null. */
export async function getUser(request, env) {
  const session = await readSession(request, env);
  if (!session) return null;
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.uid).first();
}

export function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function cookie(name, value, maxAgeSeconds, { path = '/' } = {}) {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
