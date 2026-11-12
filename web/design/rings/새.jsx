// 새 고리(사람 11-13 아이디어 "새들이 무리지어 날아다니는 컨셉", 레퍼런스 = 파랑새 자수 + 뉴모피즘 UI, 사람: "자수 느낌과 뉴모피즘이 결합된 형태").
// 수틀(나무 테)에 끼운 천 위에 수놓은 고리. 천은 눌린 홈(뉴모피즘 안쪽 그림자), 가운데 글자 칸은 볼록 단추. 일정 하나 = 수놓은 것 하나:
//  - 수업 = 수놓은 파랑새(앉은 새, 1시간에 한 마리, 바깥) · 내 일정 = 실로 박은 나는 새 무리(가운데)
//    · 할 일 자리 = 가지 위 흰 꽃(아직 날지 않은 자리, 20분에 한 송이, 안쪽)
//  - 지금 = 바늘(붉은 실). 지난 시간 = 바늘이 지나온 붉은 홈질 · 지난 일정 = 실이 바랜 듯 흐리게
//  - 붙은 일정 = 무리 · 가지 양끝 4~6분을 비워 가른다 · 시각 눈금 = 십자수 ×
import { useId } from 'react';
import { RingFrame, Hits, HourLabels, NowLabel, hm, at, arcPath, deg, look, minPerUnit, seeded, when, f1 } from './common.jsx';

const R = { class: 100, mine: 84, slot: 68 }; // 파랑새가 가장 커서 둘레가 긴 바깥에
const STITCH = 113; // 지나온 시간의 붉은 홈질
const HOOP = 119; // 수틀

export const legend = [
  ['수업', '수놓은 파랑새 · 바깥'],
  ['내 일정', '실로 박은 나는 새 무리 · 가운데'],
  ['할 일 자리', '가지 위 흰 꽃 · 안쪽'],
  ['길이', '새 수 · 꽃 수'],
  ['시각 눈금', '십자수 ×'],
  ['지금', '바늘과 지나온 붉은 홈질'],
];

// 날개 편 새(나는 새, 실 한 줄로 박음)
const WING = 'M-5 1.6Q-2.6 -2.6 0 0.6Q2.6 -2.6 5 1.6';

// 앉은 파랑새(오른쪽을 본다). 공단수(촘촘한 실결)는 무늬 겹으로
function Bluebird({ id }) {
  return (
    <>
      <path className="bb-tail" d="M-5 1L-10.5 -0.6L-9.6 3.2Z" />
      <ellipse className="bb-body" rx="6" ry="4.4" />
      <path className="bb-breast" d="M0.6 -0.8Q6.4 -0.6 4.6 3.4Q1 5.2 -2.4 3.4Q0.8 2.2 0.6 -0.8Z" />
      <circle className="bb-body" cx="4.4" cy="-3" r="3.2" />
      <path className="bb-wing" d="M-4.6 -1.2Q0 -3.6 3 0.2Q-1.2 2 -4.6 -1.2Z" />
      <ellipse rx="6" ry="4.4" fill={`url(#${id}-satin)`} />
      <circle cx="4.4" cy="-3" r="3.2" fill={`url(#${id}-satin)`} />
      <path className="bb-beak" d="M7.3 -3.5L10 -2.6L7.3 -1.8Z" />
      <circle className="bb-eye" cx="5.3" cy="-3.6" r="0.75" />
      <path className="bb-leg" d="M-0.6 4.2V6.4M1.6 4.2V6.4" />
    </>
  );
}

// 다섯 잎 꽃
function Blossom() {
  return (
    <>
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} className="petal" rx="1.5" ry="2.1" transform={`rotate(${r}) translate(0 -2.1)`} />
      ))}
      <circle className="pistil" r="1" />
    </>
  );
}

// 위쪽 반(0~6시, 18~24시)은 시계 방향이 오른쪽, 아래쪽 반은 왼쪽 → 새가 나는 쪽을 보게 뒤집는다
const facing = (m) => (m > 360 && m < 1080 ? ' scale(-1 1)' : '');

function Flock({ a }) {
  const len = a.to - a.from;
  const rand = seeded(a.key);
  const n = Math.min(18, Math.max(3, Math.round(len / 8)));
  return Array.from({ length: n }, (_, i) => {
    const m = a.from + 5 + rand() * (len - 10);
    const r = R.mine + (rand() + rand() - 1) * 7;
    const s = 0.85 + rand() * 0.35;
    return (
      <g key={i} transform={`${at(r, m, (rand() - 0.5) * 24)} scale(${f1(s)})`}>
        <path d={WING} className="fly" style={{ animationDelay: `${f1(rand())}s` }} />
      </g>
    );
  });
}

