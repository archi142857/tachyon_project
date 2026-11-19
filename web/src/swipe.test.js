// 달력 좌우 넘기기(components/useSwipe.js): 손을 뗐을 때 붙을 자리 — 보는 날 수와 상관없이 하루 앞뒤 또는 제자리
import { describe, expect, it } from 'vitest';
import { swipeTarget } from './components/useSwipe.js';

const at = (left, v) => swipeTarget({ base: 1000, left, v, w: 100, max: 5000 }); // 날 칸 100px

describe('useSwipe', () => {
  it('조금 끌고 천천히 놓으면 제자리', () => {
    expect(at(1020, 0.05)).toBe(1000);
    expect(at(985, -0.05)).toBe(1000);
  });
  it('짧아도 빠르게 튕기면 하루, 튕긴 쪽으로', () => {
    expect(at(1010, 0.6)).toBe(1100);
    expect(at(990, -0.6)).toBe(900);
    expect(at(1010, -0.6)).toBe(900); // 끈 쪽이 아니라 마지막 빠르기 쪽
  });
  it('천천히여도 날 칸의 30 % 넘게 끌면 하루 넘긴다', () => {
    expect(at(1040, 0)).toBe(1100);
    expect(at(960, 0)).toBe(900);
  });
  it('여러 날 끌면 가까운 날, 끝을 넘지 않게', () => {
    expect(at(1260, 0)).toBe(1300);
    expect(at(1240, 2)).toBe(1200); // 많이 끌었으면 튕겨도 가까운 날(한 화면씩 아님)
    expect(swipeTarget({ base: 100, left: 0, v: -1, w: 100, max: 5000 })).toBe(0);
    expect(swipeTarget({ base: 4900, left: 5000, v: 1, w: 100, max: 5000 })).toBe(5000);
  });
});
