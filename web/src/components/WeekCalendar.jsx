// 주간 달력. 첫 칸은 start(처음엔 오늘), n = 한 화면에 보이는 날 수: 하루 · 3일 · 주(11-14 피드백, 폰은 처음 3일).
// 좌우는 굴리기(11-15 사람 "노션 캘린더처럼 스와이프하면서 부드럽게, 좌우 스크롤"): 앞뒤로 pad(n)일씩 더 그려 두고 손·트랙패드로 굴린다.
//   멈추면(날 칸 경계에 붙음) 맨 왼쪽 날로 onMove(며칠) → 부모가 start를 옮긴다. 그려 둔 칸은 그대로 두고, 가장자리 가까이 가면 그때만 start를 가운데로 다시 그린다(화면은 그대로). 앞뒤 제한 없음.
// 위아래: 0~24시 전체(11-20 사람 "달력 가독성이 너무 안좋아 … 대폭"): 한 시간 높이는 CSS --cal-hour-base(폰 52 · 넓은 화면 58px),
//   두 손가락(트랙패드는 ctrl+휠)으로 확대·축소(이 기기에 기억). 처음엔 지금 시각(밤이면 그 주 첫 일정) 조금 위로 굴려 둔다.
//   짧은 일정은 22px까지 키워 '08:00 제목' 한 줄로(겹침 계산도 그 높이로), 길면 제목 + 시각 · 장소.
// 빈 칸을 누르면 그 30분 자리로 onAdd(날, 분) — 일정 넣기 창(11-14). 일정은 한 번 눌러 고른 뒤에만 끌어 옮기고 아래 끝으로 길이를 바꾼다
//   (11-15 사람 "달력 넘기는데 클릭돼서 불평" → 고르지 않은 일정은 끌리지 않음). 고른 일정을 한 번 더 누르면 자세히(onEvent).
// 지금 선은 오늘이 보이면 늘 보인다(축이 0~24시라 밤에도 — 11-14 '실시간 선이 안 뜸').
// 날짜 숫자를 그날 밀도 고리(DensityRing)가 감싸고(11-13 사람 '바쁨도 밀도 고리가 날짜 숫자를 감싸도록'), 밑에 쓰는 시간. 날짜를 누르면 그날로 메모 칸을 연다(onDay). ('고르게' 막대 줄과 설명은 11-12 사람 "없어도 될 듯"으로 뺐다 — 고르게 나눈 것은 고리와 할 일 쪽 '나눠 둔 몫'에 보인다.)
// 맨 위 줄은 과제 마감(시각을 붙여서)과 하루 종일 일정, 아래는 시간 칸. 중요한 일정은 굵은 테두리.
// 모든 테마가 같은 달력(사람 11-15 16:52, 기본 테마 기준): 1시간 눈금 · 맨 위 '마감' 줄 · 오늘 칸의 지금 선 + 칸을 가로지르는 옅은 점선과 시각(예전 입자 9판 .nl) ·
// 일정 칸에 시각과 장소 · 지난 일정은 옅게 · 이번 주가 오늘부터면 제목 옆 '오늘부터'. 모양(색 · 글꼴 · 날짜 고리 그림)만 테마 몫.
// 앞 수업에서 걸어오는 시간이 쉬는 시간보다 길면 칸 안에 빨간 'N분 지각'(TT Wizard 말투, legs = campus.js dayLegs).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { arriveText, lateOf } from '../campus.js';
import { hm } from '../slots.js';
import { hoursText } from '../density.js';
import { endOf, hourRange, isAllDay, layoutDay } from '../layout.js';
import { addDays, dayIndex, dayStartKst, deadlineLabel, endOrHour, hhmm, kst, minuteOfDay, toKstIso, WEEKDAYS, weekTitle } from '../time.js';
import DensityRing from './DensityRing.jsx';
import Icon from './Icon.jsx';
import { tint } from '../themeName.js';
import useEventDrag from './useEventDrag.js';

// 마우스 · 트랙패드가 있는 기기: 고르지 않아도 길이 손잡이가 일정 아래 끝에 있다
const FINE = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
import useSwipe from './useSwipe.js';

