// 폰에서 정면 창(Sheet front · 메모 즉시 확인 .popup.front)을 위로 올릴지(디자인 ⑤ '글 칸에 초점이 가면 창을 위로 올려 글자판에 안 가리게').
// 글자판이 뜨는 칸(글 · 숫자 칸)에 처음 초점이 가면 올리고, 창이 열려 있는 동안은 그대로 둔다.
// 날짜 · 시각 칸은 글자판 대신 고르기 창이 떠서 올리지 않는다 — 전에는 초점만으로 창이 움직여서, 처음 누를 때 칸이 손가락 밑에서
// 비켜 시각 고르기 창이 안 뜨고 한 번 더 눌러야 했다(사람 11-13 13:20 "한 번 팝업창이 위로 올라간 후 시간 다시 눌러야 수정이 됨").
// 한 번 올린 뒤 내리지 않는 것도 같은 까닭: 이름을 고치다 시각 칸을 누를 때 창이 다시 가운데로 움직이지 않게.
import { useCallback, useState } from 'react';

const NO_KEYBOARD = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image', 'hidden']);

export const opensKeyboard = (el) =>
  Boolean(el) && !el.readOnly && !el.disabled && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NO_KEYBOARD.has(el.type)));

// → [lifted, onFocus] — onFocus를 창 바깥 틀에 단다(React onFocus는 안쪽 칸에서 올라온다)
export function useLift() {
  const [lifted, setLifted] = useState(false);
  const onFocus = useCallback((e) => {
    if (opensKeyboard(e.target)) setLifted(true);
  }, []);
  return [lifted, onFocus];
}
