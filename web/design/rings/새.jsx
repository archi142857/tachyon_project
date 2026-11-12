// 새 고리(사람 11-13 아이디어 "새들이 무리지어 날아다니는 컨셉").
// 고리 = 하늘 길. 새들은 시계 방향으로 난다. 일정 하나 = 새 무리 하나:
//  - 수업 = V자 대형(가지런한 무리, 앞장선 새가 끝 시각에) · 내 일정 = 흩어진 무리 · 할 일 자리 = 둥지 가지 위의 알(아직 날지 않음)
//  - 길이 = 새 수(수업 14분 · 내 일정 7분에 한 마리, 알은 20분에 하나)
//  - 지금 = 바깥 테를 앞장서 나는 큰 새와 지나온 자국 · 지난 일정 = 날갯짓을 멈춘 흐린 새
//  - 붙은 일정 = 무리 사이 빈 하늘(무리 양끝 4~6분은 비운다)
import { RingFrame, Hits, HourLabels, NowLabel, hm, at, arcPath, deg, look, point, seeded, when, f1 } from './common.jsx';

const SKY = 88; // 하늘 길 반지름
const LEAD = 116; // 지금 새가 나는 바깥 테

export const legend = [
  ['수업', 'V자 대형(가지런한 무리)'],
  ['내 일정', '흩어진 무리'],
  ['할 일 자리', '둥지 가지 위의 알'],
  ['길이', '새 수(알 수)'],
  ['지난 일정', '날갯짓을 멈춘 흐린 새'],
  ['지금', '바깥을 앞장서 나는 큰 새'],
];

// 날개 편 새 한 마리(갈매기 꼴 'ㅅㅅ'). 돌리지 않고 바로 세워 둔다 — 돌리면 새로 안 읽혀서(11-13 시안 찍어 봄). 나는 쪽은 무리 모양이 보여 준다
const WING = 'M-5 1.6Q-2.6 -2.6 0 0.6Q2.6 -2.6 5 1.6';

function Bird({ r, m, size = 1, tilt = 0, delay = 0 }) {
  return (
    <g transform={`${at(r, m, tilt)} scale(${f1(size)})`}>
      <path d={WING} className="bird" style={{ animationDelay: `${f1(delay)}s` }} />
    </g>
  );
}

function flock(a) {
  const k = look(a.kind);
  const len = a.to - a.from;
  const rand = seeded(a.key);
  if (k === 'class') {
    // V자: 앞장선 새는 끝 시각 조금 앞, 나머지는 뒤로 갈수록 안 · 밖으로 벌어진다
    const n = Math.min(11, Math.max(3, Math.round(len / 14)));
    const ranks = Math.ceil((n - 1) / 2);
    const step = Math.min(14, (len - 12) / ranks);
    return Array.from({ length: n }, (_, i) => {
      const rank = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      return { r: SKY + side * rank * 5, m: a.to - 6 - rank * step, size: 1.25, tilt: 0, delay: rand() };
    });
  }
  const n = Math.min(22, Math.max(4, Math.round(len / 7)));
  return Array.from({ length: n }, () => ({
    r: Math.min(106, Math.max(70, SKY + (rand() + rand() + rand() - 1.5) * 9)),
    m: a.from + 4 + rand() * (len - 8),
    size: 0.9 + rand() * 0.3,
    tilt: (rand() - 0.5) * 24,
    delay: rand(),
  }));
}

// 할 일 자리: 둥지 가지 위에 20분마다 알 하나
function Nest({ a }) {
  const len = a.to - a.from;
  const eggs = Math.max(1, Math.round(len / 20));
  return (
    <>
      <path className="twig" d={arcPath(SKY + 2, a.from + 3, a.to - 3)} />
      {Array.from({ length: eggs }, (_, i) => {
        const m = a.from + ((i + 0.5) * len) / eggs;
        return <ellipse key={i} rx="2.3" ry="3" className="egg" transform={at(SKY + 6.2, m, deg(m))} />;
      })}
    </>
  );
}

export default function BirdRing({ arcs, nowMin, sel, onPick, children }) {
  const [hx, hy] = point(LEAD, nowMin);
  return (
    <RingFrame name="birds" sel={sel} mid={children}>
      <circle r={SKY} className="sky-path" />
      {Array.from({ length: 24 }, (_, h) => {
        const [x, y] = point(112, h * 60);
        return <circle key={h} cx={f1(x)} cy={f1(y)} r="0.8" className="tick" />;
      })}
      <HourLabels nowMin={nowMin} rad={127} />
      {arcs.map((a) => {
        const k = look(a.kind);
        return (
          <g key={a.key} className={`ev k-${k} ${when(a, nowMin)}${a.key === sel ? ' on' : ''}`}>
            {k === 'slot' ? (
              <Nest a={a} />
            ) : (
              flock(a).map((b, i) => <Bird key={i} {...b} />)
            )}
          </g>
        );
      })}
      <path className="wake" d={arcPath(LEAD, nowMin - 110, nowMin - 8)} />
      <g className="lead" transform={`translate(${f1(hx)} ${f1(hy)}) scale(2.2)`}>
        <path d={WING} className="bird" />
      </g>
      <NowLabel nowMin={nowMin} rad={128} text={hm(nowMin)} />
      <Hits arcs={arcs} onPick={onPick} />
    </RingFrame>
  );
}
