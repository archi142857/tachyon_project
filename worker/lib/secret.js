// 비밀값 다루기 (담당: 서버 세션)
//
// Cloudflare 비밀값 APP_SECRET 하나에서 용도별 키를 만든다(HKDF-SHA256).
//   'session' → 로그인 쿠키 서명(HMAC)
//   'seal'    → DB에 넣는 ICS 주소·(3단계) eTL 토큰 잠금(AES-GCM)
// APP_SECRET을 바꾸면 모두 로그아웃되고, 잠근 주소는 다시 넣어야 한다.

const enc = new TextEncoder();
const dec = new TextDecoder();
const cache = new Map();

export async function deriveKey(env, purpose) {
  const secret = env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('APP_SECRET 비밀값이 없거나 너무 짧아요(16자 이상)');
  }
  const cacheKey = `${purpose}\u0000${secret}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  const params = { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('tachyon'), info: enc.encode(purpose) };
  const key =
    purpose === 'session'
      ? await crypto.subtle.deriveKey(params, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])
      : await crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  cache.set(cacheKey, key);
  return key;
}

/** 글을 잠근다 → 'v1.<iv>.<암호문>' */
export async function seal(env, text) {
  const key = await deriveKey(env, 'seal');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(data))}`;
}

/** 잠근 글을 연다. 키가 다르거나 글이 망가졌으면 오류. */
export async function unseal(env, sealed) {
  const [version, iv, data] = String(sealed).split('.');
  if (version !== 'v1' || !iv || !data) throw new Error('잠금 형식을 알 수 없어요');
  const key = await deriveKey(env, 'seal');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(data));
  return dec.decode(plain);
}

export function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text) {
  const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const utf8 = { encode: (s) => enc.encode(s), decode: (b) => dec.decode(b) };
