// 하루 고리: 한 바퀴가 오늘 하루(0–24시, 맨 위가 0시)이고 입자 하나하나가 시간 조각이다. 모양은 테마에 따라 둘(themeName.js).
//  - 기본(③ 바우하우스와 나머지 테마): 모양이 뜻이다(색만으로 가르지 않음) — ● 수업, □ 내 일정(달력·메모),
//    ▲ 할 일을 넣어 본 자리, 작은 점 = 빈 시간, 붉은 금 = 지금. 일정 뒤에는 달력과 같은 색 띠.
//  - 입자 테마('입자 밤'·'입자 낮'): 시연 9판의 하루 고리 그대로 — 과목 색 입자, 넣어 본 자리의 섬유, 흰 타키온(아래 ParticleRing, 모양은 nine.css).
// 붙어 보이는 구간은 경계에 바탕색 금(디자인 ④), 같은 모양끼리는 번갈아 속을 뒤집는다(ringRuns, 사람 11-13 "분간이 안 됨").
// 색 구간을 누르면 onPick(key). 가운데 글자는 children으로 받는다.
// 같은 내용이 옆의 타임라인·할 일 목록에 글자로 있어서 그림은 화면 읽기에서 뺀다(aria-hidden).
import { WAKE, hm } from '../slots.js';
import { tint, useParticles } from '../themeName.js';

const RINGS = [[66, 40, 1.6], [75, 46, 1.8], [84, 52, 2], [93, 58, 2.2], [102, 64, 2.4]]; // 반지름, 점 개수, 점 크기
const f1 = (v) => v.toFixed(1);
const MID = 84; // 누르는 띠의 가운데 반지름
const FRAME = 114; // 바깥 테(사람 11-11 23:34 'B')

// 붙어 보이는 구간 가르기(사람 11-13 "같은 모양이나 색깔로 연속된 일정이 표시되면 분간이 안 됨", 디자인 가이드 '11-13' ④).
// 입자 사이가 22~36분이라 GAP(30)분보다 가까우면 이어져 보인다.
//  - seps: 뒤 구간이 시작하는 분(디자인 `.ring line.sep` 바탕색 금). 모양·색이 같든 다르든. 앞 구간과 겹치면 앞 구간이 끝나는 분
//    (겹친 곳 입자는 앞 구간 것이라 거기서 갈린다). 앞 구간 안에 다 들어간 구간은 건너뛴다.
//  - alt: 같은 겉모양(● 수업 · □ 달력·메모 · ▲ 넣어 본 자리)끼리 붙어 있으면 번갈아 속을 뒤집어 그릴 구간 key(화면 몫, 소통판).
const LOOK = { timetable: 'class', ics: 'mine', memo: 'mine', slot: 'slot' };
const GAP = 30;
function runs(list, onTouch) {
  let last = null;
  for (const c of [...list].sort((x, y) => x.from - y.from || x.to - y.to)) {
    if (last && c.to <= last.to) continue;
    if (last && c.from - last.to < GAP) onTouch(last, c);
    last = c;
  }
}
export function ringRuns(arcs) {
  const seps = [];
  runs(arcs, (p, c) => seps.push(Math.max(c.from, p.to)));
  const alt = new Set();
  for (const look of new Set(arcs.map((a) => LOOK[a.kind] || a.kind))) {
    runs(
      arcs.filter((a) => (LOOK[a.kind] || a.kind) === look),
      (p, c) => !alt.has(p.key) && alt.add(c.key),
    );
  }
  return { alt, seps };
}

// 하루 가운데 f(0~1) 지점, 반지름 rad인 곳의 좌표
function point(rad, f) {
  const a = f * 2 * Math.PI - Math.PI / 2;
  return [rad * Math.cos(a), rad * Math.sin(a)].map((v) => v.toFixed(1));
}

// 바깥 점 = 아직 정리 안 된 메모(적은 시각 자리, 결정 '하루 고리' 11-13). 누르는 일은 고리 밑 글 단추가 한다(피드백 16 '고리를 딱히 누르지 않음')
function Loose({ loose = [] }) {
  return (
    <g className="loose">
      {loose.map((m, i) => {
        const [x, y] = point(121, m / 1440);
        return <circle key={i} cx={x} cy={y} r="3.4" />;
      })}
    </g>
  );
}

// from~to(분) 구간을 따라가는 호
function arcPath({ from, to }) {
  const a = from / 1440;
  const b = Math.min(to / 1440, a + 0.999);
  return `M${point(MID, a)}A${MID} ${MID} 0 ${b - a > 0.5 ? 1 : 0} 1 ${point(MID, b)}`;
}

