// 지금 화면에 입힌 테마 이름(기본이면 DEFAULT). 테마 창이 html의 data-theme을 바꾸면 다시 그린다.
// 입자 테마('입자 밤'·'입자 낮')에서만 하루 고리를 팀원 시연 9판의 입자 모양으로 그린다
// (사람 11-12 07:11 "입자 테마에서 디자인을 바꾸란 거였음. 나머지는 원래대로").
import { useEffect, useState } from 'react';
import { DEFAULT } from './themes.js';

export const PARTICLE_THEMES = new Set(['입자 밤', '입자 낮']);
const read = () => (typeof document === 'undefined' ? DEFAULT : document.documentElement.dataset.theme || DEFAULT);

export function useThemeName() {
  const [name, setName] = useState(read);
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setName(read()));
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    setName(read());
    return () => mo.disconnect();
  }, []);
  return name;
}

export const useParticles = () => PARTICLE_THEMES.has(useThemeName());

// 입자 테마(9판)의 색: 첫 낱말(보통 과목 이름)이 같으면 같은 색 — '일반화학 퀴즈'와 '일반화학 퀴즈 준비'가 한 색(9판 과목 색)
const PAL = ['#8f7bff', '#35e0c0', '#ff6fb5', '#5aa2ff', '#ffa04a'];
export const tint = (title = '') => PAL[[...String(title).trim().split(/\s+/)[0]].reduce((sum, ch) => (sum * 31 + ch.codePointAt(0)) % 997, 7) % PAL.length];
