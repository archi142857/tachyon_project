// 그림 테마(태양계 · 오선지 · 원자 모형 · 뉴모피즘)의 고리가 같이 쓰는 것: 좌표 · 호 · 시각 글자 · 누르는 띠 · 틀(svg + 가운데 글자 칸).
// 모든 고리가 지키는 '고리 약속'(web/design/README.md)은 여기서 정한다. 고리 파일은 그림만 다르게 그린다.
// 앱(DayRing.jsx)과 시안 쪽(web/design)이 같은 파일을 쓴다. svg 이름은 'art'(앱의 .ring 규칙이 그림에 번지지 않게).
import { useEffect, useState } from 'react';
import './art.css';
export { WAKE, hm } from '../../slots.js';
export { ringRuns } from '../DayRing.jsx'; // 붙은 일정 가르기(seps)는 앱 기본 고리와 같은 계산

export const VIEW = '-136 -136 272 272'; // 앱 고리와 같은 크기
export const MID_FREE = 56; // 가운데 글자 칸: 이 반지름 안에는 진한 그림을 두지 않는다
const HIT = 86; // 누르는 띠의 가운데 반지름(앱 DayRing의 MID와 거의 같다)

// timetable → 수업, ics · memo → 내 일정, slot → 할 일을 넣어 본 자리
export const look = (kind) => (kind === 'timetable' ? 'class' : kind === 'slot' ? 'slot' : 'mine');
export const KIND_NAME = { class: '수업', mine: '내 일정', slot: '할 일 자리' };

export const f1 = (v) => Number(v).toFixed(1);

/** 하루의 min분, 반지름 rad인 곳의 [x, y]. 0시가 맨 위, 시계 방향 */
export function point(rad, min) {
  const a = (min / 1440) * 2 * Math.PI - Math.PI / 2;
  return [rad * Math.cos(a), rad * Math.sin(a)];
}

/** min분 자리에서 시계 방향으로 가는 쪽의 각도(도). +x 쪽으로 그린 모양을 이만큼 돌리면 고리를 따라간다 */
export const deg = (min) => (min / 1440) * 360;

/** 반지름 rad에서 길이 1이 몇 분인지(모양 크기를 분으로 바꿀 때) */
export const minPerUnit = (rad) => 1440 / (2 * Math.PI * rad);

/** 그 자리로 옮기고(돌리고) — transform 글 */
export function at(rad, min, rotate = null) {
  const [x, y] = point(rad, min);
  return `translate(${f1(x)} ${f1(y)})${rotate === null ? '' : ` rotate(${f1(rotate)})`}`;
}

/** from~to(분)를 따라가는 호 */
export function arcPath(rad, from, to) {
  const b = Math.min(to, from + 1439);
  const [x1, y1] = point(rad, from);
  const [x2, y2] = point(rad, b);
  return `M${f1(x1)} ${f1(y1)}A${rad} ${rad} 0 ${b - from > 720 ? 1 : 0} 1 ${f1(x2)} ${f1(y2)}`;
}

/** 반지름 r1 → r2로 뻗는 선(min분 자리) */
export function radial(r1, r2, min) {
  const [x1, y1] = point(r1, min);
  const [x2, y2] = point(r2, min);
  return { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2) };
}

/** 같은 열쇠면 같은 수가 나오는 0~1 난수(그릴 때마다 별·새 자리가 바뀌지 않게) */
export function seeded(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 지난 일정 'past' · 지금 걸친 일정 'now' · 앞으로 '' */
export const when = (a, nowMin) => (a.to <= nowMin ? 'past' : a.from <= nowMin ? 'now' : '');

/** 움직임을 멈출지: 기기의 '동작 줄이기' 또는 시안 쪽의 '움직임 끄기'(html[data-still]) */
export function useStill() {
  const read = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.still === '1');
  const [still, setStill] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setStill(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-still'] });
    return () => mo.disconnect();
  }, []);
  return still;
}

const gap = (a, b) => Math.abs(((((a - b) % 1440) + 1440 + 720) % 1440) - 720); // 하루 둘레 위 두 분 사이(0~720)

/** 3시간마다 시각 글자. 지금 시각 글자와 겹치는 것, 정리 안 된 메모 점이 올라앉는 것은 뺀다(앱 화면에서 '2●4시'로 보였음, 11-13) */
export function HourLabels({ nowMin, rad = 126, loose = [] }) {
  return Array.from({ length: 8 }, (_, i) => {
    const h = i * 3;
    if (gap(h * 60, nowMin) < 70 || loose.some((m) => gap(h * 60, m) < 30)) return null;
    const [x, y] = point(rad, h * 60);
    return (
      <text key={h} className="hour" x={f1(x)} y={f1(y)}>
        {h || 24}시
      </text>
    );
  });
}

/** 지금 시각 글자 */
export function NowLabel({ nowMin, rad = 126, text }) {
  const [x, y] = point(rad, nowMin);
  return (
    <text className="now-label" x={f1(x)} y={f1(y)}>
      {text}
    </text>
  );
}

/** 누르는 띠: 모든 시안이 같다(반지름 62~110을 덮는 굵은 투명 호). 그림을 다 그린 뒤 맨 위에 */
export function Hits({ arcs, onPick }) {
  return arcs.map((a) => <path key={a.key} className="hit" d={arcPath(HIT, a.from, a.to)} onClick={() => onPick(a.key)} />);
}

/** 고리 틀: svg와 가운데 글자 칸. 같은 내용이 옆 목록에 글자로 있어서 그림은 화면 읽기에서 뺀다.
 *  loose = 아직 정리 안 된 메모를 적은 분들(앱 기본 고리와 같은 바깥 점, 누르는 일은 고리 밑 글 단추가 한다) */
export function RingFrame({ name, sel, mid, loose = [], children }) {
  return (
    <div className={`ring-wrap ${name}`}>
      <svg className={sel ? 'art has-sel' : 'art'} viewBox={VIEW} aria-hidden="true">
        {children}
        {/* 하루 경계 0시 · 12시(11-14, 앱 기본 고리와 같음) */}
        <line className="day-edge" {...radial(60, 112, 0)} />
        <line className="day-edge" {...radial(60, 112, 720)} />
        <g className="loose">
          {loose.map((m, i) => {
            const [x, y] = point(122, m);
            return <circle key={i} cx={f1(x)} cy={f1(y)} r="3.2" />;
          })}
        </g>
      </svg>
      <div className="ring-mid">{mid}</div>
    </div>
  );
}
