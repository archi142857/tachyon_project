// 오늘 쪽 위젯 배치(11-13): 저장된 값 읽기 · 칸 바꾸기
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER, FIRST, areasOf, parseLayout, resizeTracks, slotsOf, swapOrder } from './todayLayout.js';

describe('todayLayout', () => {
  it('처음(저장 없음 · 깨진 글 · 모르는 배치)은 세 칸 = 지금 화면', () => {
    expect(parseLayout(null)).toEqual(FIRST);
    expect(parseLayout('{ 깨짐')).toEqual(FIRST);
    expect(parseLayout(JSON.stringify({ layout: 'five', order: DEFAULT_ORDER.three }))).toEqual(FIRST);
    expect(FIRST).toEqual({ layout: 'three', order: ['day', 'ring', 'tasks', 'memo'] });
  });
  it('차례가 위젯 넷이 아니면 그 배치의 기본 차례', () => {
    expect(parseLayout(JSON.stringify({ layout: 'ring', order: ['day', 'day', 'tasks', 'memo'] }))).toEqual({ layout: 'ring', order: DEFAULT_ORDER.ring });
    expect(parseLayout(JSON.stringify({ layout: 'four', order: ['day'] }))).toEqual({ layout: 'four', order: DEFAULT_ORDER.four });
  });
  it('맞는 값은 그대로', () => {
    const v = { layout: 'grid', order: ['memo', 'tasks', 'ring', 'day'] };
    expect(parseLayout(JSON.stringify(v))).toEqual(v);
  });
  it('칸 바꾸기는 새 차례를 돌려주고, 같은 칸 · 밖은 그대로', () => {
    const o = DEFAULT_ORDER.three;
    expect(swapOrder(o, 0, 2)).toEqual(['tasks', 'ring', 'day', 'memo']);
    expect(o).toEqual(['day', 'ring', 'tasks', 'memo']);
    expect(swapOrder(o, 1, 1)).toBe(o);
    expect(swapOrder(o, -1, 2)).toBe(o);
    expect(swapOrder(o, 0, 4)).toBe(o);
  });
  it('위젯 → 칸', () => {
    expect(slotsOf(DEFAULT_ORDER.ring)).toEqual({ ring: 'a', day: 'b', tasks: 'c', memo: 'd' });
  });
  it('경계 끌기: 두 칸 합은 그대로, 작은 쪽은 min에서 멈춤', () => {
    expect(resizeTracks([300, 400, 300], 0, 50, 220)).toEqual([350, 350, 300]);
    expect(resizeTracks([300, 400, 300], 1, 500, 220)).toEqual([300, 480, 220]);
    expect(resizeTracks([300, 400, 300], 0, -500, 220)).toEqual([220, 480, 300]);
    expect(resizeTracks([100, 100], 0, 80, 220)).toEqual([100, 100]); // 둘 다 min보다 작으면 반반에서 안 움직임
  });
  it('계산된 grid-template-areas 읽기', () => {
    expect(areasOf('"a b d" "a c d"')).toEqual([['a', 'b', 'd'], ['a', 'c', 'd']]);
    expect(areasOf('none')).toEqual([]);
  });
});
