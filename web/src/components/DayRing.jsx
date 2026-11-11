// 하루 고리: 한 바퀴가 오늘 하루(0–24시, 맨 위가 0시)이고 입자 하나하나가 시간 조각이다. 모양은 테마에 따라 둘(themeName.js).
//  - 기본(③ 바우하우스와 나머지 테마): 모양이 뜻이다(색만으로 가르지 않음) — ● 수업, □ 내 일정(달력·메모),
//    ▲ 할 일을 넣어 본 자리, 작은 점 = 빈 시간, 붉은 금 = 지금. 일정 뒤에는 달력과 같은 색 띠.
//  - 입자 테마('입자 밤'·'입자 낮'): 팀원 시연 9판의 입자 모양 — 모두 동그라미, 구간마다 무리와 뜻 색, 고르면 커지고 빛남,
//    지금 = 바깥 테를 도는 빨간 입자와 꼬리(사람 11-12 "플랫하게 바꾸지 말고 원 스타일을 살려봐" → 07:11 "입자 테마에서"). 모양은 particles.css.
// 색 구간을 누르면 onPick(key). 가운데 글자는 children으로 받는다.
// 같은 내용이 옆의 타임라인·할 일 목록에 글자로 있어서 그림은 화면 읽기에서 뺀다(aria-hidden).
import { useId } from 'react';
import { WAKE, hm } from '../slots.js';
import { useParticles } from '../themeName.js';

const RINGS = [[66, 40, 1.6], [75, 46, 1.8], [84, 52, 2], [93, 58, 2.2], [102, 64, 2.4]]; // 반지름, 점 개수, 점 크기
const f1 = (v) => v.toFixed(1);
const MID = 84; // 누르는 띠의 가운데 반지름
const FRAME = 114; // 바깥 테(사람 11-11 23:34 'B')

// 하루 가운데 f(0~1) 지점, 반지름 rad인 곳의 좌표
function point(rad, f) {
  const a = f * 2 * Math.PI - Math.PI / 2;
  return [rad * Math.cos(a), rad * Math.sin(a)].map((v) => v.toFixed(1));
}

// from~to(분) 구간을 따라가는 호
function arcPath({ from, to }) {
  const a = from / 1440;
  const b = Math.min(to / 1440, a + 0.999);
  return `M${point(MID, a)}A${MID} ${MID} 0 ${b - a > 0.5 ? 1 : 0} 1 ${point(MID, b)}`;
}

// 눈금과 3시간마다 시각 글자(지금 시각 글자와 겹치는 숫자는 뺀다)
function Ticks({ now }) {
  return Array.from({ length: 24 }, (_, h) => {
    const [x1, y1] = point(109, h / 24);
    const [x2, y2] = point(111, h / 24);
    const [tx, ty] = point(127, h / 24); // 눈금 끝(111)에서 글자가 떨어지게
    const nearNow = Math.abs(((h / 24 - now + 1.5) % 1) - 0.5) * 24 < 1.2;
    return (
      <g key={h}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        {h % 3 === 0 && !nearNow && (
          <text x={tx} y={ty}>
            {h || 24}시
          </text>
        )}
      </g>
    );
  });
}

// ── 기본(③): 입자 하나는 종류에 따라 ●(수업) □(내 일정) ▲(넣어 본 자리). cx·cy는 숫자, r은 그 고리의 점 크기
function Shape({ kind, cx, cy, r, className }) {
  if (kind === 'timetable') return <circle cx={cx} cy={cy} r={f1(r * 1.25)} className={className} />;
  if (kind === 'slot') {
    const s = r * 3.2; // 위로 선 세모, 한 변 s, 무게중심이 (cx, cy)
    const h = (s * Math.sqrt(3)) / 2;
    const pts = [[cx, cy - (2 * h) / 3], [cx + s / 2, cy + h / 3], [cx - s / 2, cy + h / 3]];
    return <polygon points={pts.map((p) => p.map(f1).join(',')).join(' ')} className={className} />;
  }
  const side = r * 2.3;
  return <rect x={f1(cx - side / 2)} y={f1(cy - side / 2)} width={f1(side)} height={f1(side)} className={className} />;
}

