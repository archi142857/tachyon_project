// 테마를 입힌 '오늘' 화면(실제 앱 web/src의 자리 · 기능을 그대로 옮긴 모형). 값은 모두 지어낸 것.
// 넓은 화면 = 왼쪽 메뉴 · 위 날짜 줄 · 세 칸(오늘 일정 시간표 | 하루 고리 + 할 일 | 메모) · 아래 적기 칸.
// 폰 = 위 줄 · 탭 · 날짜와 하루/일정/할 일 · 하루 고리 · 할 일 · 아래 적기 칸. 둘은 css 컨테이너 폭(900px)으로 갈린다.
import { KIND_NAME, hm, look } from '../src/components/art/common.jsx';
import { RINGS } from '../src/components/art/index.js';
import Backdrop from '../src/components/art/Backdrop.jsx';

export const TASKS = [
  { id: 't1', title: '선형대수 과제 3', due: '마감 오늘 23:59', est: '약 2시간', pick: '19:30–21:00 어때요?', late: true },
  { id: 't2', title: '실험 보고서 그래프', due: '마감 11/14(토) 12:00', est: '약 1시간', pick: '17:00–18:00 어때요?' },
  { id: 't3', title: '동아리 회비 보내기', due: '마감 11/15(일)', est: '10분', done: true },
];
const MEMOS = [
  { at: '어제 22:10', text: '토요일 알바 11시–3시' },
  { at: '8:40', text: '보고서 그래프 다시 그리기' },
  { at: '13:05', text: '동아리 회의 6시로 바뀜', note: '달력에 넣었어요' },
];
const FIRST = 7; // 시간표 맨 위 시각
const LAST = 24;

