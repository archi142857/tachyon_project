// 달력(시연 9판): 시간 칸(TimeGrid) · 주 · 월. 오늘 화면의 타임라인도 같은 시간 칸을 쓴다.
import { loadOf } from '../density.js';
import { endOf, isAllDay, layoutDay } from '../layout.js';
import { dayEvents, hm } from '../slots.js';
import { WEEKDAYS, addDays, kst, minuteOfDay, monthGrid, sameDay, shiftMonth, weekTitle } from '../time.js';
import { colorOf } from './skin.jsx';

const DAY = 1440 * 60000;
// 그날에 걸친 일정(하루 종일 포함)
const onDay = (events, day) => events.filter((ev) => Date.parse(ev.start) < new Date(day).getTime() + DAY && endOf(ev) > new Date(day).getTime());

// days = 보여 줄 날들. placed = 오늘 칸에 넣어 본 할 일 자리 [{ key, task, slot: [시작 분, 끝 분] }]
export function TimeGrid({ days, events, tasks, now, sel, placed = [], onEvent, onPlaced }) {
  const nowMin = minuteOfDay(now);
  const cols = days.map((day) => ({
    day,
    isToday: sameDay(day, now),
    busy: dayEvents(events, day),
    dues: tasks.filter((task) => task.due && sameDay(task.due, day)),
  }));
  const hasToday = cols.some((c) => c.isToday);
  // 보통은 8시부터 그린다. 그 전에 무언가 있으면 0시부터
  const early = (hasToday && nowMin < 480) || placed.some((p) => p.slot[0] < 480) || cols.some((c) => c.busy.some((b) => b.from < 480) || c.dues.some((task) => minuteOfDay(task.due) < 480));
  const H0 = early ? 0 : 8;
  const pos = (min) => `${Math.min(100, Math.max(0, ((min / 60 - H0) / (24 - H0)) * 100))}%`;
  const box = (from, to) => ({ top: pos(from), height: `${(Math.max(to - from, 30) / 60 / (24 - H0)) * 100}%` });
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="y-tg" style={{ '--n': days.length }}>
      <div className="y-ax" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <u key={i} style={{ top: `${i * 12.5}%` }}>
            {H0 + (i * (24 - H0)) / 8}
          </u>
        ))}
      </div>
      {cols.map((c) => (
        <div key={c.day} className={c.isToday ? 'y-dc y-td' : 'y-dc'}>
          {layoutDay(c.busy.map((b) => b.ev)).map(({ ev, col, cols: n }) => {
            const { from, to } = c.busy.find((b) => b.ev === ev);
            const key = `e${ev.id}`;
            const side = n > 1 ? { left: `calc(${(col / n) * 100}% + 3px)`, right: 'auto', width: `calc(${100 / n}% - 6px)` } : null;
            return (
              <button
                key={key}
                type="button"
                className={`y-eb${sel === key ? ' y-sel' : ''}${ev.important ? ' y-im' : ''}`}
                style={{ '--c': colorOf(ev.title), ...box(from, to), ...side }}
                onClick={stop(() => onEvent(ev, key))}
              >
                <b>{ev.title}</b>
                <small>
                  {ev.place ? `${ev.place} · ` : ''}
                  {hm(from)}
                  <span> – {hm(to)}</span>
                </small>
              </button>
            );
          })}
          {c.isToday &&
            placed.map(({ key, task, slot }) => (
              <button key={key} type="button" className={`y-eb y-ab${sel === key ? ' y-sel' : ''}`} style={{ '--c': colorOf(task.title), ...box(slot[0], slot[1]) }} onClick={stop(() => onPlaced(key))}>
                <b>{task.title}</b>
                <small>
                  넣어 본 자리 · {hm(slot[0])}
                  <span> – {hm(slot[1])}</span>
                </small>
              </button>
            ))}
          {c.dues.map((task) => (
            <div key={task.id} className="y-dl" style={{ '--c': colorOf(task.title), top: pos(minuteOfDay(task.due)) }}>
              <span>마감 · {task.title}</span>
            </div>
          ))}
          {c.isToday && <i className="y-nw" style={{ top: pos(nowMin) }} />}
        </div>
      ))}
      {hasToday && (
        <div className="y-nl" style={{ top: pos(nowMin) }}>
          <span>{hm(nowMin)}</span>
        </div>
      )}
    </div>
  );
}

function Head({ title, note, onPrev, onNext, onNow, isNow }) {
  return (
    <div className="y-cn">
      <h2>{title}</h2>
      {note && <em>{note}</em>}
      <span className="y-sp" />
      <button type="button" className="y-gb" aria-label="이전" onClick={onPrev}>
        ‹
      </button>
      <button type="button" className="y-gb" aria-label="다음" onClick={onNext}>
        ›
      </button>
      <button type="button" className="y-gb" disabled={isNow} onClick={onNow}>
        지금
      </button>
    </div>
  );
}

