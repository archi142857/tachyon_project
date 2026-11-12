// 시작 질문 셋(9판, 사람 11-13 결정 '첫 설정' 섞기): 일어나는 시각 · 집중 길이 · 첫 화면. 이 기기(localStorage)에만 둔다.
// 일어나는 시각 = 하루 고리의 잠 구간과 '넣어 본 자리'가 시작하는 시각(slots.js WAKE), 집중 길이 = 할 일 집중 타이머, 첫 화면 = 앱을 열 때 쪽.
const KEY = 'tachyon_prefs';
export const PREF_DEFAULT = { wake: 7, focus: 25, first: 'today' };
export const WAKES = [5, 6, 7, 8, 9, 10];
export const FOCUSES = [15, 25, 50];
export const FIRSTS = [
  ['today', '오늘'],
  ['cal', '달력'],
  ['tasks', '할 일'],
  ['memo', '메모'],
];

// 잘못 적힌 값은 기본으로
export function cleanPrefs(raw) {
  const p = { ...PREF_DEFAULT };
  if (WAKES.includes(raw?.wake)) p.wake = raw.wake;
  if (FOCUSES.includes(raw?.focus)) p.focus = raw.focus;
  if (FIRSTS.some(([k]) => k === raw?.first)) p.first = raw.first;
  return p;
}

export function readPrefs() {
  try {
    return cleanPrefs(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return { ...PREF_DEFAULT };
  }
}

export function savePrefs(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cleanPrefs(p)));
  } catch {
    // 저장이 막힌 브라우저에서는 이번에 열어 둔 동안만
  }
}

// 시작 질문에 답한 적이 있는지(없으면 길잡이 뒤에 한 번 묻는다)
export function askedPrefs() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}
