// 태양계 고리(사람 11-13 아이디어 "고리에 행성들이 생기는 컨셉").
// 가운데 해, 종류마다 궤도 하나. 일정 하나 = 그 궤도에 뜬 행성 하나:
//  - 수업 = 고리 달린 행성(안쪽 궤도) · 내 일정 = 행성(가운데 궤도) · 할 일 자리 = 초승달(바깥 궤도)
//  - 길이 = 궤도 위 빛 자국(시작~끝)과 행성 크기. 행성은 일정 가운데 시각에 뜬다
//  - 빈 시간 = 별(잠자는 시간의 별은 더 흐림) · 지금 = 해에서 뻗은 햇빛 줄기 · 지난 일정 = 빛을 못 받아 어둡게
//  - 붙은 일정 = 빛 자국 양끝을 3분씩 비워 가른다(행성은 따로 떠 있어서 그것만으로 갈린다)
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, WAKE, hm, at, arcPath, look, point, radial, seeded, when, f1 } from './common.jsx';

const ORBIT = { class: 70, mine: 87, slot: 104 };
const STARS = 120;

export const legend = [
  ['수업', '고리 달린 행성 · 안쪽 궤도'],
  ['내 일정', '행성 · 가운데 궤도'],
  ['할 일 자리', '초승달 · 바깥 궤도'],
  ['길이', '궤도 위 빛 자국과 행성 크기'],
  ['빈 시간', '별'],
  ['지금', '해에서 뻗은 햇빛 줄기'],
];

function Planet({ kind, s }) {
  if (kind === 'class')
    return (
      <>
        <circle r={f1(s)} className="body" />
        <ellipse rx={f1(s * 1.9)} ry={f1(s * 0.55)} transform="rotate(-24)" className="belt" />
      </>
    );
  if (kind === 'slot') return <path className="body" d={`M0 ${f1(-s)}A${f1(s)} ${f1(s)} 0 1 0 0 ${f1(s)}A${f1(s * 0.55)} ${f1(s)} 0 1 1 0 ${f1(-s)}Z`} />;
  return (
    <>
      <circle r={f1(s)} className="body" />
      <circle cx={f1(-s * 0.35)} cy={f1(-s * 0.35)} r={f1(s * 0.3)} className="shine" />
    </>
  );
}

export default function SolarRing({ arcs, nowMin, sel, onPick, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rand = seeded('stars');
  const stars = [];
  for (let i = 0; i < STARS; i++) {
    const m = rand() * 1440;
    const r = 60 + rand() * 54;
    const size = 0.4 + rand() * 0.7;
    const delay = rand() * 4;
    if (arcs.some((a) => m > a.from - 12 && m < a.to + 12)) continue; // 별은 빈 시간에만
    const [x, y] = point(r, m);
    stars.push(<circle key={i} cx={f1(x)} cy={f1(y)} r={f1(size)} className={`star${m < WAKE * 60 ? ' sleep' : ''}`} style={{ animationDelay: `${f1(delay)}s` }} />);
  }
  const ray = radial(24, 118, nowMin);

  return (
    <RingFrame name="solar" sel={sel} mid={children}>
      <defs>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" className="sun-in" />
          <stop offset="1" className="sun-out" />
        </radialGradient>
        <linearGradient id={`${id}-ray`} gradientUnits="userSpaceOnUse" {...ray}>
          <stop offset="0" className="ray-in" />
          <stop offset="1" className="ray-out" />
        </linearGradient>
      </defs>
      <circle r="62" className="sun" style={{ fill: `url(#${id}-sun)` }} />
      {Object.values(ORBIT).map((r) => (
        <circle key={r} r={r} className="orbit" />
      ))}
      <g className="stars">{stars}</g>
      {Array.from({ length: 24 }, (_, h) => (
        <line key={h} className="tick" {...radial(111, 114, h * 60)} />
      ))}
      <HourLabels nowMin={nowMin} />
      <line className="ray" {...ray} style={{ stroke: `url(#${id}-ray)` }} />
      {arcs.map((a) => {
        const k = look(a.kind);
        const R = ORBIT[k];
        const s = Math.min(8, 3.6 + (a.to - a.from) / 45);
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            <path className="trail" d={arcPath(R, a.from + 3, a.to - 3)} />
            <g transform={at(R, (a.from + a.to) / 2)}>
              <g className="pl">
                <Planet kind={k} s={s} />
              </g>
            </g>
          </g>
        );
      })}
      <NowLabel nowMin={nowMin} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
