// 넓은 화면 '오늘' 쪽 위젯 배치(11-13 사람 "오늘 일정, 하루 고리, 할 일, 메모를 각각 위젯 느낌으로 보고 끌어서 위치를 옮길 수 있도록 … 레이아웃도 기본으로 몇 개").
// 모양은 디자인 넷째 묶음 ②(request1113.css): 칸 a~d에 위젯을 data-slot으로, 배치 넷은 .today-grid[data-layout].
// 고른 배치와 차례는 이 기기에(localStorage) — 계정에 두려면 표를 바꿔야 해서 나중에.
export const WIDGETS = ['day', 'ring', 'tasks', 'memo'];
export const WIDGET_NAME = { day: '오늘 일정', ring: '하루 고리', tasks: '할 일', memo: '메모' };
export const SLOTS = ['a', 'b', 'c', 'd'];
export const LAYOUTS = [
  ['three', '세 칸'],
  ['four', '네 칸'],
  ['ring', '고리 크게'],
  ['grid', '2 × 2'],
];
// 배치마다 기본 차례(칸 a~d에 놓을 위젯). 세 칸 = 지금 화면과 같다
export const DEFAULT_ORDER = {
  three: ['day', 'ring', 'tasks', 'memo'],
  four: ['ring', 'day', 'tasks', 'memo'],
  ring: ['ring', 'day', 'tasks', 'memo'],
  grid: ['ring', 'day', 'tasks', 'memo'],
};
export const FIRST = { layout: 'three', order: DEFAULT_ORDER.three };
const KEY = 'tachyon_today_layout';

// 저장된 값이 맞는 모양일 때만 쓴다(위젯 넷이 한 번씩)
export function parseLayout(text) {
  try {
    const v = JSON.parse(text);
    if (!v || !DEFAULT_ORDER[v.layout] || !Array.isArray(v.order)) return FIRST;
    if (v.order.length !== WIDGETS.length || WIDGETS.some((w) => !v.order.includes(w))) return { layout: v.layout, order: DEFAULT_ORDER[v.layout] };
    return { layout: v.layout, order: [...v.order] };
  } catch {
    return FIRST;
  }
}

export function readLayout() {
  try {
    return parseLayout(localStorage.getItem(KEY));
  } catch {
    return FIRST; // 저장이 막힌 브라우저
  }
}

export function writeLayout(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 저장이 막힌 브라우저면 이번에만 */
  }
}

// 칸 i와 j의 위젯을 바꾼 새 차례
export function swapOrder(order, i, j) {
  if (i === j || i < 0 || j < 0 || i >= order.length || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// { day: 'a', … }
export const slotsOf = (order) => Object.fromEntries(order.map((w, i) => [w, SLOTS[i]]));
