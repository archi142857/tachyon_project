// D1 자체의 오류 알아보기 (담당: 서버 세션)
//
// 우리 SQL이 틀린 것이 아니라 Cloudflare D1 쪽 사정(무료 하루 한도, 잠깐 바쁨)으로 실패했는지 본다.
// 이런 오류는 주소마다 따로 이슈를 만들 까닭이 없고, 화면에는 '잠시 뒤'·'내일 오전 9시' 같은 안내가 맞다.
// 글은 D1이 주는 영어 그대로라 바뀔 수 있다 → 못 알아보면 null(지금처럼 일반 오류로 다룸).

const LIMIT = /exceeded D1's free tier daily|daily row (?:read|write) limit/i;
const BUSY = new RegExp(
  [
    'D1 DB is overloaded',
    'Network connection lost',
    'storage operation exceeded timeout',
    'reset because its code was updated',
    'transient issue on remote node',
    "D1 DB's isolate exceeded its memory limit",
    'D1 DB exceeded its CPU time limit',
  ].join('|'),
  'i',
);

/** 'limit'(무료 하루 한도, UTC 자정 = 한국 09:00에 풀림) · 'busy'(잠깐) · null */
export function dbProblem(err) {
  const text = String((err && err.message) || err || '');
  if (LIMIT.test(text)) return 'limit';
  if (BUSY.test(text)) return 'busy';
  return null;
}

/** 화면에 보낼 503 본문 */
export const DB_PROBLEM_REPLY = {
  limit: { error: '오늘 서버가 쓸 수 있는 저장소 읽기 양을 다 썼어요. 한국 시각 오전 9시에 다시 돼요', code: 'db_limit' },
  busy: { error: '서버 저장소가 잠깐 바빠요. 잠시 뒤 다시 해 주세요', code: 'db_busy' },
};
