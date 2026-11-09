// 응답·요청 도우미 (담당: 서버 세션). 모든 API 응답은 JSON이다.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** 실패 응답: { ok: false, error: '사용자에게 보여 줄 한국어 문장' } */
export function fail(status, error, extra = {}) {
  return json({ ok: false, error, ...extra }, status);
}

/** 사용자가 고칠 수 있는 잘못(주소 형식 등). 메시지를 그대로 보여 준다. */
export class UserError extends Error {}

/** 본문을 JSON으로 읽는다. 너무 크거나 JSON이 아니면 null. */
export async function readJson(request, maxChars = 64 * 1024) {
  const text = await request.text();
  if (text.length > maxChars) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