export default function BirdRing({ arcs, nowMin, sel, onPick, children }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const needleEnd = nowMin - 18 * minPerUnit(STITCH); // 바늘 귀 쪽 끝
  return (
    <RingFrame name="birds" sel={sel} mid={children}>
      <defs>
        <pattern id={`${id}-satin`} width="1.3" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0.3" x2="1.3" y2="0.3" className="satin" />
        </pattern>
        <pattern id={`${id}-weave`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <path d="M0 0.6H2.4M1.8 0V2.4" className="weave" />
        </pattern>
        {/* 눌린 홈: 왼쪽 위가 어둡고 오른쪽 아래가 밝다 / 볼록: 반대 */}
        <linearGradient id={`${id}-in`} gradientUnits="userSpaceOnUse" x1="-90" y1="-90" x2="90" y2="90">
          <stop offset="0" className="g-dark" />
          <stop offset="1" className="g-light" />
        </linearGradient>
        <linearGradient id={`${id}-wood`} gradientUnits="userSpaceOnUse" x1="-120" y1="-120" x2="120" y2="120">
          <stop offset="0" stopColor="#e7c79f" />
          <stop offset="1" stopColor="#a87447" />
        </linearGradient>
        <filter id={`${id}-raised`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="3" dy="3" stdDeviation="3" className="sh-dark" />
          <feDropShadow dx="-3" dy="-3" stdDeviation="3" className="sh-light" />
        </filter>
      </defs>
      <circle r={HOOP} className="cloth" />
      <circle r={HOOP} fill={`url(#${id}-weave)`} />
      <circle r="88" className="groove" stroke={`url(#${id}-in)`} />
      <circle r={HOOP} className="hoop" stroke={`url(#${id}-wood)`} filter={`url(#${id}-raised)`} />
      <circle r={HOOP + 1.9} className="hoop-hi" />
      <circle r="54" className="button" filter={`url(#${id}-raised)`} />
      {Array.from({ length: 24 }, (_, h) => (
        <path key={h} className="cross" d="M-1.3 -1.3L1.3 1.3M1.3 -1.3L-1.3 1.3" transform={at(STITCH, h * 60)} />
      ))}
      <HourLabels nowMin={nowMin} rad={129} />
      <path className="thread past-stitch" d={arcPath(STITCH, 0, Math.max(0.5, needleEnd))} />
      {arcs.map((a) => {
        const k = look(a.kind);
        const len = a.to - a.from;
        let body;
        if (k === 'class') {
          const n = Math.max(1, Math.round(len / 60));
          body = Array.from({ length: n }, (_, i) => {
            const m = a.from + ((i + 0.5) * len) / n;
            return (
              <g key={i} transform={`${at(R.class, m)}${facing(m)}`}>
                <g className="bb">
                  <Bluebird id={id} />
                </g>
              </g>
            );
          });
        } else if (k === 'mine') body = <Flock a={a} />;
        else {
          const n = Math.max(1, Math.round(len / 20));
          body = (
            <>
              <path className="branch" d={arcPath(R.slot - 3, a.from + 4, a.to - 4)} />
              {Array.from({ length: n }, (_, i) => {
                const m = a.from + ((i + 0.5) * len) / n;
                return (
                  <g key={i} transform={at(R.slot + (i % 2 ? 2.4 : -0.4), m, deg(m))}>
                    <Blossom />
                  </g>
                );
              })}
            </>
          );
        }
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            {body}
          </g>
        );
      })}
      {/* 바늘: 끝은 지금, 귀는 지나온 쪽. 붉은 실이 귀에서 홈질로 이어진다 */}
      <g className="needle" transform={at(STITCH, nowMin, deg(nowMin))}>
        <path className="thread" d="M-16 0C-19 -5 -20 3 -18.4 1" />
        <path className="steel" d="M3 0L-4 -1.1L-17 -0.8Q-18.4 0 -17 0.8L-4 1.1Z" />
        <ellipse className="eye" cx="-15.6" rx="1.3" ry="0.35" />
      </g>
      <NowLabel nowMin={nowMin} rad={129} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}