// 날짜 둘레의 작은 고리: 그날이 얼마나 찼는지(16칸)
function Fill({ load }) {
  const lit = Math.round(Math.min(1, load) * 16);
  return (
    <svg className={load > 0.8 ? 'y-dz y-hot' : 'y-dz'} viewBox="-24 -24 48 48" aria-hidden="true">
      {Array.from({ length: 16 }, (_, j) => (
        <circle key={j} className={j < lit ? 'y-l' : undefined} cx={(21 * Math.sin((j / 16) * 2 * Math.PI)).toFixed(1)} cy={(-21 * Math.cos((j / 16) * 2 * Math.PI)).toFixed(1)} r="1.5" />
      ))}
    </svg>
  );
}

export function OursWeek({ app }) {
  const { weekFrom, setWeekFrom, today, now, calEvents, openTasks, densityOf, setSheet } = app;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i).toISOString());
  return (
    <div className="y-cal y-v-week">
      <Head
        title={weekTitle(weekFrom)}
        note={weekFrom === today ? '오늘부터' : ''}
        isNow={weekFrom === today}
        onPrev={() => setWeekFrom(addDays(weekFrom, -7).toISOString())}
        onNext={() => setWeekFrom(addDays(weekFrom, 7).toISOString())}
        onNow={() => setWeekFrom(today)}
      />
      <div className="y-wh" style={{ '--n': 7 }}>
        <span />
        {days.map((day) => {
          const k = kst(day);
          return (
            <div key={day} className={sameDay(day, now) ? 'y-dh y-td' : 'y-dh'}>
              <small>{WEEKDAYS[k.wd]}</small>
              <span className="y-dw">
                <Fill load={loadOf(densityOf(day))} />
                <b>{k.d}</b>
              </span>
              {/* 하루 종일 일정은 날짜 아래에 */}
              <span className="y-ml">
                {onDay(calEvents, day)
                  .filter(isAllDay)
                  .map((ev) => (
                    <button key={ev.id} type="button" className="y-mi" style={{ '--c': colorOf(ev.title) }} onClick={() => setSheet({ event: ev })}>
                      <i className="y-dot" />
                      <em>{ev.title}</em>
                    </button>
                  ))}
              </span>
            </div>
          );
        })}
      </div>
      <TimeGrid days={days} events={calEvents} tasks={openTasks} now={now} onEvent={(event) => setSheet({ event })} />
    </div>
  );
}

export function OursMonth({ app }) {
  const { month, setMonth, date, now, calEvents, openTasks, showWeekOf } = app;
  const isNow = month.y === date.y && month.m === date.m;
  return (
    <div className="y-cal y-v-month">
      <Head title={`${month.y}년 ${month.m}월`} isNow={isNow} onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))} onNow={() => setMonth({ y: date.y, m: date.m })} />
      <div className="y-mg">
        {WEEKDAYS.map((w) => (
          <span key={w} className="y-mw">
            {w}
          </span>
        ))}
        {monthGrid(month.y, month.m).map((day) => {
          const k = kst(day);
          const isToday = sameDay(day, now);
          const events = onDay(calEvents, day);
          const dues = openTasks.filter((task) => task.due && sameDay(task.due, day));
          const list = [...events.map((ev) => ({ key: `e${ev.id}`, title: ev.title })), ...dues.map((task) => ({ key: `t${task.id}`, title: task.title, due: true }))];
          const cls = `y-mc${isToday ? ' y-td' : ''}${k.m !== month.m ? ' y-out' : ''}${!isToday && new Date(day) < new Date(now) ? ' y-past' : ''}`;
          return (
            <button key={day.toISOString()} type="button" className={cls} aria-label={`${k.m}월 ${k.d}일, 일정 ${events.length}개, 마감 ${dues.length}개. 주간 달력에서 보기`} onClick={() => showWeekOf(day)}>
              <b>{k.d}</b>
              <span className="y-ml">
                {list.slice(0, 6).map((x) => (
                  <span key={x.key} className={x.due ? 'y-mi y-due' : 'y-mi'} style={{ '--c': colorOf(x.title) }}>
                    <i className="y-dot" />
                    <em>{x.title}</em>
                  </span>
                ))}
              </span>
              {list.length > 3 && <span className="y-mo">+{list.length - 3}</span>}
              {isToday && <i className="y-dp" style={{ '--p': `${(minuteOfDay(now) / 1440) * 100}%` }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
