// 달력 좌우 넘기기(폰 손가락). 11-19 사람 "아래로 내릴 때랑 옆으로 넘길 때가 자꾸 충돌", "노션 등에서 쓰이는 탄성 느낌".
// 위아래: 칸이 touch-action: pan-y(feedback1114.css)라 브라우저가 그대로 굴린다(관성 포함). 처음 움직임이 옆이면 브라우저가
//   굴리지 않고 손가락을 여기로 넘긴다 = 방향 잠금. 그래서 옆으로 넘기는 동안 위아래가 같이 흔들리지 않는다.
// 옆: 손가락을 그대로 따라가고, 놓으면 빠르기·거리로 하루 앞뒤(많이 끌었으면 가까운 날) 또는 제자리를 골라 용수철로 붙는다.
//   11-19 10:06 사람 "보는 날짜 개수와 상관없이 하루단위로", "모션이 너무 강해" → 한 화면씩 → 하루씩, 지나쳤다 돌아오는 튕김 없앰.
// 마우스 · 트랙패드는 예전처럼 브라우저가 굴린다(칸 단위로 붙음). 멈춘 뒤 start 옮기기는 WeekCalendar의 settle이 한다(scrollend).
import { useEffect, useRef } from 'react';

const FLICK = 0.3; // px/ms. 이보다 빠르게 튕기면 거리가 짧아도 하루 넘긴다
const HALF = 0.3; // 날 칸의 이만큼 넘게 끌었으면 넘긴다
// 용수철(react-spring 단위). 감쇠비 = 32 / (2√260) ≈ 1 → 지나침 없이 0.4~0.5초에 멈춤(11-19 계산: 2000px/s로 튕겨도 0px).
// 18이면 약 12~19px 지나쳤다 돌아와 '너무 강하다'였다. 더 통통 = FRICTION을 낮게, 더 차분 = 높게
const TENSION = 260;
const FRICTION = 32;

/**
 * 손을 뗐을 때 붙을 scrollLeft. base = 끌기 시작한 날 칸 자리, left = 지금, v = 빠르기(px/ms, + = 다음 날 쪽),
 * w = 날 칸 너비, max = 굴릴 수 있는 끝. 보는 날 수와 상관없이 하루 단위.
 */
export function swipeTarget({ base, left, v, w, max }) {
  let days = Math.round((left - base) / w);
  if (days === 0 && (Math.abs(v) > FLICK || Math.abs(left - base) > w * HALF)) days = Math.sign(Math.abs(v) > FLICK ? v : left - base);
  return Math.min(max, Math.max(0, base + days * w));
}

// scRef = 굴리는 칸, colW() = 날 칸 너비. → busy ref(true = 넘기는 중, 그동안 settle은 기다린다)
export default function useSwipe(scRef, colW) {
  const busy = useRef(false);
  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return undefined;
    let g = null; // 손가락 하나: { id, x0, y0, left0, x, t, v, on }
    let raf = 0;
    let goal = null; // 용수철이 가던 곳(도중에 다시 잡으면 거기서 이어 센다)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const land = (to) => {
      sc.scrollLeft = to;
      sc.style.scrollSnapType = '';
      goal = null;
      busy.current = false;
      sc.dispatchEvent(new Event('scrollend')); // WeekCalendar settle → start 옮기기
    };
    const spring = (to, v0) => {
      goal = to;
      if (still) return land(to);
      let x = sc.scrollLeft;
      let v = v0 * 1000; // px/s
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        v += (-TENSION * (x - to) - FRICTION * v) * dt;
        x += v * dt;
        if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) return land(to);
        sc.scrollLeft = x;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const base = (left) => (goal != null ? goal : Math.round(left / colW()) * colW());
    const release = (v) => {
      const w = colW();
      const was = g;
      g = null;
      if (!w) return void (busy.current = false);
      const to = was.on ? swipeTarget({ base: was.base, left: sc.scrollLeft, v, w, max: sc.scrollWidth - sc.clientWidth }) : was.base;
      spring(to, was.on ? v : 0);
    };

    const down = (e) => {
      if (e.pointerType !== 'touch') return;
      if (g && !e.isPrimary) return release(0); // 두 손가락(확대·축소)이 오면 넘기기는 제자리로
      if (!e.isPrimary || e.target.closest?.('.ev.selected, .ev-grip')) return; // 고른 일정 끌기는 useEventDrag 몫
      const moving = goal != null;
      cancelAnimationFrame(raf);
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: base(sc.scrollLeft), left0: sc.scrollLeft, x: e.clientX, t: e.timeStamp, v: 0, on: false };
      busy.current = moving; // 미끄러지던 중에 잡았으면 그 자리에 멈춰 둔다
    };
    const move = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      if (!g.on) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - g.y0)) return;
        g.on = true;
        busy.current = true;
        sc.style.scrollSnapType = 'none'; // 끄는 동안 브라우저가 칸에 붙이지 않게
      }
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.v = 0.7 * ((g.x - e.clientX) / dt) + 0.3 * g.v;
      if (e.timeStamp - g.t > 80) g.v = 0; // 멈췄다 떼면 튕기지 않게
      g.x = e.clientX;
      g.t = e.timeStamp;
      sc.scrollLeft = g.left0 - dx;
    };
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const on = g.on;
      release(e.timeStamp - g.t > 80 ? 0 : g.v);
      if (!on) return;
      // 끌고 난 뒤 따라오는 click(빈 칸 → 일정 넣기 창)은 먹는다
      const eat = (c) => (c.stopPropagation(), c.preventDefault());
      sc.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => sc.removeEventListener('click', eat, { capture: true }), 400);
    };
    const cancel = (e) => {
      if (g && e.pointerId === g.id) release(0); // 브라우저가 위아래로 가져감 → 옆은 제자리
    };
    sc.addEventListener('pointerdown', down);
    sc.addEventListener('pointermove', move);
    sc.addEventListener('pointerup', up);
    sc.addEventListener('pointercancel', cancel);
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('pointerdown', down);
      sc.removeEventListener('pointermove', move);
      sc.removeEventListener('pointerup', up);
      sc.removeEventListener('pointercancel', cancel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return busy;
}
