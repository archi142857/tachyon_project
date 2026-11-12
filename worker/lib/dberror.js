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

// 한도에 걸린 날에도 어떤 질의는 지나간다(11-12: health의 작은 읽기는 됐는데 로그인의 쓰기는 막힘) → health가 읽기 하나로는
// 못 알아본다. 그래서 이 Worker가 최근에 본 한도 오류를 기억해 health가 같이 알린다(Worker마다 따로, 10분, UTC 자정에 지움).
const RECENT_MS = 10 * 60 * 1000;
let limitSeenAt = 0;

/** 'limit'(무료 하루 읽기·쓰기 한도, UTC 자정 = 한국 09:00에 풀림) · 'busy'(잠깐) · null */
export function dbProblem(err, now = Date.now()) {
  const text = String((err && err.message) || err || '');
  if (LIMIT.test(text)) {
    limitSeenAt = now;
    return 'limit';
  }
  if (BUSY.test(text)) return 'busy';
  return null;
}

/** 기억 지우기(시험용) */
export function forgetLimit() {
  limitSeenAt = 0;
}

/** 이 Worker가 10분 안(같은 UTC 날)에 한도 오류를 봤으면 그 시각(ms), 아니면 0 */
export function recentLimit(now = Date.now()) {
  const utcMidnight = Math.floor(now / 86400000) * 86400000;
  return limitSeenAt && now - limitSeenAt <= RECENT_MS && limitSeenAt >= utcMidnight ? limitSeenAt : 0;
}

/** 화면에 보낼 503 본문. limit 글은 사람이 고른 말(11-13, 화면 5d14423과 같게) */
export const DB_PROBLEM_REPLY = {
  limit: { error: '오늘 서버 사용량을 모두 소진했어요. 오전 9시부터 다시 이용할 수 있어요', code: 'db_limit' },
  busy: { error: '서버 저장소가 잠깐 바빠요. 잠시 뒤 다시 해 주세요', code: 'db_busy' },
};
