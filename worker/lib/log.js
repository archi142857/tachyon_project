// log 표 기록 (담당: 서버 세션)
//
// 측정(공모전 수치)과 실패 기록에 쓴다. 기록이 실패해도 본 작업은 멈추지 않는다.
// detail에는 개수·종류 같은 짧은 정보만 넣는다. 주소·토큰·일정 내용은 넣지 않는다.

import { kstIso } from './time.js';

/** batch에 끼워 넣을 수 있게 문장만 만든다. */
export function logStatement(env, userId, action, detail = null) {
  return env.DB.prepare('INSERT INTO log (user_id, action, detail, at) VALUES (?, ?, ?, ?)').bind(
    userId ?? null,
    action,
    detail == null ? null : packDetail(detail),
    kstIso(),
  );
}

/** detail을 1000자 안의 올바른 JSON으로(길면 글 칸을 줄인다 — 중간에 잘린 JSON을 남기지 않게) */
export function packDetail(detail) {
  let text = JSON.stringify(detail);
  if (text.length <= 1000) return text;
  const short = Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
  text = JSON.stringify(short);
  return text.length <= 1000 ? text : JSON.stringify({ cut: true, keys: Object.keys(detail).slice(0, 20) });
}

export async function logAction(env, userId, action, detail = null) {
  try {
    await logStatement(env, userId, action, detail).run();
  } catch (err) {
    console.error('log 기록 실패', action, err && err.message);
  }
}
