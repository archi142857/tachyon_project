// 테마 시안 쪽(개발자용, 앱 화면과 따로). npm run dev → http://localhost:5173/design/#solar
// 사람 11-13 01:54: 레퍼런스 그림 다섯을 테마마다 적용, "단순히 고리만 바뀌는 게 아니라 전반적인 스타일이 다 바뀌어야".
// 그래서 고리만이 아니라 지어낸 '오늘' 화면 전체를 그린다. 자리와 기능(머리줄 · 메모 칸 · 일정 · 고리 · 할 일 · 알림)은 모든 테마가 같고 모양만 바뀐다.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/jost';
import './design.css';
import { RINGS } from './rings/index.js';
import { DAYS } from './days.js';
import { KIND_NAME, hm, look } from './rings/common.jsx';
import Backdrop from './backdrop.jsx';

const START = 14 * 60 + 40; // 처음 보이는 '지금'(오후, 지난 일정과 남은 일정이 같이 보이게)
const TASKS = [
  { id: 't1', title: '선형대수 과제 3', due: '오늘 23:59' },
  { id: 't2', title: '실험 보고서 그래프', due: '내일' },
  { id: 't3', title: '동아리 회비 보내기', due: '11/15' },
];
const themeOf = () => RINGS.find((r) => `#${r.id}` === location.hash)?.id ?? RINGS[0].id;

function Mid({ day, sel, nowMin }) {
  const a = day.arcs.find((x) => x.key === sel);
  if (a)
    return (
      <>
        <b className="mid-title">{a.title}</b>
        <span className="num">
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
  const [theme, setTheme] = useState(themeOf);
  const [dayKey, setDayKey] = useState('many');
  const [nowMin, setNow] = useState(START);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [still, setStill] = useState(false);
  const [done, setDone] = useState({ t3: true });
  const day = DAYS[dayKey];
  const { name, idea, Ring, legend } = RINGS.find((r) => r.id === theme);

  useEffect(() => {
    const on = () => setTheme(themeOf());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
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
    <div className={`screen t-${theme}`}>
      <Backdrop theme={theme} />

      <section className="dev" aria-label="시안 조절(개발자용)">
        <nav className="themes" aria-label="테마">
          {RINGS.map((r) => (
            <a key={r.id} href={`#${r.id}`} aria-current={r.id === theme ? 'page' : undefined}>
              {r.name}
            </a>
          ))}
        </nav>
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
        <label className="check" htmlFor="still">
          <input id="still" type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> 움직임 끄기
        </label>
        <small>개발자용 시안 · 앱에는 안 들어감 · 일정은 지어낸 것</small>
      </section>

      <header className="bar">
        <div className="brand">
          <b>Tachyon</b>
          <span className="theme-name">
            {name} 테마 <small>{idea}</small>
          </span>
        </div>
        <nav className="tabs" aria-label="화면">
          {['오늘', '달력', '할 일', '같이'].map((t) => (
            <button key={t} type="button" aria-current={t === '오늘' ? 'page' : undefined}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <form className="memo" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="memo" className="sr">
          메모
        </label>
        <input id="memo" placeholder="적기만 하세요 (예: 내일 3시 팀플)" autoComplete="off" />
        <button className="primary" type="submit">
          넣기
        </button>
      </form>

      <div className="cols">
        <section className="panel day" aria-labelledby="h-day">
          <h2 id="h-day">오늘 일정</h2>
          <p className="sub">11월 13일 금요일 · {day.label}</p>
          <ol className="ev-list">
            {day.arcs.map((a) => {
              const k = look(a.kind);
              const past = a.to <= nowMin ? ' past' : a.from <= nowMin ? ' now' : '';
              return (
                <li key={a.key}>
                  <button type="button" className={`ev-row${past}`} aria-pressed={a.key === sel} onClick={() => pick(a.key)}>
                    <span className="time num">{hm(a.from)}</span>
                    <span className={`mark k-${k}`} aria-hidden="true" />
                    <span className="title">{a.title}</span>
                    <span className="kind">{KIND_NAME[k]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="panel ring-panel" aria-labelledby="h-ring">
          <h2 id="h-ring">하루 고리</h2>
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
        </section>

        <section className="panel tasks" aria-labelledby="h-tasks">
          <h2 id="h-tasks">할 일</h2>
          <p className="sub">빈 시간에 넣어 볼 것</p>
          <ul className="task-list">
            {TASKS.map((t) => (
              <li key={t.id} className={done[t.id] ? 'done' : ''}>
                <label htmlFor={t.id}>
                  <input id={t.id} type="checkbox" checked={!!done[t.id]} onChange={(e) => setDone((d) => ({ ...d, [t.id]: e.target.checked }))} />
                  <span className="title">{t.title}</span>
                  <span className="due">{t.due}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost">
            + 할 일
          </button>
        </section>
      </div>

      <div className="snack" role="status">
        메모를 일정으로 넣었어요 <button type="button">되돌리기</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
