// 화면까지 바뀌는 테마('입자' · '종이') = 시연 9판의 화면. 고르면 themes.js가 <html data-skin>에 이름을 적고 'tachyon-skin'을 알린다.
import { useSyncExternalStore } from 'react';

const onSkin = (cb) => {
  window.addEventListener('tachyon-skin', cb);
  return () => window.removeEventListener('tachyon-skin', cb);
};
// 지금 입힌 화면 테마 이름. 원래 화면이면 ''
export const useSkin = () => useSyncExternalStore(onSkin, () => document.documentElement.dataset.skin || '');

// 폰 너비인가(원래 화면과 같은 기준: 900px부터 넓은 화면)
const narrow = window.matchMedia('(max-width: 899px)');
const onNarrow = (cb) => {
  narrow.addEventListener('change', cb);
  return () => narrow.removeEventListener('change', cb);
};
export const usePhone = () => useSyncExternalStore(onNarrow, () => narrow.matches);

// 일정·할 일의 색: 제목이 같으면 늘 같은 색
export const PAL = ['#8f7bff', '#35e0c0', '#ff6fb5', '#5aa2ff', '#ffa04a'];
export const colorOf = (title) => PAL[[...String(title)].reduce((sum, ch) => (sum * 31 + ch.codePointAt(0)) % 997, 7) % PAL.length];

export const CHECK = (
  <svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true">
    <path d="M2.5 6.4l2.4 2.4 4.6-5.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