// 눈금과 3시간마다 시각 글자(지금 시각 글자와 겹치는 숫자는 뺀다)
function Ticks({ now }) {
  return Array.from({ length: 24 }, (_, h) => {
    const [x1, y1] = point(109, h / 24);
    const [x2, y2] = point(111, h / 24);
    const [tx, ty] = point(127, h / 24); // 눈금 끝(111)에서 글자가 떨어지게
    const nearNow = Math.abs(((h / 24 - now + 1.5) % 1) - 0.5) * 24 < 1.2;
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
  });
}

// ── 기본(③): 입자 하나는 종류에 따라 ●(수업) □(내 일정) ▲(넣어 본 자리). cx·cy는 숫자, r은 그 고리의 점 크기
function Shape({ kind, cx, cy, r, className }) {
  if (kind === 'timetable') return <circle cx={cx} cy={cy} r={f1(r * 1.25)} className={className} />;
  if (kind === 'slot') {
    const s = r * 3.2; // 위로 선 세모, 한 변 s, 무게중심이 (cx, cy)
    const h = (s * Math.sqrt(3)) / 2;
    const pts = [[cx, cy - (2 * h) / 3], [cx + s / 2, cy + h / 3], [cx - s / 2, cy + h / 3]];
    return <polygon points={pts.map((p) => p.map(f1).join(',')).join(' ')} className={className} />;
  }
  const side = r * 2.3;
  return <rect x={f1(cx - side / 2)} y={f1(cy - side / 2)} width={f1(side)} height={f1(side)} className={className} />;
}

function ShapeRing({ arcs, nowMin, sel, onPick, loose, children }) {
  const now = nowMin / 1440;
  const { alt, seps } = ringRuns(arcs);
  return (
    <div className="ring-wrap">
      <svg className={sel ? 'ring has-sel' : 'ring'} viewBox="-136 -136 272 272" aria-hidden="true">
        {/* 바깥 테: 눈금 바깥 가는 선 하나(사람 11-11 23:34 'B'), 입자보다 먼저 */}
        <circle className="frame" r={FRAME} />
        {arcs.map((a) => (
          <path key={a.key} className={`band ${a.kind}${alt.has(a.key) ? ' alt' : ''}${a.key === sel ? ' on' : ''}`} d={arcPath(a)} />
        ))}
        {RINGS.flatMap(([rad, n, r]) =>
          Array.from({ length: n }, (_, j) => {
            const f = (j + (n % 4) / 4) / n; // 고리마다 조금씩 어긋나게
            const min = f * 1440;
            const arc = arcs.find((a) => min >= a.from && min < a.to);
            const [cx, cy] = point(rad, f).map(Number);
            const past = min < nowMin ? ' past' : '';
            if (!arc) return <circle key={`${rad}-${j}`} cx={cx} cy={cy} r={0.9} className={`${min < WAKE * 60 ? 'sleep' : 'free'}${past}`} />;
            const cls = `${arc.kind === 'slot' ? 'slot' : `ev ${arc.kind}`}${alt.has(arc.key) ? ' alt' : ''}${arc.key === sel ? ' on' : ''}${past}`;
            return <Shape key={`${rad}-${j}`} kind={arc.kind} cx={cx} cy={cy} r={r} className={cls} />;
          }),
        )}
        {/* 붙어 보이는 두 구간 사이 바탕색 금(디자인 ④): 띠·입자를 그린 뒤, 눈금 앞 */}
        {seps.map((m) => (
          <line key={`sep${m}`} className="sep" x1={point(60, m / 1440)[0]} y1={point(60, m / 1440)[1]} x2={point(108, m / 1440)[0]} y2={point(108, m / 1440)[1]} />
        ))}
        <Ticks now={now} />
        {/* 지금 선: 같은 자리에 바탕색 테(now-halo)를 먼저 그어 어떤 띠·입자 위에서도 보이게 */}
        <line className="now-halo" x1={point(60, now)[0]} y1={point(60, now)[1]} x2={point(108, now)[0]} y2={point(108, now)[1]} />
        <line className="now" x1={point(60, now)[0]} y1={point(60, now)[1]} x2={point(108, now)[0]} y2={point(108, now)[1]} />
        <text className="now" x={point(128, now)[0]} y={point(128, now)[1]}>
          {hm(nowMin)}
        </text>
        <Loose loose={loose} />
        {arcs.map((a) => (
          <path key={a.key} className="hit" d={arcPath(a)} onClick={() => onPick(a.key)} />
        ))}
      </svg>
      <div className="ring-mid">{children}</div>
    </div>
  );
}

