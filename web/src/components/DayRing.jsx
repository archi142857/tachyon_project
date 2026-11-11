// 하루 고리: 한 바퀴가 오늘 하루(0–24시, 맨 위가 0시)이고 입자 하나하나가 시간 조각이다.
// 입자는 모두 동그라미다 — 팀원 시연(9판)의 입자 고리 모양(사람 11-12 "플랫하게 바꾸지 말고 원 스타일을 살려봐").
// 일정·넣어 본 자리의 입자는 구간마다 한 무리(g)로 묶고, 무리 색 --c는 종류의 뜻 색이다
// (수업 = --mark-class, 내 일정 = 글자색, 넣어 본 자리 = --mark-task). 고른 무리는 입자가 커지고 그 색으로 빛나며,
// 가운데도 그 색으로 옅게 번진다. 빈 시간·잠은 작은 옅은 점, 지난 시간은 더 옅게. 처음 그릴 때 시각 순서로 돋아난다.
// 지금 = 바깥 테(r 114)를 따라 도는 빨간 입자 하나와 지나온 쪽으로 옅어지는 입자 꼬리(로고와 같은 말), 옆에 시각.
// 구간을 누르면 onPick(key). 가운데 글자는 children으로 받는다.
// 같은 내용이 옆의 타임라인·할 일 목록에 글자로 있어서 그림은 화면 읽기에서 뺀다(aria-hidden). 모양은 particles.css.
import { useId } from 'react';
import { WAKE, hm } from '../slots.js';

const RINGS = [[66, 40, 1.6], [75, 46, 1.8], [84, 52, 2], [93, 58, 2.2], [102, 64, 2.4]]; // 반지름, 점 개수, 점 크기
const MID = 84; // 누르는 띠의 가운데 반지름
const FRAME = 114; // 바깥 테(사람 11-11 23:34 'B') — 지금 입자가 이 위를 돈다
const TAIL = 16; // 지금 입자 꼬리의 입자 수
const STEP = 0.0075; // 꼬리 입자 사이(한 바퀴의 몫). 16개면 약 43°(3시간 남짓)
// 종류마다 무리 색(테마 값이라 테마를 바꾸면 같이 바뀐다)
const COLOR = { timetable: 'var(--mark-class)', ics: 'var(--text)', memo: 'var(--text)', slot: 'var(--mark-task)' };

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

// arcs = [{ key, from, to, kind }] (분, kind = timetable | ics | memo | slot)
export default function DayRing({ arcs, nowMin, sel, onPick, children }) {
  const now = nowMin / 1440;
  const glowId = `ring-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const picked = arcs.find((a) => a.key === sel);

  // 입자를 구간 무리와 나머지(빈 시간·잠)로 나눈다
  const groups = new Map(arcs.map((a) => [a.key, []]));
  const rest = [];
  for (const [rad, n, r] of RINGS) {
    for (let j = 0; j < n; j++) {
      const f = (j + (n % 4) / 4) / n; // 고리마다 조금씩 어긋나게
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
      <svg className={sel ? 'ring has-sel' : 'ring'} viewBox="-136 -136 272 272" aria-hidden="true" style={{ '--sc': picked ? COLOR[picked.kind] : 'var(--text)' }}>
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" style={{ stopColor: 'var(--sc)', stopOpacity: picked ? 0.14 : 0.05 }} />
            <stop offset="1" style={{ stopColor: 'var(--sc)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        {/* 가운데 번짐 · 바깥 테(사람 11-11 23:34 'B') — 입자보다 먼저 */}
        <circle className="glow" r="64" style={{ fill: `url(#${glowId})` }} />
        <circle className="frame" r={FRAME} />
        <g className="bg">{rest}</g>
        {arcs.map((a) => (
          <g key={a.key} className={`pg ${a.kind === 'slot' ? 'slot' : `ev ${a.kind}`}${a.key === sel ? ' on' : ''}`} style={{ '--c': COLOR[a.kind] }}>
            {groups.get(a.key)}
          </g>
        ))}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = point(109, h / 24);
          const [x2, y2] = point(111, h / 24);
          const [tx, ty] = point(127, h / 24); // 눈금 끝(111)에서 글자가 떨어지게
          const nearNow = Math.abs(((h / 24 - now + 1.5) % 1) - 0.5) * 24 < 1.2; // 지금 시각 글자와 겹치는 숫자는 뺀다
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
        })}
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
