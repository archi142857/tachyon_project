// 주간 달력(오른쪽, 폰은 아래). 오늘부터 7칸(오늘이 늘 맨 앞), 좌우 화살표·밀기로 7일씩 이동, 아래 점은 오늘부터 3장(21일).
// 맨 위 줄은 과제 마감과 하루 종일 일정, 아래는 시간 칸. 중요한 일정은 굵은 테두리.
import { useRef } from 'react';
import { endOf, hourRange, isAllDay, layoutDay } from '../layout.js';
import { WEEKDAYS, addDays, dayIndex, hhmm, kst, minuteOfDay, weekTitle } from '../time.js';
import Icon from './Icon.jsx';

export const PAGES = 3; // 오늘부터 7일, 그다음 7일, 그다음 7일

const timeText = (ev) => `${hhmm(ev.start)}–${ev.end ? hhmm(ev.end) : '?'}`;

// 마우스를 올리면 보이는 한 줄(title)
function eventLabel(ev) {
  return [ev.title, timeText(ev), ev.place, ev.important ? '중요' : null].filter(Boolean).join(', ');
}

export default function WeekCalendar({ start, events, tasks, now, page, onPage, onEvent, onTask }) {
  const touch = useRef(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const todayIdx = dayIndex(start, now);
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  const { first, last } = hourRange(start, timed);
  const hourAt = (date) => minuteOfDay(date) / 60 - first;
  const nowTop = hourAt(now);

  const top = days.map((day, i) => [
    ...tasks.filter((t) => t.due && dayIndex(start, t.due) === i).map((t) => ({ kind: 'deadline', item: t })),
    ...allDay.filter((e) => new Date(e.start) <= day && endOf(e) > day.getTime()).map((e) => ({ kind: 'allday', item: e })),
  ]);
  const hasTop = top.some((items) => items.length);

  return (
    <section
      className="card cal"
      aria-label="주간 달력"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onPage(page + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="cal-head">
        <h2 className="card-title num">{weekTitle(start)}</h2>
        {page > 0 && (
          <button type="button" className="btn-text" onClick={() => onPage(0)}>
            오늘
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="앞 7일" disabled={page === 0} onClick={() => onPage(page - 1)}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn" aria-label="다음 7일" disabled={page === PAGES - 1} onClick={() => onPage(page + 1)}>
          <Icon name="right" />
        </button>
      </div>

      <div className="cal-days" aria-hidden="true">
        <span />
        {days.map((day, i) => (
          <span key={i} className={i === todayIdx ? 'today' : undefined}>
            <span className="wd">{WEEKDAYS[kst(day).wd]}</span>
            <span className="dn num">{kst(day).d}</span>
          </span>
        ))}
      </div>

      {hasTop && (
        <div className="cal-top">
          <span className="label">마감</span>
          {top.map((items, i) => (
            <div className="day" key={i}>
              {items.map(({ kind, item }) =>
                kind === 'deadline' ? (
                  <button key={item.id} type="button" className="chip deadline" title={`${item.title} 마감 ${hhmm(item.due)}`} onClick={() => onTask(item)}>
                    {item.title}
                  </button>
                ) : (
                  <button key={item.id} type="button" className="chip allday" title={item.title} onClick={() => onEvent(item)}>
                    {item.title}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cal-scroll">
        <div className="cal-grid" style={{ height: `calc(var(--hour) * ${last - first})` }}>
          {Array.from({ length: last - first - 1 }, (_, i) => (
            <div key={i} className="hline" style={{ top: `calc(var(--hour) * ${i + 1})` }} aria-hidden="true" />
          ))}
          <div className="hours" aria-hidden="true">
            {Array.from({ length: last - first }, (_, i) => (
              <span key={i} className="num" style={{ top: i === 0 ? '2px' : `calc(var(--hour) * ${i} - 8px)` }}>
                {first + i}
              </span>
            ))}
          </div>
          {days.map((day, i) => (
            <div className="col" key={i}>
              {layoutDay(timed.filter((e) => dayIndex(start, e.start) === i)).map(({ ev, col, cols }) => {
                const s = hourAt(ev.start);
                const len = Math.min((endOf(ev) - Date.parse(ev.start)) / 3600000, last - first - s);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`ev ${ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics'}${ev.important ? ' important' : ''}`}
                    style={{
                      top: `calc(var(--hour) * ${s} + 1px)`,
                      height: `calc(var(--hour) * ${Math.max(len, 0.5)} - 2px)`,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                    }}
                    title={eventLabel(ev)}
                    onClick={() => onEvent(ev)}
                  >
                    {/* 이름은 보이는 글자 그대로 + 화면 읽기용 시각·중요(보이는 글자가 이름 안에 있어야 한다) */}
                    <span className="sr-only">{timeText(ev)}, </span>
                    {ev.title}
                    {!ev.end && <span className="end-unknown"> (끝 ?)</span>}
                    {ev.place && <span className="place">{ev.place}</span>}
                    {ev.important ? <span className="sr-only">, 중요</span> : null}
                  </button>
                );
              })}
              {i === todayIdx && nowTop >= 0 && nowTop <= last - first && (
                <div className="now-line" role="img" style={{ top: `calc(var(--hour) * ${nowTop})` }} aria-label={`지금 ${hhmm(now)}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cal-dots" role="img" aria-label={`7일씩 ${PAGES}장 가운데 ${page + 1}번째`}>
        {Array.from({ length: PAGES }, (_, i) => (
          <span key={i} className={i === page ? 'on' : undefined} />
        ))}
      </div>
    </section>
  );
}