const kindOf = (a) => look(a.kind);
function freeLeft(arcs, nowMin) {
  const busy = arcs.reduce((s, a) => s + Math.max(0, a.to - Math.max(a.from, nowMin)), 0);
  const m = Math.max(0, 1440 - nowMin - busy);
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

function Mid({ arcs, sel, nowMin }) {
  const a = arcs.find((x) => x.key === sel);
  if (a)
    return (
      <>
        <span className="mid-kind">{KIND_NAME[kindOf(a)]}</span>
        <b className="mid-title">{a.title}</b>
        <span className="num">
          {hm(a.from)}–{hm(a.to)}
        </span>
      </>
    );
  return (
    <>
      <span>오늘 남은 빈 시간</span>
      <b className="mid-big num">{freeLeft(arcs, nowMin)}</b>
    </>
  );
}

const Icon = ({ d }) => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const INBOX = 'M4 13h4l1.5 2.5h5L16 13h4M5 13l2-7h10l2 7v5H5z';
const MENU = 'M4 7h16M4 12h16M4 17h16';
const SEND = 'M12 19V5M6 11l6-6 6 6';

function Timeline({ arcs, nowMin, sel, onPick }) {
  const y = (m) => `calc(${(m / 60 - FIRST).toFixed(3)} * var(--hour))`;
  return (
    <div className="tl" style={{ height: `calc(${LAST - FIRST} * var(--hour))` }}>
      {Array.from({ length: LAST - FIRST }, (_, i) => (
        <div key={i} className="tl-hour num" style={{ top: y((FIRST + i) * 60) }}>
          {FIRST + i}
        </div>
      ))}
      {arcs.map((a) => {
        const k = kindOf(a);
        const past = a.to <= nowMin ? ' past' : '';
        return (
          <button
            key={a.key}
            type="button"
            className={`tl-ev k-${k}${past}`}
            aria-pressed={a.key === sel}
            style={{ top: y(a.from), height: `calc(${((a.to - a.from) / 60).toFixed(3)} * var(--hour) - 3px)` }}
            onClick={() => onPick(a.key)}
          >
            {k === 'slot' && <span className="chip">추천</span>}
            <b>{a.title}</b>
            <span className="num">
              {hm(a.from)}–{hm(a.to)}
            </span>
          </button>
        );
      })}
      {nowMin >= FIRST * 60 && <div className="tl-now" style={{ top: y(nowMin) }} />}
    </div>
  );
}

export default function MockApp({ theme, day, nowMin, sel, onPick, done, onDone, uid }) {
  const { Ring, legend } = RINGS.find((r) => r.id === theme);
  const arcs = day.arcs;
  const left = TASKS.filter((t) => !done[t.id]).length;
  return (
    <div className={`app t-${theme}`}>
      <Backdrop theme={RINGS.find((r) => r.id === theme).name} />
      <aside className="side only-wide">
        <div className="logo">
          <i className="logo-mark" aria-hidden="true" />
          Tachyon
        </div>
        <nav className="side-nav" aria-label="화면">
          {['오늘', '달력', '할 일', '메모', '같이'].map((t) => (
            <button key={t} type="button" aria-current={t === '오늘' ? 'page' : undefined}>
              {t}
              {t === '할 일' && <span className="count num">{left}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <header className="top">
        <div className="logo only-phone">
          <i className="logo-mark" aria-hidden="true" />
          Tachyon
        </div>
        <b className="date only-wide">11월 13일 금요일</b>
        <span className="grow" />
        <button type="button" className="plain only-wide">
          배치 바꾸기
        </button>
        <button type="button" className="icon-btn" aria-label="받은함">
          <Icon d={INBOX} />
        </button>
        <button type="button" className="plain only-wide">
          의견
        </button>
        <button type="button" className="me" aria-label="나">
          나
        </button>
        <button type="button" className="icon-btn" aria-label="메뉴">
          <Icon d={MENU} />
        </button>
      </header>

      <nav className="tabs only-phone" aria-label="화면">
        {['오늘', '달력', '할 일', '메모', '같이'].map((t) => (
          <button key={t} type="button" aria-current={t === '오늘' ? 'page' : undefined}>
            {t}
          </button>
        ))}
      </nav>
      <div className="subbar only-phone">
        <b className="date">11월 13일 금요일</b>
        <div className="seg" role="group" aria-label="보기">
          {['하루', '일정', '할 일'].map((t) => (
            <button key={t} type="button" aria-pressed={t === '하루'}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="board">
        <section className="card day only-wide" aria-labelledby={`${uid}-day`}>
          <div className="card-head">
            <h2 id={`${uid}-day`}>오늘 일정</h2>
            <span className="count num">{arcs.length}</span>
            <span className="grow" />
            <button type="button" className="plain">
              주간 달력
            </button>
          </div>
          <Timeline arcs={arcs} nowMin={nowMin} sel={sel} onPick={onPick} />
        </section>

        <div className="mid-col">
          <section className="card ring-card" aria-label="하루 고리">
            <div className="card-head">
              <button type="button" className="chip-btn">
                <i aria-hidden="true" /> 메모 2개 정리
              </button>
              <span className="grow" />
              <span className="theme-tag">{RINGS.find((r) => r.id === theme).name}</span>
            </div>
            <Ring arcs={arcs} nowMin={nowMin} sel={sel} onPick={onPick}>
              <Mid arcs={arcs} sel={sel} nowMin={nowMin} />
            </Ring>
            <ul className="legend" aria-label="고리 읽는 법">
              {legend.slice(0, 3).map(([k, v], i) => (
                <li key={k}>
                  <span className={`mark k-${['class', 'mine', 'slot'][i]}`} aria-hidden="true" />
                  <b>{k}</b> <span>{v.split(' · ')[0]}</span>
                </li>
              ))}
              <li>
                <span className="mark now" aria-hidden="true" />
                <b>지금</b>
              </li>
            </ul>
          </section>

          <section className="card tasks" aria-labelledby={`${uid}-tasks`}>
            <div className="card-head">
              <h2 id={`${uid}-tasks`}>할 일</h2>
            </div>
            <ul className="task-list">
              {TASKS.map((t) => (
                <li key={t.id} className={done[t.id] ? 'done' : ''}>
                  <input id={`${uid}-${t.id}`} type="checkbox" checked={!!done[t.id]} onChange={(e) => onDone(t.id, e.target.checked)} />
                  <label htmlFor={`${uid}-${t.id}`}>
                    <b>{t.title}</b>
                    <span className="meta">
                      <span className={t.late && !done[t.id] ? 'due late' : 'due'}>{t.due}</span> · {t.est}
                    </span>
                    {t.pick && !done[t.id] && (
                      <span className="meta">
                        <span className="chip">추천</span> {t.pick}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="card memos only-wide" aria-labelledby={`${uid}-memo`}>
          <div className="card-head">
            <h2 id={`${uid}-memo`}>메모</h2>
            <span className="grow" />
            <button type="button" className="plain strong">
              지금 정리
            </button>
          </div>
          <ol className="bubbles">
            {MEMOS.map((m) => (
              <li key={m.text}>
                <span className="when num">{m.at}</span>
                <p>{m.text}</p>
                {m.note && <span className="note">{m.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      </main>

      <form className="composer" onSubmit={(e) => e.preventDefault()}>
        <i className="logo-mark" aria-hidden="true" />
        <label htmlFor={`${uid}-memo-in`} className="sr">
          메모 적기
        </label>
        <input id={`${uid}-memo-in`} placeholder="적기만 하세요 (예: 내일 3시 팀플)" autoComplete="off" />
        <button type="submit" className="send" aria-label="넣기">
          <Icon d={SEND} />
        </button>
      </form>
    </div>
  );
}
