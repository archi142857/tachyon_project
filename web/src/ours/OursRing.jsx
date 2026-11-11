// 하루 고리(시연 9판): 한 바퀴 = 오늘 0–24시. 입자 다섯 겹 가운데 일정·할 일 자리에 든 입자만 그 색으로 빛난다.
// items = [{ key, from, to(분), color, task(할 일을 넣어 본 자리인가) }]. 색 구간을 누르면 onPick(key).
import { WAKE, hm } from '../slots.js';

const RINGS = [
  [66, 40, 1],
  [75, 46, 1.2],
  [84, 52, 1.4],
  [93, 58, 1.6],
  [102, 64, 1.8],
]; // [반지름, 입자 수, 입자 크기]
const xy = (rad, f) => {
  const a = f * 2 * Math.PI - Math.PI / 2;
  return [(rad * Math.cos(a)).toFixed(1), (rad * Math.sin(a)).toFixed(1)];
};
const P = (rad, f) => xy(rad, f).join(' ');

export default function OursRing({ items, nowMin, sel, onPick, memos = 0, onMemos, children }) {
  const now = nowMin / 1440;
  const arcs = items.map((x) => ({ ...x, a: x.from / 1440, b: x.to / 1440, dots: [] }));
  const rest = [];
  for (const [rad, n, r] of RINGS) {
    for (let j = 0; j < n; j += 1) {
      const f = (j + (n % 4) / 4) / n;
      const [cx, cy] = xy(rad, f);
      const arc = arcs.find((x) => f >= x.a && f < x.b);
      (arc ? arc.dots : rest).push(<circle key={`${rad}-${j}`} className={`${f < WAKE / 24 ? 'y-z' : ''}${f < now ? ' y-p' : ''}`} cx={cx} cy={cy} r={r} />);
    }
  }
  return (
    <>
      <svg className="y-ring y-day" viewBox="-120 -120 240 240" role="img" aria-label="하루 고리">
        <g className="y-bg">{rest}</g>
        {arcs.map((x) => {
          const m = (x.a + x.b) / 2;
          const da = x.b - x.a;
          const fiber = (k) => `M${P(62, x.a + da * k)} Q${P(55, m + da * (k - 0.5) * 0.5)} ${P(41, m)}`;
          const [nx, ny] = xy(41, m);
          return (
            <g key={x.key} className={`${x.task ? 'y-sg' : 'y-eg'}${sel === x.key ? ' y-on' : ''}`} style={{ '--c': x.color }} onClick={() => onPick(x.key)}>
              {x.dots}
              {x.task && [0, 0.25, 0.5, 0.75, 1].map((k) => <path key={k} className="y-fb" d={fiber(k)} />)}
              {x.task && <circle className="y-nd" cx={nx} cy={ny} r="1.5" />}
              {x.task && sel === x.key && (
                <circle className="y-pl" r="1.4">
                  <animateMotion dur="1.6s" repeatCount="indefinite" path={fiber(0.5)} />
                </circle>
              )}
              <path className="y-hit" d={`M${P(84, x.a)} A84 84 0 ${da > 0.5 ? 1 : 0} 1 ${P(84, Math.min(x.b, x.a + 0.999))}`} />
            </g>
          );
        })}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = xy(108, h / 24);
          const [x2, y2] = xy(h % 3 ? 109.5 : 111.5, h / 24);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        {Array.from({ length: 8 }, (_, i) => i * 3)
          .filter((h) => Math.abs(h - nowMin / 60) > 0.8 && Math.abs(h + 24 - nowMin / 60) > 0.8)
          .map((h) => {
            const [x, y] = xy(119, h / 24);
            return (
              <text key={h} x={x} y={y}>
                {h || 24}시
              </text>
            );
          })}
        <text className="y-nw" x={xy(119, now)[0]} y={xy(119, now)[1]}>
          {hm(nowMin)}
        </text>
        {/* 바깥 점 = 아직 정리 안 된 메모. 누르면 메모 쪽으로 */}
        {Array.from({ length: Math.min(memos, 8) }, (_, j) => {
          const [x, y] = xy(127 + (j % 2) * 5, (j + 0.35) / Math.min(memos, 8));
          return (
            <g key={j} className="y-fl" onClick={onMemos}>
              <circle className="y-fh" cx={x} cy={y} r="10" />
              <circle className="y-fo" cx={x} cy={y} r="5.5" />
              <circle className="y-fd" cx={x} cy={y} r="2.4" />
            </g>
          );
        })}
      </svg>
      <i className="y-ty y-day" style={{ transform: `rotate(${now * 360}deg)` }} />
      <div className="y-mid">{children}</div>
    </>
  );
}
