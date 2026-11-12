// 원자 모형 고리(사람 11-13 아이디어 "고리에 전자들이 생기는 컨셉", 레퍼런스 = 남색 위 주황 · 하늘색 네온 궤도).
// 가운데 주황 플라스마 원자핵(날짜 글자는 그 안), 종류마다 네온 전자 껍질 하나, 뒤에는 기울어진 궤도 셋이 천천히 돈다(꾸밈).
//  - 수업 = 주황 전자 ●(안쪽 껍질) · 내 일정 = 테 두른 하늘색 전자 ◉(가운데 껍질) · 할 일 자리 = 정공 ○(바깥 껍질, 전자가 들어갈 빈자리)
//  - 길이 = 빛나는 전자 구름(점 무리)의 길이. 전자는 일정 시작~끝 사이를 오간다(움직임을 끄면 가운데에 선다)
//  - 지금 = 원자핵에서 나가는 빛알 물결 · 지난 일정 = 구름이 옅어짐 · 붙은 일정 = 구름 양끝을 3분씩 비워 가른다
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, hm, at, arcPath, deg, look, point, radial, seeded, useStill, when, f1 } from './common.jsx';

const SHELL = { class: 68, mine: 86, slot: 104 };

export const legend = [
  ['수업', '주황 전자 ● · 안쪽 껍질'],
  ['내 일정', '테 두른 하늘색 전자 ◉ · 가운데 껍질'],
  ['할 일 자리', '정공 ○(빈자리) · 바깥 껍질'],
  ['길이', '전자 구름 길이 · 전자가 그 사이를 오감'],
  ['붙은 일정', '구름 사이 틈'],
  ['지금', '원자핵에서 나가는 빛알 물결'],
];

function Electron({ kind }) {
  if (kind === 'class') return <circle r="3.4" className="core" />;
  if (kind === 'slot') return <circle r="3.8" className="hole" />;
  return (
    <>
      <circle r="2" className="core" />
      <circle r="4.6" className="halo" />
    </>
  );
}

// 지금 빛알: 원자핵 가장자리(48)에서 바깥(112)까지 물결, 끝에 화살촉. +x 쪽으로 그리고 돌린다
const WAVE = `M48 0${' q2 -4.5 4 0 q2 4.5 4 0'.repeat(7)} L110 0`;

export default function AtomRing({ arcs, nowMin, sel, onPick, loose, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const still = useStill();
  const glow = `url(#${id}-glow)`;
  return (
    <RingFrame name="atom" sel={sel} mid={children} loose={loose}>
      <defs>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${id}-core`}>
          <stop offset="0" stopColor="#0b1428" stopOpacity="0.92" />
          <stop offset="0.55" stopColor="#3a1a10" stopOpacity="0.85" />
          <stop offset="0.78" stopColor="#ff8a1e" stopOpacity="0.85" />
          <stop offset="0.9" stopColor="#ffb347" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff8a1e" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 꾸밈: 기울어진 궤도 셋(시각과 상관없음) */}
      <g className="tilted">
        <ellipse rx="122" ry="38" transform="rotate(28)" />
        <ellipse rx="122" ry="38" transform="rotate(-32)" className="cyan" />
        <ellipse rx="122" ry="30" transform="rotate(88)" />
        {!still && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="90s" repeatCount="indefinite" />}
      </g>
      <circle r="58" fill={`url(#${id}-core)`} className="nucleus" />
      {Object.entries(SHELL).map(([k, r]) => (
        <circle key={r} r={r} className={`orbit s-${k}`} filter={glow} />
      ))}
      {Array.from({ length: 24 }, (_, h) => (
        <line key={h} className="tick" {...radial(112, 115, h * 60)} />
      ))}
      <HourLabels nowMin={nowMin} loose={loose} />
      {arcs.map((a) => {
        const k = look(a.kind);
        const R = SHELL[k];
        const len = a.to - a.from;
        const rand = seeded(a.key);
        const cloud = Array.from({ length: Math.round(len / 2.2) }, (_, i) => {
          const m = a.from + 3 + rand() * (len - 6);
          const [x, y] = point(R + (rand() + rand() + rand() - 1.5) * 4.4, m);
          return <circle key={i} cx={f1(x)} cy={f1(y)} r="0.7" />;
        });
        const path = `${id}-${a.key}`;
        const dur = 3 + len / 40;
        const electron = (
          <g className="e" filter={glow}>
            <Electron kind={k} />
          </g>
        );
        return (
          <g key={a.key} className={`item k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            <path id={path} d={arcPath(R, a.from + 3, a.to - 3)} className="track" />
            <g className="cloud">{cloud}</g>
            {still ? (
              <g transform={at(R, (a.from + a.to) / 2)}>{electron}</g>
            ) : (
              <g>
                {electron}
                <animateMotion dur={`${f1(dur)}s`} begin={`-${f1(rand() * dur)}s`} repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
                  <mpath href={`#${path}`} />
                </animateMotion>
              </g>
            )}
          </g>
        );
      })}
      <g className="photon" transform={`rotate(${f1(deg(nowMin) - 90)})`} filter={glow}>
        <path d={WAVE} />
        <polygon points="116,0 109,-3.4 109,3.4" />
      </g>
      <NowLabel nowMin={nowMin} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