const timeText = (ev) => `${hhmm(ev.start)}–${hhmm(endOrHour(ev.start, ev.end))}`; // 끝이 없으면 1시간(11-13)

// 마우스를 올리면 보이는 한 줄(title)
function eventLabel(ev, leg) {
  const late = lateOf(leg && leg.arrive);
  const walk = leg && leg.arrive ? `${arriveText(leg.arrive)}${late ? ` — ${late}분 지각` : ''}` : null;
  return [ev.title, timeText(ev), ev.place, ev.important ? '중요' : null, walk].filter(Boolean).join(', ');
}

const used = (d) => (d ? d.eventMin + d.taskMin + d.over : 0);
const weekend = (day) => ['', '', '', '', '', ' sat', ' sun'][kst(day).wd]; // 토 파랑 · 일 빨강(우리 달력 버릇)

// 다 같이 빈 시간 띠(11-13, 디자인 넷째 묶음 ①)의 끝 글자: 자정이면 24:00
const spanEnd = (sp) => (sp.end.slice(0, 10) !== sp.start.slice(0, 10) && hhmm(sp.end) === '00:00' ? '24:00' : hhmm(sp.end));

// density(date) → 그날 밀도(density.js) 또는 null
// together = { name, spans: [{ start, end }] } 고른 그룹의 다 같이 빈 시간(없으면 null) → 칸마다 일정 뒤에 띠.
// 띠를 누르면 onTogether({ start, end }) — 누른 30분부터 1시간(띠 끝까지), 키보드로는 띠 처음부터

/** 보이는 날 앞뒤로 더 그려 둘 날 수(굴릴 몫). 부모도 이만큼 넓게 일정을 불러온다 */
export const calPad = (n) => Math.max(7, 2 * n);

const ZOOM_KEY = 'tachyon_cal_zoom2'; // 11-20 한 시간 기준이 바뀌어 예전 배율(…_zoom)은 버린다
const MIN_PX = 22; // 짧은 일정도 한 줄은 읽히게
const MAX_HOUR = 160;
function readZoom() {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z > 0 && z < 20 ? z : 1;
  } catch {
    return 1;
  }
}
function saveZoom(z) {
  try {
    localStorage.setItem(ZOOM_KEY, String(Math.round(z * 1000) / 1000));
  } catch {
    /* 이번에만 */
  }
}

/**
 * 한 시간 높이(px). auto = 읽기 좋은 기본(base, CSS --cal-hour-base)과 '하루가 한 화면'(fit) 중 큰 것.
 * (예전엔 맨 짧은 일정에 맞춰 120px까지 늘려 하루가 텅 빈 칸으로 보였다 — 11-20)
 * zoom = 두 손가락으로 바꾼 배율(1 = 기본). 하루가 한 화면보다 작게는, 160px보다 크게는 안 된다.
 */
export const autoHour = ({ fit, base }) => Math.max(fit, base);
/** 배율을 되는 범위로: 하루가 한 화면(fit)보다 작게, 160px보다 크게는 안 된다 */
export const clampZoom = (zoom, auto, fit) => Math.min(MAX_HOUR / auto, Math.max(Math.min(fit, auto) / auto, zoom));

