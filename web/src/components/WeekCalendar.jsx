// 주간 달력. 첫 칸은 start(처음엔 오늘)이고 좌우 화살표·밀기로 7일씩, 앞뒤 제한 없이 옮긴다(11-11 사람 "달력이 왜 3주만 보이는지").
// 날짜 밑에는 그날 밀도 고리(DensityRing)와 쓰는 시간, 그 아래 '고르게' 줄은 날마다 막대 + 평균선 + 몰아서 할 때의 옅은 테두리.
// 맨 위 줄은 과제 마감(시각을 붙여서)과 하루 종일 일정, 아래는 시간 칸. 중요한 일정은 굵은 테두리.
// 앞 수업에서 걸어오는 시간이 쉬는 시간보다 길면 칸 안에 빨간 'N분 지각'(TT Wizard 말투, legs = campus.js dayLegs).
import { useRef } from 'react';
import { arriveText, lateOf } from '../campus.js';
import { AWAKE, evenness, hoursText } from '../density.js';
import { endOf, hourRange, isAllDay, layoutDay } from '../layout.js';
import { WEEKDAYS, addDays, dayIndex, deadlineLabel, hhmm, kst, minuteOfDay, weekTitle } from '../time.js';
import DensityRing from './DensityRing.jsx';
import Icon from './Icon.jsx';

const timeText = (ev) => `${hhmm(ev.start)}–${ev.end ? hhmm(ev.end) : '?'}`;

// 마우스를 올리면 보이는 한 줄(title)
function eventLabel(ev, leg) {
  const late = lateOf(leg && leg.arrive);
  const walk = leg && leg.arrive ? `${arriveText(leg.arrive)}${late ? ` — ${late}분 지각` : ''}` : null;
  return [ev.title, timeText(ev), ev.place, ev.important ? '중요' : null, walk].filter(Boolean).join(', ');
}

const used = (d) => (d ? d.eventMin + d.taskMin + d.over : 0);

// density(date) → 그날 밀도(density.js) 또는 null
export default function WeekCalendar({ start, events, tasks, now, density, isCurrent, onPrev, onNext, onToday, onEvent, onTask, legs }) {
  const touch = useRef(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const todayIdx = dayIndex(start, now);
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  const { first, last } = hourRange(start, timed);
  const hourAt = (date) => minuteOfDay(date) / 60 - first;
  const nowTop = hourAt(now);

  const dens = days.map((d) => density(d));
  const ahead = dens.filter((d) => d && !d.past);
  const bal = evenness(ahead);
  const scale = Math.max(AWAKE * 0.6, ...dens.map(used), ...dens.map((d) => (d ? d.eventMin + d.naiveTaskMin : 0)));
  const guessed = ahead.some((d) => d.items.some((x) => !(x.task.minutes > 0)));

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
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
      }}
    >
      <div className="cal-head">
        <h2 className="card-title num">{weekTitle(start)}</h2>
        {!isCurrent && (
          <button type="button" className="btn-text" onClick={onToday}>
            오늘
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="앞 7일" onClick={onPrev}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn" aria-label="다음 7일" onClick={onNext}>
          <Icon name="right" />
        </button>
      </div>

      <div className="cal-days">
        <span className="axis-label" aria-hidden="true" />
        {days.map((day, i) => {
          const d = dens[i];
          const p = kst(day);
          return (
            <span
              key={i}
              className={i === todayIdx ? 'today' : undefined}
              role="img"
              aria-label={`${p.m}월 ${p.d}일 ${WEEKDAYS[p.wd]}요일${d ? `, 일정 ${hoursText(d.eventMin)}, 할 일 ${hoursText(d.taskMin + d.over)}` : ''}`}
            >
              <span className="wd">{WEEKDAYS[p.wd]}</span>
              <span className="dn num">{p.d}</span>
              <DensityRing day={d} size={26} />
              <span className="dh num">{d ? Math.round((used(d) / 60) * 10) / 10 : ''}</span>
            </span>
          );
        })}
      </div>

      {ahead.length > 1 && (
        <div className="cal-bal" aria-hidden="true">
          <span className="axis-label">고르게</span>
          {dens.map((d, i) => (
            <span className="bal-cell" key={i}>
              {d && !d.past && (
                <>
                  <i className="bal-naive" style={{ height: `${((d.eventMin + d.naiveTaskMin) / scale) * 100}%` }} />
                  <i className="bal-ev" style={{ height: `${(d.eventMin / scale) * 100}%` }} />
                  <i className="bal-task" style={{ height: `${((d.taskMin + d.over) / scale) * 100}%`, bottom: `${(d.eventMin / scale) * 100}%` }} />
                </>
              )}
            </span>
          ))}
          <i className="bal-avg" style={{ bottom: `${(bal.avg / scale) * 100}%` }} />
        </div>
      )}
      {ahead.length > 1 && (
        <p className="bal-note num">
          할 일을 마감 전 날들에 고르게 나눴어요 · 하루 평균 {hoursText(bal.avg)} · 날마다 차이 {hoursText(bal.spread)}
          {bal.naiveSpread > bal.spread + 30 && <span className="soft"> (마감 날 몰아서 하면 {hoursText(bal.naiveSpread)})</span>}
          {guessed && <span className="soft"> · 걸리는 시간을 모르는 할 일은 1시간으로 셈</span>}
        </p>
      )}

      {hasTop && (
        <div className="cal-top">
          <span className="axis-label">마감</span>
          {top.map((items, i) => (
            <div className="day" key={i}>
              {items.map(({ kind, item }) =>
                kind === 'deadline' ? (
                  <button key={`t${item.id}`} type="button" className="chip deadline" title={`${item.title} — ${deadlineLabel(item.due, now)}`} onClick={() => onTask(item)}>
                    <b className="num">{hhmm(item.due)}</b> {item.title}
                  </button>
                ) : (
                  <button key={`e${item.id}`} type="button" className="chip allday" title={item.title} onClick={() => onEvent(item)}>
                    {item.title}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cal-scroll" style={{ '--hours': last - first }}>
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
            <div className={i === todayIdx ? 'col today' : 'col'} key={i}>
              {layoutDay(timed.filter((e) => dayIndex(start, e.start) === i)).map(({ ev, col, cols }) => {
                const s = hourAt(ev.start);
                const len = Math.min((endOf(ev) - Date.parse(ev.start)) / 3600000, last - first - s);
                const leg = legs && legs.get(ev.id);
                const late = lateOf(leg && leg.arrive);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`ev ${ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics'}${ev.important ? ' important' : ''}${late > 0 ? ' late-ev' : ''}`}
                    style={{
                      top: `calc(var(--hour) * ${s} + 1px)`,
                      height: `calc(var(--hour) * ${Math.max(len, 0.5)} - 2px)`,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                    }}
                    title={eventLabel(ev, leg)}
                    onClick={() => onEvent(ev)}
                  >
                    {/* 이름은 보이는 글자 그대로 + 화면 읽기용 시각·중요(보이는 글자가 이름 안에 있어야 한다) */}
                    <span className="sr-only">{timeText(ev)}, </span>
                    {ev.title}
                    {!ev.end && <span className="end-unknown"> (끝 ?)</span>}
                    {ev.place && <span className="place">{ev.place}</span>}
                    {ev.important ? <span className="sr-only">, 중요</span> : null}
                    {late > 0 && <span className="late-pill">{late}분 지각</span>}
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
    </section>
  );
}
