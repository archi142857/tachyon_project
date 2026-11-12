// 뉴모피즘 고리(사람 11-13 02:10 "새 그림 빼고 그냥 완전 뉴포미즘으로만", 레퍼런스 = 연회색 뉴모피즘 UI 묶음).
// 바탕과 같은 색의 판을 빛(왼쪽 위)과 그림자(오른쪽 아래)로만 볼록 · 오목하게 빚는다. 색은 파랑 하나 + 지금의 빨강.
//  - 판: 볼록한 바깥 테 · 오목하게 눌린 홈(일정이 놓이는 곳) · 볼록한 가운데 단추(글자 칸)
//  - 수업 = 홈 안쪽의 볼록한 파랑 캡슐 · 내 일정 = 가운데 줄의 볼록한 구슬(18분에 하나) · 할 일 자리 = 바깥 줄의 오목한 보조개(20분에 하나, 빈자리)
//  - 지금 = 바깥 테를 따라 차오르는 진행 줄 + 그 끝의 볼록한 손잡이(빨간 점). 지난 일정 = 그림자가 옅어짐
//  - 붙은 일정 = 캡슐 양끝을 둥글게 4분씩 비워 가른다 · 시각 눈금 = 바깥 테의 오목한 점
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, hm, at, arcPath, look, when } from './common.jsx';

const R = { class: 74, mine: 90, slot: 104 };
const RIM = 119; // 진행 줄 · 손잡이

export const legend = [
  ['수업', '볼록한 파랑 캡슐 · 안쪽'],
  ['내 일정', '볼록한 구슬 · 가운데'],
  ['할 일 자리', '오목한 보조개 · 바깥'],
  ['길이', '캡슐 길이 · 구슬 · 보조개 수'],
  ['붙은 일정', '둥근 끝 사이 틈'],
  ['지금', '차오르는 진행 줄과 빨간 손잡이'],
];

const dots = (a, every) => {
  const len = a.to - a.from;
  const n = Math.max(1, Math.round(len / every));
  return Array.from({ length: n }, (_, i) => a.from + ((i + 0.5) * len) / n);
};

export default function SoftRing({ arcs, nowMin, sel, onPick, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const u = (n) => `url(#${id}-${n})`;
  return (
    <RingFrame name="soft" sel={sel} mid={children}>
      <defs>
        {/* 볼록: 오른쪽 아래 그림자 + 왼쪽 위 빛 */}
        <filter id={`${id}-up`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="2.6" dy="2.6" stdDeviation="2.6" className="sh-dark" />
          <feDropShadow dx="-2.6" dy="-2.6" stdDeviation="2.6" className="sh-light" />
        </filter>
        <filter id={`${id}-up-sm`} x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="1.1" dy="1.1" stdDeviation="0.9" className="sh-dark" />
          <feDropShadow dx="-1.1" dy="-1.1" stdDeviation="0.9" className="sh-light" />
        </filter>
        {/* 오목: 왼쪽 위가 어둡고 오른쪽 아래가 밝다 / 볼록한 면: 반대 */}
        <linearGradient id={`${id}-in`} gradientUnits="userSpaceOnUse" x1="-100" y1="-100" x2="100" y2="100">
          <stop offset="0" className="g-dark" />
          <stop offset="1" className="g-light" />
        </linearGradient>
        <linearGradient id={`${id}-in-sm`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="g-dark" />
          <stop offset="1" className="g-light" />
        </linearGradient>
        <linearGradient id={`${id}-out-sm`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="g-light" />
          <stop offset="1" className="g-face" />
        </linearGradient>
        <linearGradient id={`${id}-blue`} gradientUnits="userSpaceOnUse" x1="-90" y1="-90" x2="90" y2="90">
          <stop offset="0" className="b-light" />
          <stop offset="1" className="b-dark" />
        </linearGradient>
      </defs>
      <circle r="124" className="plate" filter={u('up')} />
      <circle r="89" className="groove" stroke={u('in')} />
      <circle r="66.5" className="lip" />
      <circle r="111.5" className="lip" />
      {Array.from({ length: 24 }, (_, h) => (
        <circle key={h} r={h % 3 ? 0.9 : 1.4} className="tick" transform={at(RIM, h * 60)} fill={u('in-sm')} />
      ))}
      <HourLabels nowMin={nowMin} rad={131} />
      <path className="progress" d={arcPath(RIM, 0, Math.max(0.5, nowMin))} stroke={u('blue')} />
      {arcs.map((a) => {
        const k = look(a.kind);
        let body;
        if (k === 'class') body = <path className="capsule" d={arcPath(R.class, a.from + 4, a.to - 4)} stroke={u('blue')} filter={u('up-sm')} />;
        else if (k === 'mine')
          body = dots(a, 18).map((m) => (
            <g key={m} transform={at(R.mine, m)}>
              <circle r="4.6" className="bead" fill={u('out-sm')} filter={u('up-sm')} />
              <circle r="1.6" className="bead-dot" />
            </g>
          ));
        else body = dots(a, 20).map((m) => <circle key={m} r="4.4" className="dimple" fill={u('in-sm')} transform={at(R.slot, m)} />);
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            {body}
          </g>
        );
      })}
      <g transform={at(RIM, nowMin)} className="knob">
        <circle r="6" filter={u('up-sm')} fill={u('out-sm')} />
        <circle r="2.2" className="knob-dot" />
      </g>
      <circle r="55" className="button" filter={u('up')} />
      <NowLabel nowMin={nowMin} rad={131} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
