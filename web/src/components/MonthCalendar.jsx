// 월 달력(11-11 사람 "달력이 왜 3주만 보이는지.. 전체 다 보여야지"): 그 달 1일이 든 주 월요일부터 6주.
// 칸마다 날짜 · 밀도 고리 · 마감(시각 먼저) · 일정 몇 개, 넘치면 '+N'. 칸을 누르면 그날부터 주간 달력으로.
import { endOf, isAllDay } from '../layout.js';
import { WEEKDAYS, addDays, dayStart, hhmm, kst, monthGrid, sameDay } from '../time.js';
import DensityRing from './DensityRing.jsx';
import Icon from './Icon.jsx';

const MAX_LINES = 3;

export default function MonthCalendar({ anchor, events, tasks, now, density, onPrev, onNext, onToday, onDay }) {
  const cells = monthGrid(anchor.y, anchor.m);
  const t = kst(now);
  const isCurrent = anchor.y === t.y && anchor.m === t.m;

  const linesOf = (day) => {
    const d0 = dayStart(day).getTime();
    const d1 = addDays(day, 1).getTime();
    const deadlines = tasks
      .filter((x) => x.due && Date.parse(x.due) >= d0 && Date.parse(x.due) < d1)
      .map((x) => ({ key: `t${x.id}`, kind: 'deadline', text: x.title, time: hhmm(x.due) }));
    const dayEvents = events
      .filter((e) => Date.parse(e.start) < d1 && endOf(e) > d0)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map((e) => ({ key: `e${e.id}`, kind: isAllDay(e) ? 'allday' : e.source === 'timetable' || e.source === 'memo' ? e.source : 'ics', text: e.title, time: isAllDay(e) ? null : hhmm(e.start) }));
    return [...deadlines, ...dayEvents];
  };

  return (
    <section className="card month" aria-label="월 달력">
      <div className="cal-head">
        <h2 className="card-title num">
          {anchor.y}년 {anchor.m}월
        </h2>
        {!isCurrent && (
          <button type="button" className="btn-text" onClick={onToday}>
            오늘
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="앞 달" onClick={onPrev}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn" aria-label="다음 달" onClick={onNext}>
          <Icon name="right" />
        </button>
      </div>
      <div className="month-wd" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((day) => {
          const p = kst(day);
          const lines = linesOf(day);
          const shown = lines.slice(0, MAX_LINES);
          const out = p.m !== anchor.m;
          const today = sameDay(day, now);
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`mcell${out ? ' out' : ''}${today ? ' today' : ''}`}
              onClick={() => onDay(day)}
            >
              {/* 이름 = 화면 읽기용 날짜 한 줄 + 보이는 글자(보이는 글자가 이름 안에 있어야 한다) */}
              <span className="sr-only">{`${p.m}월 ${p.d}일 ${WEEKDAYS[p.wd]}요일, ${lines.length ? `${lines.length}개` : '비어 있음'}, 그 주 보기. `}</span>
              <span className="mtop">
                <span className="mdn num" aria-hidden="true">
                  {p.d}
                </span>
                <DensityRing day={density(day)} size={18} />
              </span>
              {shown.map((l) => (
                <span key={l.key} className={`mline ${l.kind}`}>
                  {l.time && <b className="num">{l.time}</b>} {l.text}
                </span>
              ))}
              {lines.length > MAX_LINES && <span className="mmore num">+{lines.length - MAX_LINES}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
