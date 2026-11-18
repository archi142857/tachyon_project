// 달력 좌우 넘기기(components/useSwipe.js): 손을 뗐을 때 붙을 자리 — 한 화면(n일) 앞뒤 또는 제자리
import { describe, expect, it } from 'vitest';
import { swipeTarget } from './components/useSwipe.js';

const at = (left, v) => swipeTarget({ base: 1000, left, v, w: 100, n: 3, max: 5000 }); // 날 칸 100px, 한 화면 3일 = 300px

describe('useSwipe', () => {
  it('조금 끌고 천천히 놓으면 제자리', () => {
    expect(at(1050, 0.05)).toBe(1000);
    expect(at(960, -0.05)).toBe(1000);
  });
  it('짧아도 빠르게 튕기면 한 화면, 튕긴 쪽으로', () => {
    expect(at(1030, 0.6)).toBe(1300);
    expect(at(980, -0.6)).toBe(700);
    expect(at(1030, -0.6)).toBe(700); // 끈 쪽이 아니라 마지막 빠르기 쪽
  });
  it('천천히여도 한 화면의 30 % 넘게 끌면 넘긴다', () => {
    expect(at(1100, 0)).toBe(1300);
    expect(at(880, 0)).toBe(700);
  });
  it('여러 화면 끌면 가까운 화면, 끝을 넘지 않게', () => {
    expect(at(1640, 0)).toBe(1600);
    expect(swipeTarget({ base: 100, left: 0, v: -1, w: 100, n: 3, max: 5000 })).toBe(0);
    expect(swipeTarget({ base: 4900, left: 5000, v: 1, w: 100, n: 3, max: 5000 })).toBe(5000);
  });
});
