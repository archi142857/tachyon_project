// 태양계 고리(사람 11-13 아이디어 "고리에 행성들이 생기는 컨셉", 레퍼런스 = 성운 위 태양계 그림).
// 가운데 빛나는 해(날짜 글자는 해 위에), 종류마다 하얀 궤도 하나, 바깥에 금빛 소행성대. 일정 하나 = 행성 하나:
//  - 수업 = 고리 달린 행성(안쪽 궤도) · 내 일정 = 구름 띠 푸른 행성(가운데 궤도) · 할 일 자리 = 초승달(바깥 궤도)
//  - 길이 = 궤도 위 빛 자국(시작~끝)과 행성 크기. 행성은 일정 가운데 시각에 뜬다
//  - 빈 시간 = 반짝이는 별 · 지금 = 해에서 뻗은 붉은 햇빛 줄기 · 지난 일정 = 빛을 못 받아 어둡게 · 지금 걸친 일정 = 햇빛에 빛남
//  - 붙은 일정 = 빛 자국 양끝을 3분씩 비워 가른다(행성은 따로 떠 있어서 그것만으로도 갈린다)
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, WAKE, hm, at, arcPath, look, point, radial, seeded, when, f1 } from './common.jsx';

const ORBIT = { class: 66, mine: 84, slot: 102 };
const BELT = 116; // 금빛 소행성대(눈금 대신)

export const legend = [
  ['수업', '고리 달린 행성 · 안쪽 궤도'],
  ['내 일정', '푸른 행성 · 가운데 궤도'],
  ['할 일 자리', '초승달 · 바깥 궤도'],
  ['길이', '궤도 위 빛 자국과 행성 크기'],
  ['빈 시간', '반짝이는 별'],
  ['지금', '해에서 뻗은 햇빛 줄기'],
];

// 공 모양 빛(왼쪽 위가 밝고 오른쪽 아래가 그늘): 종류마다 [밝은 쪽, 몸, 그늘]
const SPHERE = { class: ['#f8dcae', '#c98b4c', '#2c1608'], mine: ['#cfe4ff', '#3d74d9', '#08173a'], slot: ['#ffffff', '#cfd6e6', '#5b6378'] };

function Planet({ kind, s, id }) {
  const fill = `url(#${id}-${kind})`;
  if (kind === 'class') {
    const a = f1(s * 2.05);
    const b = f1(s * 0.6);
    return (
      <g transform="rotate(-22)">
        <ellipse rx={a} ry={b} className="belt" />
        <circle r={f1(s)} fill={fill} />
        {/* 고리의 앞쪽 반은 행성 앞을 지난다 */}
        <path d={`M${-a} 0A${a} ${b} 0 0 0 ${a} 0`} className="belt front" />
      </g>
    );
  }
  if (kind === 'slot')
    return <path fill={fill} className="moon" d={`M0 ${f1(-s)}A${f1(s)} ${f1(s)} 0 1 0 0 ${f1(s)}A${f1(s * 0.55)} ${f1(s)} 0 1 1 0 ${f1(-s)}Z`} />;
  const band = (y) => {
    const c = Math.sqrt(s * s - y * y) * 0.92;
    return <line key={y} x1={f1(-c)} x2={f1(c)} y1={f1(y)} y2={f1(y)} className="cloud-band" />;
  };
  return (
    <>
      <circle r={f1(s)} fill={fill} />
      {[-0.35 * s, 0.1 * s, 0.5 * s].map(band)}
    </>
  );
}

// 네 갈래로 반짝이는 별
const sparkle = (s) => `M0 ${-s}L${s * 0.16} ${-s * 0.16}L${s} 0L${s * 0.16} ${s * 0.16}L0 ${s}L${-s * 0.16} ${s * 0.16}L${-s} 0L${-s * 0.16} ${-s * 0.16}Z`;

export default function SolarRing({ arcs, nowMin, sel, onPick, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rand = seeded('stars');
  const stars = [];
  for (let i = 0; i < 130; i++) {
    const m = rand() * 1440;
    const r = 58 + rand() * 50;
    const big = rand() < 0.16;
    const size = big ? 2.2 + rand() * 2.4 : 0.35 + rand() * 0.6;
    const delay = rand() * 4;
    if (arcs.some((a) => m > a.from - 12 && m < a.to + 12)) continue; // 별은 빈 시간에만
    const cls = `star${m < WAKE * 60 ? ' sleep' : ''}`;
    const style = { animationDelay: `${f1(delay)}s` };
    if (big) stars.push(<path key={i} d={sparkle(size)} transform={at(r, m)} className={`${cls} sparkle`} style={style} />);
    else {
      const [x, y] = point(r, m);
      stars.push(<circle key={i} cx={f1(x)} cy={f1(y)} r={f1(size)} className={cls} style={style} />);
    }
  }
  const brand = seeded('belt');
  const rocks = Array.from({ length: 220 }, (_, i) => {
    const m = brand() * 1440;
    const r = BELT + (brand() + brand() - 1) * 4.5;
    const s = 0.5 + brand() * 1.1;
    const [x, y] = point(r, m);
    const k = brand();
    return <rect key={i} x={f1(x - s / 2)} y={f1(y - s / 2)} width={f1(s)} height={f1(s * (0.6 + k * 0.6))} transform={`rotate(${Math.round(k * 90)} ${f1(x)} ${f1(y)})`} className={k < 0.5 ? 'rock' : 'rock dim'} />;
  });
  const ray = radial(40, 112, nowMin);

  return (
    <RingFrame name="solar" sel={sel} mid={children}>
      <defs>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#fff8cf" />
          <stop offset="0.45" stopColor="#ffd54a" />
          <stop offset="0.72" stopColor="#ff9a1a" />
          <stop offset="0.86" stopColor="#ff7a00" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
        </radialGradient>
        {Object.entries(SPHERE).map(([k, [hi, mid, lo]]) => (
          <radialGradient key={k} id={`${id}-${k}`} cx="0.35" cy="0.32" r="0.75">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.45" stopColor={mid} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
        ))}
        <linearGradient id={`${id}-ray`} gradientUnits="userSpaceOnUse" {...ray}>
          <stop offset="0" stopColor="#ffb36b" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff4d2e" stopOpacity="0.15" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle r="64" className="sun" fill={`url(#${id}-sun)`} />
      {Object.values(ORBIT).map((r) => (
        <circle key={r} r={r} className="orbit" />
      ))}
      <g className="belt-rocks">{rocks}</g>
      <g className="stars">{stars}</g>
      <HourLabels nowMin={nowMin} rad={128} />
      <line className="ray" {...ray} stroke={`url(#${id}-ray)`} filter={`url(#${id}-glow)`} />
      {arcs.map((a) => {
        const k = look(a.kind);
        const R = ORBIT[k];
        const s = Math.min(8.5, 3.8 + (a.to - a.from) / 42);
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            <path className="trail" d={arcPath(R, a.from + 3, a.to - 3)} filter={`url(#${id}-glow)`} />
            <g transform={at(R, (a.from + a.to) / 2)}>
              <g className="pl">
                <Planet kind={k} s={s} id={id} />
              </g>
            </g>
          </g>
        );
      })}
      <NowLabel nowMin={nowMin} rad={128} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
