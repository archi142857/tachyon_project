// 시각 글자 (담당: 서버 세션)
//
// schema.sql 머리말대로 DB의 시각은 '2026-11-13T15:00:00+09:00', 종일 일정은 날짜만 '2026-11-13'.
// 모두 한국 시간(+09:00) 한 모양이라 글자 비교만으로 순서·기간을 맞게 잴 수 있다.
// 종일 일정의 end는 ICS처럼 '끝난 다음 날'(그날은 포함 안 함)이다: 11/12 하루짜리 = start 11-12, end 11-13.

export const KST_MS = 9 * 3600000;
export const DAY_MS = 86400000;

/** 밀리초 → '2026-11-13T15:00:00+09:00' */
export function kstIso(ms = Date.now()) {
  return `${new Date(ms + KST_MS).toISOString().slice(0, 19)}+09:00`;
}

/** 밀리초 → 한국 날짜 '2026-11-13' */
export function kstDate(ms = Date.now()) {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/** 그날 한국 0시의 밀리초 */
export function kstMidnight(ms = Date.now()) {
  return Math.floor((ms + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
}