function ShapeRing({ arcs, nowMin, sel, onPick, children }) {
  const now = nowMin / 1440;
  return (
    <div className="ring-wrap">
      <svg className={sel ? 'ring has-sel' : 'ring'} viewBox="-136 -136 272 272" aria-hidden="true">
        {/* 바깥 테: 눈금 바깥 가는 선 하나(사람 11-11 23:34 'B'), 입자보다 먼저 */}
        <circle className="frame" r={FRAME} />
        {arcs.map((a) => (
          <path key={a.key} className={`band ${a.kind}${a.key === sel ? ' on' : ''}`} d={arcPath(a)} />
        ))}
        {RINGS.flatMap(([rad, n, r]) =>
          Array.from({ length: n }, (_, j) => {
            const f = (j + (n % 4) / 4) / n; // 고리마다 조금씩 어긋나게
            const min = f * 1440;
            const arc = arcs.find((a) => min >= a.from && min < a.to);
            const [cx, cy] = point(rad, f).map(Number);
            const past = min < nowMin ? ' past' : '';
            if (!arc) return <circle key={`${rad}-${j}`} cx={cx} cy={cy} r={0.9} className={`${min < WAKE * 60 ? 'sleep' : 'free'}${past}`} />;
            const cls = `${arc.kind === 'slot' ? 'slot' : `ev ${arc.kind}`}${arc.key === sel ? ' on' : ''}${past}`;
            return <Shape key={`${rad}-${j}`} kind={arc.kind} cx={cx} cy={cy} r={r} className={cls} />;
          }),
        )}
        <Ticks now={now} />
        {/* 지금 선: 같은 자리에 바탕색 테(now-halo)를 먼저 그어 어떤 띠·입자 위에서도 보이게 */}
        <line className="now-halo" x1={point(60, now)[0]} y1={point(60, now)[1]} x2={point(108, now)[0]} y2={point(108, now)[1]} />
        <line className="now" x1={point(60, now)[0]} y1={point(60, now)[1]} x2={point(108, now)[0]} y2={point(108, now)[1]} />
        <text className="now" x={point(128, now)[0]} y={point(128, now)[1]}>
          {hm(nowMin)}
        </text>
        {arcs.map((a) => (
          <path key={a.key} className="hit" d={arcPath(a)} onClick={() => onPick(a.key)} />
        ))}
      </svg>
      <div className="ring-mid">{children}</div>
    </div>
  );
}

// ── 입자 테마: 무리 색(테마 값), 지금 입자 꼬리
const TAIL = 16; // 지금 입자 꼬리의 입자 수
const STEP = 0.0075; // 꼬리 입자 사이(한 바퀴의 몫). 16개면 약 43°(3시간 남짓)
const COLOR = { timetable: 'var(--mark-class)', ics: 'var(--text)', memo: 'var(--text)', slot: 'var(--mark-task)' };

function ParticleRing({ arcs, nowMin, sel, onPick, children }) {
  const now = nowMin / 1440;
  const glowId = `ring-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const picked = arcs.find((a) => a.key === sel);

  // 입자를 구간 무리와 나머지(빈 시간·잠)로 나눈다
  const groups = new Map(arcs.map((a) => [a.key, []]));
  const rest = [];
  for (const [rad, n, r] of RINGS) {
    for (let j = 0; j < n; j++) {
      const f = (j + (n % 4) / 4) / n;
      const min = f * 1440;
      const arc = arcs.find((a) => min >= a.from && min < a.to);
      const [cx, cy] = point(rad, f);
      const past = min < nowMin;
      const style = { '--d': `${Math.round(f * 500)}ms` }; // 돋아나는 차례
      if (arc) groups.get(arc.key).push(<circle key={`${rad}-${j}`} cx={cx} cy={cy} r={r} className={past ? 'p' : undefined} style={style} />);
      else rest.push(<circle key={`${rad}-${j}`} cx={cx} cy={cy} r={0.9} className={`${min < WAKE * 60 ? 'sleep' : 'free'}${past ? ' p' : ''}`} style={style} />);
    }
  }

  // 지금 입자의 꼬리: 지나온 쪽으로 갈수록 작고 옅게. 머리가 맨 위에 오게 먼 것부터 그린다
  const tail = Array.from({ length: TAIL }, (_, i) => {
    const k = TAIL - i; // TAIL … 1
    const t = 1 - k / (TAIL + 1);
    const [cx, cy] = point(FRAME, now - k * STEP);
    return <circle key={k} cx={cx} cy={cy} r={(0.35 + 2.3 * t).toFixed(2)} style={{ opacity: (t ** 1.7).toFixed(2) }} />;
  });
  const [hx, hy] = point(FRAME, now);

  return (
    <div className="ring-wrap">
      <svg className={sel ? 'ring particles has-sel' : 'ring particles'} viewBox="-136 -136 272 272" aria-hidden="true" style={{ '--sc': picked ? COLOR[picked.kind] : 'var(--text)' }}>
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" style={{ stopColor: 'var(--sc)', stopOpacity: picked ? 0.14 : 0.05 }} />
            <stop offset="1" style={{ stopColor: 'var(--sc)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        {/* 가운데 번짐 · 바깥 테 — 입자보다 먼저 */}
        <circle className="glow" r="64" style={{ fill: `url(#${glowId})` }} />
        <circle className="frame" r={FRAME} />
        <g className="bg">{rest}</g>
        {arcs.map((a) => (
          <g key={a.key} className={`pg ${a.kind === 'slot' ? 'slot' : `ev ${a.kind}`}${a.key === sel ? ' on' : ''}`} style={{ '--c': COLOR[a.kind] }}>
            {groups.get(a.key)}
          </g>
        ))}
        <Ticks now={now} />
        <g className="comet">
          {tail}
          <circle className="head" cx={hx} cy={hy} r="3.2" />
        </g>
        <text className="now" x={point(128, now)[0]} y={point(128, now)[1]}>
          {hm(nowMin)}
        </text>
        {arcs.map((a) => (
          <path key={a.key} className="hit" d={arcPath(a)} onClick={() => onPick(a.key)} />
        ))}
      </svg>
      <div className="ring-mid">{children}</div>
    </div>
  );
}

// arcs = [{ key, from, to, kind }] (분, kind = timetable | ics | memo | slot)
export default function DayRing(props) {
  return useParticles() ? <ParticleRing {...props} /> : <ShapeRing {...props} />;
}
