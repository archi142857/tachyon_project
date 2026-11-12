// 원자 모형 고리(사람 11-13 아이디어 "고리에 전자들이 생기는 컨셉").
// 가운데 원자핵, 종류마다 전자 껍질 하나. 일정 하나 = 그 껍질의 전자 하나:
//  - 수업 = 전자 ●(안쪽 껍질) · 내 일정 = 테 두른 전자 ◉(가운데 껍질) · 할 일 자리 = 정공 ○(바깥 껍질, 전자가 들어갈 빈자리)
//  - 길이 = 전자 구름(점 무리)의 길이. 전자는 일정 시작~끝 사이를 오간다(움직임을 끄면 가운데에 선다)
//  - 지금 = 원자핵에서 나가는 빛알(물결) · 지난 일정 = 구름이 옅어짐 · 붙은 일정 = 구름 양끝을 3분씩 비워 가른다
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, hm, at, arcPath, deg, look, point, radial, seeded, useStill, when, f1 } from './common.jsx';

const SHELL = { class: 68, mine: 86, slot: 104 };
const NUCLEUS = [[0, 0], [5, 0], [-5, 0], [2.5, 4.3], [-2.5, 4.3], [2.5, -4.3], [-2.5, -4.3]];

export const legend = [
  ['수업', '전자 ● · 안쪽 껍질'],
  ['내 일정', '테 두른 전자 ◉ · 가운데 껍질'],
  ['할 일 자리', '정공 ○(빈자리) · 바깥 껍질'],
  ['길이', '전자 구름 길이 · 전자가 그 사이를 오감'],
  ['붙은 일정', '구름 사이 틈'],
  ['지금', '원자핵에서 나가는 빛알 물결'],
];

function Electron({ kind }) {
  if (kind === 'class') return <circle r="3.2" className="core" />;
  if (kind === 'slot') return <circle r="3.6" className="hole" />;
  return (
    <>
      <circle r="1.9" className="core" />
      <circle r="4.4" className="halo" />
    </>
  );
}

// 지금 빛알: 원자핵 가장자리(20)에서 바깥(112)까지 물결, 끝에 화살촉. +x 쪽으로 그리고 돌린다
const WAVE = `M20 0${' q2 -4.5 4 0 q2 4.5 4 0'.repeat(11)} L110 0`;

export default function AtomRing({ arcs, nowMin, sel, onPick, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const still = useStill();
  return (
    <RingFrame name="atom" sel={sel} mid={children}>
      <g className="nucleus">
        {NUCLEUS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.8" className={i % 2 ? 'n' : 'p'} />
        ))}
      </g>
      {Object.values(SHELL).map((r) => (
        <circle key={r} r={r} className="shell" />
      ))}
      {Array.from({ length: 24 }, (_, h) => (
        <line key={h} className="tick" {...radial(112, 115, h * 60)} />
      ))}
      <HourLabels nowMin={nowMin} />
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
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            <path id={path} d={arcPath(R, a.from + 3, a.to - 3)} className="track" />
            <g className="cloud">{cloud}</g>
            {still ? (
              <g transform={at(R, (a.from + a.to) / 2)}>
                <g className="e">
                  <Electron kind={k} />
                </g>
              </g>
            ) : (
              <g>
                <g className="e">
                  <Electron kind={k} />
                </g>
                <animateMotion dur={`${f1(dur)}s`} begin={`-${f1(rand() * dur)}s`} repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
                  <mpath href={`#${path}`} />
                </animateMotion>
              </g>
            )}
          </g>
        );
      })}
      <g className="photon" transform={`rotate(${f1(deg(nowMin) - 90)})`}>
        <path d={WAVE} />
        <polygon points="116,0 109,-3.4 109,3.4" />
      </g>
      <NowLabel nowMin={nowMin} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