// tools = 머리 끝에 붙일 것(폰의 '보기 고르기' 단추, Dashboard)
export default function WeekCalendar({ start, n = 7, events, tasks, now, density, isCurrent, onMove, onToday, onJump, onEvent, onTask, onDay, onAdd, onDrop, legs, together, onTogether, tools }) {
  const pad = calPad(n);
  const total = n + 2 * pad; // 그려 두는 날 수
  // 그려 둔 날들은 anchor를 가운데로 둔다. 굴려 멈출 때마다 start만 바뀌고 칸은 그대로 — 가장자리 가까이 가야 다시 그린다(11-16 사람 "칸 멈추는게 너무 끊기고 불편해")
  const [anchor, setAnchor] = useState(start);
  const from0 = addDays(anchor, -pad); // 그려 둔 첫 날(화면 밖 왼쪽)
  const at = dayIndex(from0, start, total); // start가 그려 둔 날의 몇째 칸인지(-1 = 밖)
  const atRef = useRef(at);
  atRef.current = at;
  const days = Array.from({ length: total }, (_, i) => addDays(from0, i));
  const todayIdx = dayIndex(from0, now, total);
  const showNow = todayIdx >= 0 && todayIdx < total;
  const nowHour = minuteOfDay(now) / 60;
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  const shown = timed.filter((e) => dayIndex(from0, e.start, total) >= 0);
  // 축은 늘 0~24시, 눈금은 모든 테마가 1시간마다(사람 11-15 16:52 "테마가 달라도 위치·레이아웃·기능은 같게")
  const first = 0;
  const last = 24;
  const hourAt = (date) => minuteOfDay(date) / 60 - first;
  const nowTop = hourAt(now);

  const dens = days.map((d) => density(d));

  // ── 굴리는 칸(좌우 · 위아래) ──
  const scRef = useRef(null);
  const stickRef = useRef(null);
  const [view, setView] = useState({ h: 0, stick: 0, base: 52 }); // 굴리는 칸 높이 · 위 머리 높이 · 기본 한 시간 높이(--cal-hour-base)
  const [zoom, setZoom] = useState(readZoom);
  const fitHour = view.h ? (view.h - view.stick) / (last - first) : 0;
  const auto = view.h ? autoHour({ fit: fitHour, base: view.base }) : 0;
  const hour = auto ? auto * clampZoom(zoom, auto, fitHour) : null;
  const colW = () => scRef.current?.querySelector('.cal-grid > .col')?.getBoundingClientRect().width || 0;
  // start 칸을 맨 왼쪽에. 이미 거기면(굴려 멈춘 자리를 알린 뒤) 건드리지 않는다 — 손이 만든 움직임을 끊지 않게
  const center = () => {
    const sc = scRef.current;
    const w = colW();
    if (sc && w && atRef.current >= 0 && Math.abs(sc.scrollLeft - atRef.current * w) > w / 2) sc.scrollLeft = atRef.current * w;
  };
  useLayoutEffect(() => {
    const sc = scRef.current;
    if (!sc || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      setView({ h: sc.clientHeight, stick: stickRef.current?.offsetHeight || 0, base: parseFloat(getComputedStyle(sc).getPropertyValue('--cal-hour-base')) || 52 });
      center();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    measure();
    return () => ro.disconnect();
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  // 앞뒤로 한 화면(n일) 넘게 남지 않으면(또는 '오늘'처럼 밖으로 뛰면) start를 가운데로 다시 그린다
  useLayoutEffect(() => {
    if (at < n || at > total - 2 * n) setAnchor(start);
    else center();
  }, [at, n]); // eslint-disable-line react-hooks/exhaustive-deps

  // 처음 한 번: 오늘이 보이고 지금이 그 주 일정 시간대 안이면 지금 시각 조금 위로, 아니면(밤 · 다른 주) 그 주 첫 일정 조금 위로
  const scrolledY = useRef(false);
  useLayoutEffect(() => {
    const sc = scRef.current;
    if (!hour || scrolledY.current || !sc) return;
    scrolledY.current = true;
    const range = hourRange(start, shown);
    const at = isCurrent && nowHour >= range.first - 1 && nowHour < range.last ? nowHour - 1.5 : range.first - 0.5;
    sc.scrollTop = Math.max(0, at * hour);
  }, [hour]); // eslint-disable-line react-hooks/exhaustive-deps

  // 좌우로 굴리다 멈추면 맨 왼쪽 날로 start를 옮긴다(칸은 그대로라 화면이 움직이지 않는다). 손가락이 닿아 있는 동안은 기다린다.
  // 손을 뗀 뒤 미끄러지는 동안에도 scroll이 계속 오니, 마지막 scroll에서 160ms 뒤(scrollend가 오면 그때) 멈춘 것으로 본다.
  // (예전엔 손을 뗀 160ms 뒤에 바로 옮겨서 미끄러지던 화면이 중간에 끊겼다 — 11-16)
  // 폰 손가락 좌우 넘기기는 useSwipe(방향 잠금 + 하루씩 용수철, 11-19). 넘기는 동안은 멈춘 것으로 보지 않는다
  const swiping = useSwipe(scRef, colW);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return undefined;
    let timer = null;
    let touching = false;
    const settle = () => {
      clearTimeout(timer);
      const w = colW();
      if (!w || touching || swiping.current) return;
      const k = Math.round(sc.scrollLeft / w);
      if (k === atRef.current) return;
      const by = k - atRef.current;
      atRef.current = k; // 부모가 다시 그리기 전에 또 멈춤이 와도 두 번 옮기지 않게
      moveRef.current?.(by);
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 160);
    };
    const onTouch = (e) => {
      touching = e.touches.length > 0;
      if (!touching) later();
    };
    sc.addEventListener('scroll', later, { passive: true });
    sc.addEventListener('scrollend', settle, { passive: true });
    sc.addEventListener('touchstart', onTouch, { passive: true });
    sc.addEventListener('touchend', onTouch, { passive: true });
    sc.addEventListener('touchcancel', onTouch, { passive: true });
    return () => {
      clearTimeout(timer);
      sc.removeEventListener('scroll', later);
      sc.removeEventListener('scrollend', settle);
      sc.removeEventListener('touchstart', onTouch);
      sc.removeEventListener('touchend', onTouch);
      sc.removeEventListener('touchcancel', onTouch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const slide = (dir) => scRef.current?.scrollBy({ left: dir * n * colW(), behavior: 'smooth' });

  // 두 손가락 벌리기·오므리기(트랙패드는 ctrl+휠) = 한 시간 높이 확대·축소. 손가락 가운데 시각이 제자리에 있게 위아래도 맞춘다
  const zoomRef = useRef({ zoom, hour, auto, fitHour });
  zoomRef.current = { zoom, hour, auto, fitHour };
  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return undefined;
    let pinch = null;
    const span = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    // z = 바랄 배율, midY = 손가락 가운데(화면 y). → 실제 배율. pinch.h = 바로 앞 한 시간 높이
    const apply = (z, midY) => {
      const { auto, fitHour: fit } = zoomRef.current;
      if (!auto) return z;
      const zc = clampZoom(z, auto, fit);
      const h = auto * zc;
      const grid = sc.querySelector('.cal-grid');
      const y = midY - sc.getBoundingClientRect().top;
      const at = (sc.scrollTop + y - grid.offsetTop) / pinch.h; // 손가락 가운데의 시각(맨 위부터 몇 시간)
      sc.style.setProperty('--hour', `${h}px`);
      sc.scrollTop = grid.offsetTop + at * h - y;
      pinch.h = h;
      return zc;
    };
    const down = (e) => {
      if (e.touches.length === 2 && zoomRef.current.hour) pinch = { d: span(e.touches), z: zoomRef.current.zoom, h: zoomRef.current.hour, last: zoomRef.current.zoom };
    };
    const move = (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      pinch.last = apply(pinch.z * (span(e.touches) / pinch.d), (e.touches[0].clientY + e.touches[1].clientY) / 2);
    };
    const up = (e) => {
      if (!pinch || e.touches.length >= 2) return;
      const z = pinch.last;
      pinch = null;
      setZoom(z);
      saveZoom(z);
    };
    const wheel = (e) => {
      if (!e.ctrlKey || !zoomRef.current.hour) return;
      e.preventDefault();
      pinch = { h: zoomRef.current.hour };
      const z = apply(zoomRef.current.zoom * Math.exp(-e.deltaY / 200), e.clientY);
      zoomRef.current = { ...zoomRef.current, zoom: z, hour: pinch.h }; // 다시 그리기 전에 잇따라 오는 휠도 이어서
      pinch = null;
      setZoom(z);
      saveZoom(z);
    };
    sc.addEventListener('touchstart', down, { passive: true });
    sc.addEventListener('touchmove', move, { passive: false });
    sc.addEventListener('touchend', up, { passive: true });
    sc.addEventListener('touchcancel', up, { passive: true });
    sc.addEventListener('wheel', wheel, { passive: false });
    return () => {
      sc.removeEventListener('touchstart', down);
      sc.removeEventListener('touchmove', move);
      sc.removeEventListener('touchend', up);
      sc.removeEventListener('touchcancel', up);
      sc.removeEventListener('wheel', wheel);
    };
  }, []);

  // 고른 일정(이것만 끌린다). 빈 칸을 누르거나 Esc면 놓는다
  const [sel, setSel] = useState(null);

  // 한 시간 높이(px)와 일정 글자 줄 높이: 칸에 들어가는 줄 수를 세려고 잰다
  const gridRef = useRef(null);
  const [fit, setFit] = useState({ hour: 40, lh: 15 });
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setFit({ hour: g.clientHeight / (last - first) || 40, lh: parseFloat(getComputedStyle(g).getPropertyValue('--ev-lh')) || 15 });
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    measure();
    return () => ro.disconnect();
  }, [last, first]);

  const hPx = hour || fit.hour; // 지금 한 시간 높이(px)
  const cols = () => (gridRef.current ? [...gridRef.current.querySelectorAll(':scope > .col')] : []);
  // 일정 잡기(11-21): 마우스는 누른 채 끌면 옮겨지고 그냥 누르면 열린다. 손가락은 누르면 열리고, 0.35초 꾹 누르면 잡혀(진동) 그대로 끌어 옮긴다
  const hold = useRef(null);
  const clearHold = () => {
    clearTimeout(hold.current?.t);
    hold.current = null;
  };
  useEffect(() => clearHold, []);
  function press(e, item) {
    if (!onDrop) return;
    if (e.pointerType === 'mouse' || sel === item.ev.id) return drag.start(e, item, 'move');
    clearHold();
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      t: setTimeout(() => {
        hold.current = null;
        setSel(item.ev.id);
        drag.start(e, item, 'move', true);
      }, 350),
    };
  }
  const drag = useEventDrag({
    cols,
    n: total,
    first,
    last,
    onDrop: onDrop && ((ev, to) => onDrop(ev, { start: toKstIso(new Date(days[to.day].getTime() + to.from * 60000)), end: toKstIso(new Date(days[to.day].getTime() + to.to * 60000)) })),
  });
  const ghostOf = (i) => drag.ghost && drag.ghost.day === i && drag.ghost;

  const top = days.map((day, i) => [
    ...tasks.filter((t) => t.due && dayIndex(from0, t.due, total) === i).map((t) => ({ kind: 'deadline', item: t })),
    ...allDay.filter((e) => new Date(e.start) <= day && endOf(e) > day.getTime()).map((e) => ({ kind: 'allday', item: e })),
  ]);
  const hasTop = top.some((items) => items.length);

  return (
    <section
      className="card cal wk"
      aria-label={n === 7 ? '주간 달력' : `${n}일 달력`}
      style={{ '--n': n, '--total': total }}
      onKeyDown={(e) => e.key === 'Escape' && sel && (e.stopPropagation(), setSel(null))}
    >
      <div className="cal-head">
        <h2 className="card-title num">
          {/* 제목을 누르면 날짜를 골라 그 주로 바로(11-21) */}
          {onJump ? (
            <>
              <button type="button" className="cal-jump" title="날짜로 가기" onClick={(e) => e.currentTarget.nextSibling.showPicker?.()}>
                {weekTitle(start, n)}
              </button>
              <input type="date" className="sr-only" tabIndex={-1} aria-label="날짜로 가기" onChange={(e) => e.target.value && onJump(dayStartKst(e.target.value))} />
            </>
          ) : (
            weekTitle(start, n)
          )}
          {isCurrent && <em>오늘부터</em>}
        </h2>
        {!isCurrent && (
          <button type="button" className="btn-text" onClick={onToday}>
            오늘
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`앞 ${n}일`} onClick={() => slide(-1)}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn" aria-label={`다음 ${n}일`} onClick={() => slide(1)}>
          <Icon name="right" />
        </button>
        {tools}
      </div>
      {sel && <p className="cal-sel-hint">끌어서 옮기기 · 아래 끝을 끌면 길이 조절 · 빈 곳을 누르면 놓기</p>}

      <div className="cal-scroll x" ref={scRef} style={{ '--hours': last - first, ...(hour ? { '--hour': `${hour}px` } : {}) }}>
      <div className="cal-stick" ref={stickRef}>
      <div className="cal-days">
        <span className="axis-label" aria-hidden="true" />
        {days.map((day, i) => {
          const d = dens[i];
          const p = kst(day);
          return (
            <button
              key={i}
              type="button"
              className={`cal-day${i === todayIdx ? ' today' : ''}${weekend(day)}`}
              aria-label={`${p.m}월 ${p.d}일 ${WEEKDAYS[p.wd]}요일${d ? `, 일정 ${hoursText(d.eventMin)}, 할 일 ${hoursText(d.taskMin + d.over)}` : ''}. 이 날에 넣기`}
              onClick={() => onDay?.(day)}
            >
              <span className="wd">{WEEKDAYS[p.wd]}</span>
              <span className="dn-ring">
                <DensityRing day={d} size={36} />
                <span className="dn num">{p.d}</span>
              </span>
              <span className="dh num">{used(d) ? `${Math.round((used(d) / 60) * 10) / 10}시간` : ''}</span>
            </button>
          );
        })}
      </div>

      {hasTop && (
        <div className="cal-top">
          <span className="axis-label">{top.some((items) => items.some((x) => x.kind === 'allday')) ? '종일' : '마감'}</span>
          {top.map((items, i) => (
            <div className="day" key={i}>
              {items.map(({ kind, item }) =>
                kind === 'deadline' ? (
                  <button key={`t${item.id}`} type="button" className="chip deadline" title={`${item.title} — ${deadlineLabel(item.due, now)}`} onClick={() => onTask(item)}>
                    <b className="num">{hhmm(item.due)}</b> {item.title}
                  </button>
                ) : (
                  <button key={`e${item.id}`} type="button" className="chip allday" style={{ '--c': tint(item.title) }} title={item.title} onClick={() => onEvent(item)}>
                    {item.title}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
      </div>

        <div className="cal-grid" ref={gridRef} style={{ height: `calc(var(--hour) * ${last - first})` }}>
          {Array.from({ length: (last - first) * 2 - 1 }, (_, i) => (
            <div key={i} className={i % 2 ? 'hline' : 'hline half'} style={{ top: `calc(var(--hour) * ${(i + 1) / 2})` }} aria-hidden="true" />
          ))}
          <div className="hours" aria-hidden="true">
            {Array.from({ length: last - first - 1 }, (_, i) => (
              <span key={i} className="num" style={{ top: `calc(var(--hour) * ${i + 1})` }}>
                {first + i + 1}시
              </span>
            ))}
          </div>
          {showNow && nowTop >= 0 && nowTop <= last - first && (
            <div className="nl" style={{ top: `calc(var(--hour) * ${nowTop})` }} aria-hidden="true">
              <span className="num">{hhmm(now).padStart(5, '0')}</span>
            </div>
          )}
          {days.map((day, i) => (
            <div
              className={`col${i === todayIdx ? ' today' : ''}${weekend(day)}`}
              key={i}
              onClick={(e) => {
                // 빈 칸 누르기 → 그 30분 자리에 일정 넣기(일정 · 띠를 누른 것은 그쪽이 받는다)
                if (e.target !== e.currentTarget) return;
                if (sel) return setSel(null); // 고른 일정이 있으면 먼저 놓기만
                if (!onAdd) return;
                const box = e.currentTarget.getBoundingClientRect();
                const min = first * 60 + Math.floor((((e.clientY - box.top) / box.height) * (last - first) * 60) / 30) * 30;
                onAdd(day, Math.min(min, 23 * 60 + 30));
              }}
            >
              {together?.spans
                .filter((sp) => dayIndex(from0, sp.start, total) === i)
                .map((sp) => {
                  const s0 = hourAt(sp.start);
                  const top = Math.max(s0, 0);
                  const bottom = Math.min(s0 + (Date.parse(sp.end) - Date.parse(sp.start)) / 3600000, last - first);
                  if (bottom <= top) return null;
                  const style = { top: `calc(var(--hour) * ${top})`, height: `calc(var(--hour) * ${bottom - top})` };
                  const label = `다 같이 빈 시간 ${hhmm(sp.start)}–${spanEnd(sp)}`;
                  if (!onTogether) return <i key={sp.start} className="together-band" style={style} aria-hidden="true" />;
                  return (
                    <button
                      key={sp.start}
                      type="button"
                      className="together-band"
                      style={style}
                      aria-label={`${label}, 모임 잡기`}
                      title={`${label} · ${together.name} — 누르면 이 시간으로 모임 잡기`}
                      onClick={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const at = e.detail && box.height ? (e.clientY - box.top) / box.height : 0; // 키보드(detail 0)는 처음부터
                        const startMs = Date.parse(sp.start);
                        const endMs = Date.parse(sp.end);
                        const pickedMin = (top - s0) * 60 + at * (bottom - top) * 60;
                        const from = Math.min(startMs + Math.floor(pickedMin / 30) * 30 * 60000, endMs - 30 * 60000);
                        onTogether({ start: toKstIso(new Date(from)), end: toKstIso(new Date(Math.min(from + 60 * 60000, endMs))) });
                      }}
                    />
                  );
                })}
              {layoutDay(timed.filter((e) => dayIndex(from0, e.start, total) === i), (MIN_PX / hPx) * 3600000).map(({ ev, col, cols }) => {
                const s = hourAt(ev.start);
                const len = Math.min((endOf(ev) - Date.parse(ev.start)) / 3600000, last - first - s);
                // 칸 높이(px)로 글 모양: 40px 아래는 '08:00 제목' 한 줄, 그 위는 제목(들어가는 만큼, 넘치면 …) + 시각 · 장소 한 줄(11-14 반쯤 잘린 글자 없게)
                const px = Math.max(len * hPx, MIN_PX);
                const one = px < 40;
                const lines = Math.max(1, Math.floor((px - 8) / fit.lh) - 1);
                const leg = legs && legs.get(ev.id);
                const late = lateOf(leg && leg.arrive);
                const from = minuteOfDay(ev.start);
                const item = { ev, day: i, from, to: from + Math.round((endOf(ev) - Date.parse(ev.start)) / 60000) };
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`ev ${ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics'}${one ? ' one' : ''}${ev.important ? ' important' : ''}${late > 0 ? ' late-ev' : ''}${endOf(ev) < new Date(now).getTime() ? ' past' : ''}${drag.ghost?.id === ev.id ? ' lifting' : ''}${sel === ev.id ? ' selected' : ''}`}
                    style={{
                      top: `calc(var(--hour) * ${s} + 1px)`,
                      height: `max(calc(var(--hour) * ${len} - 2px), ${MIN_PX}px)`,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                      '--c': tint(ev.title),
                    }}
                    title={eventLabel(ev, leg)}
                    aria-pressed={onDrop ? sel === ev.id : undefined}
                    onPointerDown={(e) => press(e, item)}
                    onPointerMove={(e) => hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 10 && clearHold()}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onContextMenu={(e) => (sel === ev.id || hold.current) && e.preventDefault()}
                    onClick={() => !drag.takeClick() && onEvent(ev)} // 누르면 바로 열린다(11-21 원터치)
                  >
                    {/* 이름은 보이는 글자 그대로 + 화면 읽기용 시각·중요(보이는 글자가 이름 안에 있어야 한다) */}
                    <span className="sr-only">{timeText(ev)}, </span>
                    <span className="ev-t" style={{ '--lines': one ? 1 : lines }}>
                      {ev.title}
                    </span>
                    <span className="ev-m num">{one ? hhmm(ev.start) : [timeText(ev), ev.place].filter(Boolean).join(' · ')}</span>
                    {ev.important ? <span className="sr-only">, 중요</span> : null}
                    {late > 0 && <span className="late-pill">{late}분 지각</span>}
                    {onDrop && (sel === ev.id || (FINE && !one)) && <span className="ev-grip" aria-hidden="true" onPointerDown={(e) => (e.stopPropagation(), drag.start(e, item, 'resize'))} />}
                  </button>
                );
              })}
              {ghostOf(i) && (
                <div className="ev-ghost" style={{ top: `calc(var(--hour) * ${ghostOf(i).from / 60 - first})`, height: `calc(var(--hour) * ${(ghostOf(i).to - ghostOf(i).from) / 60})` }} aria-hidden="true">
                  <span className="when num">
                    {hm(ghostOf(i).from)}–{hm(ghostOf(i).to)}
                  </span>
                </div>
              )}
              {i === todayIdx && nowTop >= 0 && nowTop <= last - first && (
                <div className="now-line" role="img" style={{ top: `calc(var(--hour) * ${nowTop})` }} aria-label={`지금 ${hhmm(now)}`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
