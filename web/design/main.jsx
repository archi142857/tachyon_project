// 고리 시안 쪽(개발자용, 앱 화면과 따로). npm run dev → http://localhost:5173/design/
// 같은 하루를 네 시안으로 나란히 그린다. 일정을 고르면 네 고리에서 같이 골라진다.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/jost';
import './design.css';
import { RINGS } from './rings/index.js';
import { DAYS } from './days.js';
import { KIND_NAME, hm, look } from './rings/common.jsx';

const START = 14 * 60 + 40; // 처음 보이는 '지금'(오후, 지난 일정과 남은 일정이 같이 보이게)

function Mid({ day, sel, nowMin }) {
  const a = day.arcs.find((x) => x.key === sel);
  if (a)
    return (
      <>
        <b className="mid-title">{a.title}</b>
        <span>
          {hm(a.from)}–{hm(a.to)}
        </span>
        <span className="mid-kind">{KIND_NAME[look(a.kind)]}</span>
      </>
    );
  const next = day.arcs.find((x) => x.from >= nowMin);
  return (
    <>
      <b className="mid-date">11월 13일 금</b>
      <span>{next ? `다음 · ${next.title} ${hm(next.from)}` : '남은 일정 없음'}</span>
    </>
  );
}

function Page() {
  const [dayKey, setDayKey] = useState('many');
  const [nowMin, setNow] = useState(START);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [still, setStill] = useState(false);
  const day = DAYS[dayKey];

  useEffect(() => {
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  }, [dark]);
  useEffect(() => {
    document.documentElement.dataset.still = still ? '1' : '0';
  }, [still]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow((m) => (m + 5) % 1440), 60);
    return () => clearInterval(t);
  }, [playing]);

  const pick = (key) => setSel((s) => (s === key ? null : key));

  return (
    <main>
      <header className="head">
        <h1>하루 고리 시안</h1>
        <p>개발자용 쪽이다. 앱 화면에는 들어가 있지 않다. 같은 지어낸 하루를 네 시안으로 그렸고, 고리를 누르거나 아래 일정을 고르면 네 고리에서 같이 골라진다.</p>
      </header>

      <section className="controls" aria-label="보기 조절">
        <div className="seg" role="group" aria-label="예시 하루">
          {Object.entries(DAYS).map(([k, d]) => (
            <button key={k} type="button" aria-pressed={k === dayKey} onClick={() => (setDayKey(k), setSel(null))}>
              {d.label}
            </button>
          ))}
        </div>
        <label className="now-ctl" htmlFor="now">
          지금 <output className="num">{hm(nowMin)}</output>
          <input id="now" type="range" min="0" max="1435" step="5" value={nowMin} onChange={(e) => setNow(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '멈추기' : '하루 돌려 보기'}
        </button>
        <button type="button" onClick={() => setDark((d) => !d)}>
          {dark ? '밝게' : '어둡게'}
        </button>
        <label className="check" htmlFor="still">
          <input id="still" type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> 움직임 끄기
        </label>
      </section>

      <ul className="events" aria-label="이날 일정">
        {day.arcs.map((a) => (
          <li key={a.key}>
            <button type="button" aria-pressed={a.key === sel} onClick={() => pick(a.key)}>
              <span className={`kind k-${look(a.kind)}`}>{KIND_NAME[look(a.kind)]}</span> {a.title} <span className="num">{hm(a.from)}–{hm(a.to)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid">
        {RINGS.map(({ id, name, idea, Ring, legend }) => (
          <article key={id} className="card">
            <h2>
              {name} <small>{idea}</small>
            </h2>
            <Ring arcs={day.arcs} nowMin={nowMin} sel={sel} onPick={pick}>
              <Mid day={day} sel={sel} nowMin={nowMin} />
            </Ring>
            <dl className="legend">
              {legend.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      <section className="promise">
        <h2>모든 시안이 지키는 것(자리 · 기능)</h2>
        <ul>
          <li>한 바퀴 = 오늘 하루, 0시가 맨 위, 시계 방향. 3시간마다 시각 글자.</li>
          <li>종류 셋(수업 · 내 일정 · 할 일 자리)은 모양으로도 가른다. 색만으로 가르지 않는다.</li>
          <li>지금 시각 표시와 글자, 지난 시간은 흐리게.</li>
          <li>붙어 있는 두 일정은 눈으로 갈라진다(틈 · 겹세로줄 · 따로 뜬 무리).</li>
          <li>일정을 누르면 그 일정이 골라지고 나머지는 옅어진다. 누르는 띠는 모든 시안이 같다.</li>
          <li>가운데(반지름 56)는 날짜 · 다음 일정 · 고른 일정 글자 칸이다.</li>
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
