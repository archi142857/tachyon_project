// 오선지 고리(사람 11-13 아이디어 "고리에 음표들이 생기는 컨셉").
// 다섯 줄 오선을 둥글게 말았다. 한 마디 = 1시간(가는 세로줄), 음표 하나 = 30분:
//  - 수업 = 4분음표(채운 머리 + 기둥) · 내 일정 = 들보로 이은 8분음표 · 할 일 자리 = 속 빈 마름모 음표(아직 정하지 않은 음)
//  - 종류마다 음 높이(오선 위 자리)가 다르다: 수업 낮게 · 내 일정 가운데 · 할 일 높게. 한 일정 안에서는 음이 오르내린다
//  - 붙은 일정 = 겹세로줄 · 지금 = 빨간 재생 줄(지난 음표는 연주한 것처럼 흐리게) · 잠자는 시간 = 오선이 흐려짐
//  - 0시 자리에 높은음자리표
import { RingFrame, Hits, HourLabels, NowLabel, WAKE, hm, at, arcPath, deg, look, minPerUnit, radial, ringRuns, when, f1 } from './common.jsx';

const LINES = [70, 76, 82, 88, 94];
const BASE = { class: 73, mine: 85, slot: 91 };
const MELODY = [0, 3, 6, 3, 0, -3]; // 음 높낮이(반지름 차이)
const NOTE = 30; // 음표 하나가 맡는 분
const STEM = 13;

export const legend = [
  ['수업', '4분음표 · 낮은 음'],
  ['내 일정', '들보로 이은 8분음표 · 가운데 음'],
  ['할 일 자리', '속 빈 마름모 음표 · 높은 음'],
  ['길이', '음표 하나 = 30분, 한 마디 = 1시간'],
  ['붙은 일정', '겹세로줄'],
  ['지금', '빨간 재생 줄 · 지난 음표는 흐리게'],
];

function notesOf(a) {
  const len = a.to - a.from;
  const n = Math.max(1, Math.round(len / NOTE));
  const base = BASE[look(a.kind)];
  return Array.from({ length: n }, (_, i) => {
    const m = a.from + ((i + 0.5) * len) / n;
    return { m, r: Math.min(94, Math.max(70, base + MELODY[i % MELODY.length])) };
  });
}

function Notes({ a, nowMin }) {
  const k = look(a.kind);
  const notes = notesOf(a);
  const stemAt = (n) => n.m + 3 * minPerUnit(n.r); // 기둥은 머리의 앞쪽(시계 방향) 가장자리
  const past = (n) => (n.m < nowMin ? ' past' : '');
  if (k === 'slot')
    return notes.map((n, i) => <rect key={i} x="-2.5" y="-2.5" width="5" height="5" className={`head hollow${past(n)}`} transform={at(n.r, n.m, deg(n.m) + 45)} />);
  const beam = Math.max(...notes.map((n) => n.r)) + STEM + 1;
  return (
    <>
      {notes.map((n, i) => (
        <g key={i} className={`note${past(n)}`}>
          <line className="stem" {...radial(n.r + 1.5, k === 'mine' ? beam : n.r + STEM, stemAt(n))} />
          <ellipse rx="3.3" ry="2.3" className="head" transform={at(n.r, n.m, deg(n.m) - 25)} />
        </g>
      ))}
      {k === 'mine' && (
        <path
          className={`beam${past(notes.at(-1))}`}
          d={notes.length > 1 ? arcPath(beam, stemAt(notes[0]), stemAt(notes.at(-1))) : arcPath(beam, stemAt(notes[0]), stemAt(notes[0]) + 6 * minPerUnit(beam))}
        />
      )}
    </>
  );
}

export default function StaffRing({ arcs, nowMin, sel, onPick, children }) {
  const { seps } = ringRuns(arcs);
  const gap = 2.4 * minPerUnit(82); // 겹세로줄 두 줄 사이
  return (
    <RingFrame name="staff" sel={sel} mid={children}>
      {LINES.map((r) => (
        <circle key={r} r={r} className="line" />
      ))}
      <path className="sleep" d={arcPath(82, 0, WAKE * 60)} />
      {Array.from({ length: 24 }, (_, h) => (
        <line key={h} className="bar" {...radial(70, 94, h * 60)} />
      ))}
      <text className="clef" transform={at(82, 14, deg(14))}>
        𝄞
      </text>
      <HourLabels nowMin={nowMin} rad={120} />
      {arcs.map((a) => (
        <g key={a.key} className={`ev k-${look(a.kind)} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
          <Notes a={a} nowMin={nowMin} />
        </g>
      ))}
      {seps.map((m) => (
        <g key={m} className="dbar">
          <line {...radial(66, 98, m - gap / 2)} />
          <line {...radial(66, 98, m + gap / 2)} />
        </g>
      ))}
      <g className="play">
        <line {...radial(62, 102, nowMin)} />
        <polygon points="0,0 6,-3.5 6,3.5" transform={at(102, nowMin, deg(nowMin) - 90)} />
      </g>
      <NowLabel nowMin={nowMin} rad={120} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
