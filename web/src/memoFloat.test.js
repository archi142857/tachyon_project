// 작은 메모 창 팝업(11-19 사람 "다른 창을 보고 있을 때도 위로 팝업으로 … 타키온 창을 보고 있으면 그냥 저대로"):
// 창 키우기는 브라우저가 손 누름 바로 뒤에만 허락한다(Document PiP resizeTo/resizeBy — 아니면 NotAllowedError).
// 키우면 true, 못 키우면 false(→ 팝업은 Tachyon 창, 작은 창엔 '여기서 고르기'), 닫으면 키우기 전 크기로.
import { describe, expect, it } from 'vitest';
import { POPUP_SIZE, fitFloat, growFloat, shrinkFloat } from './components/MemoFloat.jsx';

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

  it('글이 창보다 길면(고치기) 그만큼 키우되 화면 높이 - 40을 넘지 않음, 짧으면 그대로', () => {
    const win = fakeWin({ w: 470, h: 560 });
    fitFloat(win, 300);
    expect(win.calls).toEqual([]);
    fitFloat(win, 800);
    expect(win.calls.at(-1)).toEqual([470, 832]);
    fitFloat(win, 2000);
    expect(win.calls.at(-1)).toEqual([470, 960]);
    win.allow = false;
    expect(() => fitFloat(win, 2000)).not.toThrow();
  });
});
