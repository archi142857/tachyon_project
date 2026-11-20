// 작은 메모 창 팝업(11-19 사람 "다른 창을 보고 있을 때도 위로 팝업으로 … 타키온 창을 보고 있으면 그냥 저대로"):
// 창 키우기는 브라우저가 손 누름 바로 뒤에만 허락한다(Document PiP resizeTo/resizeBy — 아니면 NotAllowedError).
// 키우면 true, 못 키우면 false(→ 팝업은 Tachyon 창, 작은 창엔 '여기서 고르기'), 닫으면 키우기 전 크기로.
import { describe, expect, it } from 'vitest';
import { POPUP_SIZE, activeWindow, centerOf, fitCenter, fitFloat, growFloat, shrinkFloat } from './components/MemoFloat.jsx';

// 가짜 작은 창: 제목 줄 32px, allow = 손 누름 뒤인지
function fakeWin({ allow = true, w = 420, h = 150, avail = 1000 } = {}) {
  const win = { outerWidth: w, outerHeight: h, innerHeight: h - 32, screen: { availHeight: avail }, calls: [], allow };
  win.resizeTo = (x, y) => {
    if (!win.allow) throw new Error('NotAllowedError');
    win.calls.push([x, y]);
    win.outerWidth = x;
    win.outerHeight = y;
    win.innerHeight = y - 32;
  };
  return win;
}

describe('작은 창 키우기 · 되돌리기', () => {
  it('손 누름 뒤면 팝업 크기로 키우고, 닫으면 그 전 크기로', () => {
    const win = fakeWin();
    expect(growFloat(win)).toBe(true);
    expect([win.outerWidth, win.outerHeight]).toEqual(POPUP_SIZE);
    shrinkFloat(win);
    expect([win.outerWidth, win.outerHeight]).toEqual([420, 150]);
    shrinkFloat(win); // 두 번째는 할 일 없음
    expect(win.calls.length).toBe(2);
  });

  it('손 누름 허락이 지났으면 false — 크기는 그대로, 되돌릴 것도 없음', () => {
    const win = fakeWin({ allow: false });
    expect(growFloat(win)).toBe(false);
    win.allow = true;
    shrinkFloat(win);
    expect(win.calls).toEqual([]);
  });

  it('사람이 이미 크게 끌어 둔 창은 줄이지 않고, 닫으면 그 크기 그대로', () => {
    const win = fakeWin({ w: 600, h: 700 });
    expect(growFloat(win)).toBe(true);
    expect([win.outerWidth, win.outerHeight]).toEqual([600, 700]);
    shrinkFloat(win);
    expect([win.outerWidth, win.outerHeight]).toEqual([600, 700]);
  });

  it('창이 없으면 false', () => {
    expect(growFloat(null)).toBe(false);
    expect(() => shrinkFloat(null)).not.toThrow();
  });

  it('창 높이를 글에 딱 맞춤(11-20 "밑에 여백 안 남게"): 길면 키우되 화면 높이 - 40까지, 짧으면 줄이되 160까지', () => {
    const win = fakeWin({ w: 470, h: 560 });
    fitFloat(win, 300);
    expect(win.calls.at(-1)).toEqual([470, 332]);
    fitFloat(win, 800);
    expect(win.calls.at(-1)).toEqual([470, 832]);
    fitFloat(win, 2000);
    expect(win.calls.at(-1)).toEqual([470, 960]);
    fitFloat(win, 50);
    expect(win.calls.at(-1)).toEqual([470, 160]);
    const n = win.calls.length;
    fitFloat(win, 128 + 2); // 이미 맞으면(4px 안) 그대로
    expect(win.calls.length).toBe(n);
    win.allow = false;
    expect(() => fitFloat(win, 2000)).not.toThrow();
  });
});

describe('가운데 새 창(11-20 사람 "새로운 창으로 가운데에 띄워줘")', () => {
  it('손 누름이 있었던 창에서만 연다', () => {
    const a = { closed: false, navigator: { userActivation: { isActive: false } } };
    const b = { closed: false, navigator: { userActivation: { isActive: true } } };
    expect(activeWindow(a, b)).toBe(b);
    expect(activeWindow(null, a)).toBe(null);
    expect(activeWindow({ ...b, closed: true })).toBe(null);
  });
  it('그 화면의 가운데(작업 표시줄 뺀 자리, 둘째 화면이면 그 화면 안)', () => {
    expect(centerOf({ availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 }, 460, 400)).toEqual([730, 320]);
    expect(centerOf({ availLeft: 1920, availTop: 0, availWidth: 2560, availHeight: 1400 }, 460, 400)).toEqual([2970, 500]);
    expect(centerOf({}, 460, 400)).toEqual([0, 0]);
  });
  it('높이를 글에 맞추고 다시 가운데로', () => {
    const win = fakeWin({ w: 476, h: 480, avail: 1040 });
    win.screen = { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 };
    const moved = [];
    win.moveTo = (x, y) => moved.push([x, y]);
    fitCenter(win, 300);
    expect(win.calls.at(-1)).toEqual([476, 332]);
    expect(moved.at(-1)).toEqual([722, 354]);
  });
});
