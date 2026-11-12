// 시연 9판의 화면('입자' · '종이' 테마). Dashboard가 가진 자료와 함수(app)를 그대로 받아 모양만 다르게 그린다.
// 창(고치기 · 지도 · 메뉴 · 테마 …)은 Dashboard의 것을 같이 쓴다.
import { useState } from 'react';
import MemoPopup from '../components/MemoPopup.jsx';
import TogetherPage from '../components/TogetherPage.jsx';
import { applyTheme } from '../themes.js';
import { WEEKDAYS, dayLabel, hhmm } from '../time.js';
import { OursMonth, OursWeek } from './OursCal.jsx';
import OursToday, { OursTasks } from './OursToday.jsx';
import { PAL, usePhone, useSkin } from './skin.jsx';
import './ours.css';

const TABS = [
  ['today', '오늘'],
  ['cal', '달력'],
  ['memo', '메모'],
  ['together', '같이'],
];

function memoNote(memo) {
  if (memo.event_id) return '달력에 넣었어요';
  if (memo.task_id) return '할 일에 넣었어요';
  return memo.handled ? '적어 두었어요' : '아직 정리 전';
}

function MemoRows({ memos, now }) {
  return (
    <div className="y-rows">
      {memos.map((memo) => (
        <div key={memo.id} className={memo.handled ? 'y-row y-dn' : 'y-row'}>
          <i className="y-dot" style={{ '--c': memo.event_id ? PAL[1] : memo.task_id ? PAL[4] : PAL[0] }} />
          <div>
            <b>{memo.text}</b>
            <small>{memoNote(memo)}</small>
          </div>
          <div className="y-r">
            <small>
              {dayLabel(memo.created_at, now)} {hhmm(memo.created_at)}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="y-seg">
      {options.map(([key, label]) => (
        <button key={key} type="button" className={value === key ? 'y-on' : undefined} aria-pressed={value === key} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function OursMain({ app }) {
  const { page, setPage, calMode, setCalMode, now, date, example, memos, waiting, popup, busy, togetherKey, sendMemo, savePopup, cancelPopup, setSheet, setSnack } = app;
  const skin = useSkin();
  const phone = usePhone();
  const [open, setOpen] = useState(false); // 메모 목록 펼침
  const [text, setText] = useState('');
  const tab = page === 'tasks' ? 'today' : page;
  const newest = [...memos].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const send = () => {
    const value = text.trim();
    if (!value) return;
    sendMemo(value);
    setText('');
  };
  // 한글 조합 중의 Enter는 보내지 않는다(Composer와 같은 규칙)
  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    send();
  };

  const nav = TABS.map(([key, label]) => (
    <button key={key} type="button" className={tab === key ? 'y-on' : undefined} aria-current={tab === key ? 'page' : undefined} onClick={() => setPage(key)}>
      {label}
    </button>
  ));

  return (
    <div className={`ty9${phone ? ' y-ph' : ''}${skin === '종이' ? ' y-lt' : ''}`}>
      {!phone && (
        <aside className="y-side">
          <div className="y-logo">Tachyon</div>
          <nav aria-label="쪽">{nav}</nav>
        </aside>
      )}
      <div className="y-main">
        {phone && (
          <nav className="y-pnav" aria-label="쪽">
            {nav}
          </nav>
        )}
        <header className="y-top">
          {tab === 'today' && !phone && (
            <button type="button" className="y-bk" onClick={() => setPage('cal')}>
              ‹ 달력
            </button>
          )}
          {tab === 'cal' && (
            <button type="button" className="y-bk" onClick={() => setPage('today')}>
              ‹ 오늘
            </button>
          )}
          {tab === 'memo' && <h1>메모</h1>}
          {tab === 'together' && <h1>같이</h1>}
          {example && <span className="y-ex">예시 자료</span>}
          <span className="y-sp" />
          {tab === 'today' && (
            <span className="y-clk">
              {date.m}월 {date.d}일 {WEEKDAYS[date.wd]}요일 · {hhmm(now)}
            </span>
          )}
          {tab === 'today' && (
            <Seg
              value={page}
              onChange={setPage}
              options={[
                ['today', '하루'],
                ['tasks', '전체'],
              ]}
            />
          )}
          {tab === 'cal' && (
            <Seg
              value={calMode}
              onChange={setCalMode}
              options={[
                ['week', '주'],
                ['month', '월'],
              ]}
            />
          )}
          <button type="button" className="y-gb y-th" aria-label="메뉴" onClick={() => setSheet('menu')}>
            나
          </button>
          <button type="button" className="y-sw" role="switch" aria-checked={skin === '종이'} aria-label="밝은 화면(종이)" onClick={() => applyTheme(skin === '종이' ? '입자' : '종이')}>
            <i />
          </button>
        </header>

        {page === 'today' && <OursToday app={app} />}
        {page === 'tasks' && <OursTasks app={app} />}
        {page === 'cal' && (calMode === 'week' ? <OursWeek app={app} /> : <OursMonth app={app} />)}
        {page === 'memo' && (
          <div className="y-col">
            <p className="y-lb">적어 둔 메모 {memos.length}개 · 날짜나 할 일이 보이면 달력과 할 일로 이어져요</p>
            {waiting && <p className="y-night">살펴보는 중…</p>}
            {memos.length ? <MemoRows memos={newest} now={now} /> : <p className="y-night">아직 메모가 없어요. 아래 칸에 한 줄 적어 보세요</p>}
          </div>
        )}
        {page === 'together' && (
          <div className="y-host y-page">
            <main className="page page-together">
              <TogetherPage key={togetherKey} example={example} now={now} onSnack={(t) => setSnack({ text: t })} />
            </main>
          </div>
        )}

        {/* 메모 칸: 어느 쪽에서나 아래에 붙어 있다 */}
        <div className="y-md">
          {popup && (
            <div className="y-host y-pop">
              <MemoPopup key={popup.memoId} popup={popup.popup} plan={{ events: app.planEvents, tasks: app.openTasks, today: app.today, now }} busy={busy} onSave={savePopup} onCancel={cancelPopup} />
            </div>
          )}
          {open && page !== 'memo' && (
            <div className="y-mdl">
              <p className="y-lb">최근 메모</p>
              {newest.length ? <MemoRows memos={newest.slice(0, 8)} now={now} /> : <p className="y-night">아직 메모가 없어요</p>}
            </div>
          )}
          {waiting && page !== 'memo' && <p className="y-night">살펴보는 중…</p>}
          <form
            className="y-mf"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {page !== 'memo' && (
              <button type="button" className="y-gb y-mt" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                메모 {memos.length}
              </button>
            )}
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="예: 내일 3시 301동 스터디" aria-label="메모" maxLength={500} autoComplete="off" enterKeyHint="send" />
            <button type="submit" className="y-wb" disabled={!text.trim()}>
              남기기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
