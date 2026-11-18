// 달력 좌우 넘기기(폰 손가락). 11-19 사람 "아래로 내릴 때랑 옆으로 넘길 때가 자꾸 충돌", "노션 등에서 쓰이는 탄성 느낌".
// 위아래: 칸이 touch-action: pan-y(feedback1114.css)라 브라우저가 그대로 굴린다(관성 포함). 처음 움직임이 옆이면 브라우저가
//   굴리지 않고 손가락을 여기로 넘긴다 = 방향 잠금. 그래서 옆으로 넘기는 동안 위아래가 같이 흔들리지 않는다.
// 옆: 손가락을 그대로 따라가고, 놓으면 빠르기·거리로 한 화면(n일) 앞뒤 또는 제자리를 골라 용수철로 붙는다(조금 지나쳤다 돌아옴).
// 마우스 · 트랙패드는 예전처럼 브라우저가 굴린다(칸 단위로 붙음). 멈춘 뒤 start 옮기기는 WeekCalendar의 settle이 한다(scrollend).
import { useEffect, useRef } from 'react';

const FLICK = 0.3; // px/ms. 이보다 빠르게 튕기면 거리가 짧아도 한 화면 넘긴다
const HALF = 0.3; // 한 화면의 이만큼 넘게 끌었으면 넘긴다
// 용수철(react-spring 단위). 감쇠비 = 18 / (2√200) ≈ 0.64 → 60fps에서 튕겨 넘기면 약 12px 지나쳤다 돌아오고 0.5초에 멈춤
// (24면 지나침이 0이라 탄성이 안 느껴진다 — 11-19 계산). 더 통통 = FRICTION을 낮게, 더 차분 = 높게
const TENSION = 200;
const FRICTION = 18;

/**
 * 손을 뗐을 때 붙을 scrollLeft. base = 끌기 시작한 날 칸 자리, left = 지금, v = 빠르기(px/ms, + = 다음 날 쪽),
 * w = 날 칸 너비, n = 한 화면 날 수, max = 굴릴 수 있는 끝.
 */
export function swipeTarget({ base, left, v, w, n, max }) {
  const page = w * n;
  let pages = Math.round((left - base) / page);
  if (pages === 0 && (Math.abs(v) > FLICK || Math.abs(left - base) > page * HALF)) pages = Math.sign(Math.abs(v) > FLICK ? v : left - base);
  return Math.min(max, Math.max(0, base + pages * page));
}

// scRef = 굴리는 칸, colW() = 날 칸 너비, n = 한 화면 날 수. → busy ref(true = 넘기는 중, 그동안 settle은 기다린다)
export default function useSwipe(scRef, colW, n) {
  const busy = useRef(false);
  const nRef = useRef(n);
  nRef.current = n;
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
      const to = was.on ? swipeTarget({ base: was.base, left: sc.scrollLeft, v, w, n: nRef.current, max: sc.scrollWidth - sc.clientWidth }) : was.base;
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