// ── 입자 테마 = 시연 9판의 하루 고리 그대로(dhsrua555 시안, 사람 11-13 01:48 "입자에서는 시안 9판의 요소들이 그대로").
// 입자 다섯 겹(작은 점), 일정 · 넣어 본 자리에 든 입자만 과목 색(tint)으로, 넣어 본 자리는 안쪽 마디로 모이는 섬유,
// 지금 = 고리 바깥 흰 타키온과 꼬리(.ty), 가운데 숨 쉬는 빛(--sc = 고른 것의 색). 모양은 nine.css.
const NINE = [[66, 40, 1], [75, 46, 1.2], [84, 52, 1.4], [93, 58, 1.6], [102, 64, 1.8]];

function ParticleRing({ arcs, nowMin, sel, onPick, loose = [], children }) {
  const now = nowMin / 1440;
  const picked = arcs.find((a) => a.key === sel);
  const groups = new Map(arcs.map((a) => [a.key, []]));
  const rest = [];
  for (const [rad, n, r] of NINE) {
    for (let j = 0; j < n; j++) {
      const f = (j + (n % 4) / 4) / n;
      const min = f * 1440;
      const arc = arcs.find((a) => min >= a.from && min < a.to);
      const [cx, cy] = point(rad, f);
      const cls = `${min < WAKE * 60 ? 'z' : ''}${min < nowMin ? ' p' : ''}`.trim() || undefined;
      (arc ? groups.get(arc.key) : rest).push(<circle key={`${rad}-${j}`} className={cls} cx={cx} cy={cy} r={r} />);
    }
  }
  const P = (rad, f) => point(rad, f).join(' ');
  return (
    <div className="ring-wrap nine" style={{ '--sc': picked ? tint(picked.title) : 'var(--vi)' }}>
      <svg className="ring day" viewBox="-120 -120 240 240" aria-hidden="true">
        <g className="bg">{rest}</g>
        {arcs.map((a) => {
          const x = a.from / 1440;
          const y = a.to / 1440;
          const m = (x + y) / 2;
          const d = y - x;
          const fiber = (k) => `M${P(62, x + d * k)} Q${P(55, m + d * (k - 0.5) * 0.5)} ${P(41, m)}`;
          const [nx, ny] = point(41, m);
          const slot = a.kind === 'slot';
          return (
            <g key={a.key} className={`${slot ? 'sg' : 'eg'}${a.key === sel ? ' on' : ''}`} style={{ '--c': tint(a.title) }}>
              {groups.get(a.key)}
              {slot && [0, 0.25, 0.5, 0.75, 1].map((k) => <path key={k} className="fb" d={fiber(k)} />)}
              {slot && <circle className="nd" cx={nx} cy={ny} r="1.5" />}
              {slot && a.key === sel && (
                <circle className="pl" r="1.4">
                  <animateMotion dur="1.6s" repeatCount="indefinite" path={fiber(0.5)} />
                </circle>
              )}
            </g>
          );
        })}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = point(108, h / 24);
          const [x2, y2] = point(h % 3 ? 109.5 : 111.5, h / 24);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21]
          .filter((h) => Math.abs(h - nowMin / 60) > 0.8 && Math.abs(h + 24 - nowMin / 60) > 0.8)
          .map((h) => {
            const [x, y] = point(119, h / 24);
            return (
              <text key={h} x={x} y={y}>
                {h || 24}시
              </text>
            );
          })}
        <text className="nw" x={point(119, now)[0]} y={point(119, now)[1]}>
          {hm(nowMin)}
        </text>
        {/* 바깥 점 = 정리 안 된 메모(적은 시각 자리), 9판의 떠 있는 메모 입자 모양 */}
        {loose.map((m, i) => {
          const [x, y] = point(127, m / 1440);
          return (
            <g key={i} className="fl">
              <circle className="fo" cx={x} cy={y} r="5.5" />
              <circle className="fd" cx={x} cy={y} r="2.4" />
            </g>
          );
        })}
        {arcs.map((a) => (
          <path key={a.key} className="hit" d={arcPath(a)} onClick={() => onPick(a.key)} />
        ))}
      </svg>
      <i className="ty day" style={{ transform: `rotate(${now * 360}deg)` }} />
      <div className="ring-mid">{children}</div>
    </div>
  );
}

// arcs = [{ key, from, to, kind }] (분, kind = timetable | ics | memo | slot), loose = 정리 안 된 메모를 적은 분들
export default function DayRing(props) {
  return useParticles() ? <ParticleRing {...props} /> : <ShapeRing {...props} />;
}
