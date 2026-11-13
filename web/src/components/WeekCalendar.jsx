// 주간 달력. 첫 칸은 start(처음엔 오늘)이고 좌우 화살표·밀기로 n일씩, 앞뒤 제한 없이 옮긴다(11-11 사람 "달력이 왜 3주만 보이는지").
// n = 보이는 날 수: 하루 · 3일 · 주(11-14 피드백 '달력도 하루 3일 (지정 가능)', 폰은 처음 3일).
// 빈 칸을 누르면 그 30분 자리로 onAdd(날, 분) — 일정 넣기 창(11-14). 일정은 끌어서 옮기고, 아래 끝 손잡이로 길이를 바꾼다(useEventDrag → onDrop).
// 지금 선은 오늘이 보이면 늘 보인다(시간 축이 지금 시각을 품게 넓힌다 — 11-14 '실시간 선이 안 뜸': 밤에는 9–20시 축 밖이라 안 그려졌다).
// 날짜 숫자를 그날 밀도 고리(DensityRing)가 감싸고(11-13 사람 '바쁨도 밀도 고리가 날짜 숫자를 감싸도록'), 밑에 쓰는 시간. 날짜를 누르면 그날로 메모 칸을 연다(onDay). ('고르게' 막대 줄과 설명은 11-12 사람 "없어도 될 듯"으로 뺐다 — 고르게 나눈 것은 고리와 할 일 쪽 '나눠 둔 몫'에 보인다.)
// 맨 위 줄은 과제 마감(시각을 붙여서)과 하루 종일 일정, 아래는 시간 칸. 중요한 일정은 굵은 테두리.
// 입자 테마는 9판 주간 달력: 8–24시(새벽이면 0–24시)를 8칸 눈금으로, 마감은 맨 위 줄 대신 그 시각의 점선(9판 .dl), 지금은 칸을 가로지르는 점선과 시각(9판 .nl).
// 앞 수업에서 걸어오는 시간이 쉬는 시간보다 길면 칸 안에 빨간 'N분 지각'(TT Wizard 말투, legs = campus.js dayLegs).
import { useLayoutEffect, useRef, useState } from 'react';
import { arriveText, lateOf } from '../campus.js';
import { hm } from '../slots.js';
import { hoursText } from '../density.js';
import { endOf, hourRange, isAllDay, layoutDay } from '../layout.js';
import { addDays, dayIndex, deadlineLabel, endOrHour, hhmm, kst, minuteOfDay, toKstIso, WEEKDAYS, weekTitle } from '../time.js';
import DensityRing from './DensityRing.jsx';
import Icon from './Icon.jsx';
import { tint, useParticles } from '../themeName.js';
import useEventDrag from './useEventDrag.js';

const timeText = (ev) => `${hhmm(ev.start)}–${hhmm(endOrHour(ev.start, ev.end))}`; // 끝이 없으면 1시간(11-13)

// 마우스를 올리면 보이는 한 줄(title)
function eventLabel(ev, leg) {
  const late = lateOf(leg && leg.arrive);
  const walk = leg && leg.arrive ? `${arriveText(leg.arrive)}${late ? ` — ${late}분 지각` : ''}` : null;
  return [ev.title, timeText(ev), ev.place, ev.important ? '중요' : null, walk].filter(Boolean).join(', ');
}

const used = (d) => (d ? d.eventMin + d.taskMin + d.over : 0);

// 다 같이 빈 시간 띠(11-13, 디자인 넷째 묶음 ①)의 끝 글자: 자정이면 24:00
const spanEnd = (sp) => (sp.end.slice(0, 10) !== sp.start.slice(0, 10) && hhmm(sp.end) === '00:00' ? '24:00' : hhmm(sp.end));

// density(date) → 그날 밀도(density.js) 또는 null
// together = { name, spans: [{ start, end }] } 고른 그룹의 다 같이 빈 시간(없으면 null) → 칸마다 일정 뒤에 띠.
// 띠를 누르면 onTogether({ start, end }) — 누른 30분부터 1시간(띠 끝까지), 키보드로는 띠 처음부터
// 칸 높이에 들어가는 줄 수(글자가 줄을 넘어 반쯤 잘려 보이지 않게, 11-14 피드백) — 남는 줄은 '…'로 끝난다
const linesFor = (hours, hourPx, lh) => Math.max(1, Math.floor((hours * hourPx - 6) / lh));

export default function WeekCalendar({ start, n = 7, events, tasks, now, density, isCurrent, onPrev, onNext, onToday, onEvent, onTask, onDay, onAdd, onDrop, legs, together, onTogether }) {
  const nine = useParticles();
  const touch = useRef(null);
  const days = Array.from({ length: n }, (_, i) => addDays(start, i));
  const todayIdx = dayIndex(start, now);
  const showNow = todayIdx >= 0 && todayIdx < n;
  const nowHour = minuteOfDay(now) / 60;
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  const shown = timed.filter((e) => dayIndex(start, e.start) < n);
  const range = hourRange(start, together ? [...shown, ...together.spans] : shown); // 겹쳐 보면 다 같이 빈 시간도 보이게 넓힌다
  const nowFirst = showNow ? Math.min(range.first, Math.floor(nowHour)) : range.first;
  const first = nine ? (Math.min(range.first, Math.floor(nowHour)) < 8 ? 0 : 8) : nowFirst;
  const last = nine ? 24 : showNow ? Math.max(range.last, Math.min(24, Math.floor(nowHour) + 1)) : range.last;
  const step = nine ? (24 - first) / 8 : 1;
  const hourAt = (date) => minuteOfDay(date) / 60 - first;
  const nowTop = hourAt(now);

  const dens = days.map((d) => density(d));

  // 한 시간 높이(px)와 일정 글자 줄 높이: 칸에 들어가는 줄 수를 세려고 잰다
  const gridRef = useRef(null);
  const [fit, setFit] = useState({ hour: 40, lh: 15 });
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setFit({ hour: g.clientHeight / (last - first) || 40, lh: parseFloat(getComputedStyle(g).getPropertyValue('--ev-lh')) || 15 });
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    measure();
    return () => ro.disconnect();
  }, [last, first]);

  const cols = () => (gridRef.current ? [...gridRef.current.querySelectorAll(':scope > .col')] : []);
  const drag = useEventDrag({
    cols,
    n,
    first,
    last,
    onDrop: onDrop && ((ev, to) => onDrop(ev, { start: toKstIso(new Date(days[to.day].getTime() + to.from * 60000)), end: toKstIso(new Date(days[to.day].getTime() + to.to * 60000)) })),
  });
  const ghostOf = (i) => drag.ghost && drag.ghost.day === i && drag.ghost;

  const top = days.map((day, i) => [
    ...(nine ? [] : tasks.filter((t) => t.due && dayIndex(start, t.due) === i).map((t) => ({ kind: 'deadline', item: t }))),
    ...allDay.filter((e) => new Date(e.start) <= day && endOf(e) > day.getTime()).map((e) => ({ kind: 'allday', item: e })),
  ]);
  const hasTop = top.some((items) => items.length);

  return (
    <section
      className="card cal"
      aria-label={n === 7 ? '주간 달력' : `${n}일 달력`}
      style={{ '--n': n }}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current || drag.ghost) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
      }}
    >
      <div className="cal-head">
        <h2 className="card-title num">
          {weekTitle(start, n)}
          {nine && isCurrent && <em>오늘부터</em>}
        </h2>
        {!isCurrent && (
          <button type="button" className="btn-text" onClick={onToday}>
            오늘
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`앞 ${n}일`} onClick={onPrev}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn" aria-label={`다음 ${n}일`} onClick={onNext}>
          <Icon name="right" />
        </button>
      </div>

      <div className="cal-days">
        <span className="axis-label" aria-hidden="true" />
        {days.map((day, i) => {
          const d = dens[i];
          const p = kst(day);
          return (
            <button
              key={i}
              type="button"
              className={`cal-day${i === todayIdx ? ' today' : ''}`}
              aria-label={`${p.m}월 ${p.d}일 ${WEEKDAYS[p.wd]}요일${d ? `, 일정 ${hoursText(d.eventMin)}, 할 일 ${hoursText(d.taskMin + d.over)}` : ''}. 이 날에 넣기`}
              onClick={() => onDay?.(day)}
            >
              <span className="wd">{WEEKDAYS[p.wd]}</span>
              <span className="dn-ring">
                <DensityRing day={d} size={nine ? 48 : 36} />
                <span className="dn num">{p.d}</span>
              </span>
              <span className="dh num">{d ? Math.round((used(d) / 60) * 10) / 10 : ''}</span>
            </button>
          );
        })}
      </div>

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
        <div className="cal-grid" ref={gridRef} style={{ height: `calc(var(--hour) * ${last - first})` }}>
          {Array.from({ length: (last - first) / step - 1 }, (_, i) => (
            <div key={i} className="hline" style={{ top: `calc(var(--hour) * ${(i + 1) * step})` }} aria-hidden="true" />
          ))}
          <div className="hours" aria-hidden="true">
            {Array.from({ length: (last - first) / step }, (_, i) => (
              <span key={i} className="num" style={{ top: i === 0 ? '2px' : `calc(var(--hour) * ${i * step} - 8px)` }}>
                {first + i * step}
              </span>
            ))}
          </div>
          {nine && showNow && nowTop >= 0 && nowTop <= last - first && (
            <div className="nl" style={{ top: `calc(var(--hour) * ${nowTop})` }} aria-hidden="true">
              <span className="num">{hhmm(now).padStart(5, '0')}</span>
            </div>
          )}
          {days.map((day, i) => (
            <div
              className={i === todayIdx ? 'col today' : 'col'}
              key={i}
              onClick={(e) => {
                // 빈 칸 누르기 → 그 30분 자리에 일정 넣기(일정 · 띠를 누른 것은 그쪽이 받는다)
                if (!onAdd || e.target !== e.currentTarget) return;
                const box = e.currentTarget.getBoundingClientRect();
                const min = first * 60 + Math.floor((((e.clientY - box.top) / box.height) * (last - first) * 60) / 30) * 30;
                onAdd(day, Math.min(min, 23 * 60 + 30));
              }}
            >
              {together?.spans
                .filter((sp) => dayIndex(start, sp.start) === i)
                .map((sp) => {
                  const s0 = hourAt(sp.start);
                  const top = Math.max(s0, 0);
                  const bottom = Math.min(s0 + (Date.parse(sp.end) - Date.parse(sp.start)) / 3600000, last - first);
                  if (bottom <= top) return null;
                  const style = { top: `calc(var(--hour) * ${top})`, height: `calc(var(--hour) * ${bottom - top})` };
                  const label = `다 같이 빈 시간 ${hhmm(sp.start)}–${spanEnd(sp)}`;
                  if (!onTogether) return <i key={sp.start} className="together-band" style={style} aria-hidden="true" />;
                  return (
                    <button
                      key={sp.start}
                      type="button"
                      className="together-band"
                      style={style}
                      aria-label={`${label}, 모임 잡기`}
                      title={`${label} · ${together.name} — 누르면 이 시간으로 모임 잡기`}
                      onClick={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const at = e.detail && box.height ? (e.clientY - box.top) / box.height : 0; // 키보드(detail 0)는 처음부터
                        const startMs = Date.parse(sp.start);
                        const endMs = Date.parse(sp.end);
                        const pickedMin = (top - s0) * 60 + at * (bottom - top) * 60;
                        const from = Math.min(startMs + Math.floor(pickedMin / 30) * 30 * 60000, endMs - 30 * 60000);
                        onTogether({ start: toKstIso(new Date(from)), end: toKstIso(new Date(Math.min(from + 60 * 60000, endMs))) });
                      }}
                    />
                  );
                })}
              {layoutDay(timed.filter((e) => dayIndex(start, e.start) === i)).map(({ ev, col, cols }) => {
                const s = hourAt(ev.start);
                const len = Math.min((endOf(ev) - Date.parse(ev.start)) / 3600000, last - first - s);
                const leg = legs && legs.get(ev.id);
                const late = lateOf(leg && leg.arrive);
                const from = minuteOfDay(ev.start);
                const item = { ev, day: i, from, to: from + Math.round((endOf(ev) - Date.parse(ev.start)) / 60000) };
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={`ev ${ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics'}${ev.important ? ' important' : ''}${late > 0 ? ' late-ev' : ''}${nine && endOf(ev) < new Date(now).getTime() ? ' past' : ''}${drag.ghost?.id === ev.id ? ' lifting' : ''}`}
                    style={{
                      top: `calc(var(--hour) * ${s} + 1px)`,
                      height: `calc(var(--hour) * ${Math.max(len, 0.5)} - 2px)`,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                      '--c': tint(ev.title),
                    }}
                    title={eventLabel(ev, leg)}
                    onPointerDown={(e) => drag.start(e, item, 'move')}
                    onContextMenu={(e) => onDrop && e.preventDefault()}
                    onClick={() => !drag.takeClick() && onEvent(ev)}
                  >
                    {/* 이름은 보이는 글자 그대로 + 화면 읽기용 시각·중요(보이는 글자가 이름 안에 있어야 한다) */}
                    <span className="sr-only">{timeText(ev)}, </span>
                    <span className="ev-t" style={{ WebkitLineClamp: linesFor(Math.max(len, 0.5), fit.hour, fit.lh) }}>
                      {ev.title}
                    </span>
                    {nine ? <span className="place">{timeText(ev).replace('–', ' – ')}</span> : ev.place && <span className="place">{ev.place}</span>}
                    {ev.important ? <span className="sr-only">, 중요</span> : null}
                    {late > 0 && <span className="late-pill">{late}분 지각</span>}
                    {onDrop && <span className="ev-grip" aria-hidden="true" onPointerDown={(e) => (e.stopPropagation(), drag.start(e, item, 'resize'))} />}
                  </button>
                );
              })}
              {nine &&
                tasks
                  .filter((t) => t.due && dayIndex(start, t.due) === i)
                  .map((t) => (
                    <button
                      key={`d${t.id}`}
                      type="button"
                      className={`dl${t.done ? ' dn' : ''}`}
                      style={{ top: `calc(var(--hour) * ${Math.max(0, hourAt(t.due))})`, '--c': tint(t.title) }}
                      title={`${t.title} — ${deadlineLabel(t.due, now)}`}
                      onClick={() => onTask(t)}
                    >
                      <span>마감 · {t.title}</span>
                    </button>
                  ))}
              {ghostOf(i) && (
                <div className="ev-ghost" style={{ top: `calc(var(--hour) * ${ghostOf(i).from / 60 - first})`, height: `calc(var(--hour) * ${(ghostOf(i).to - ghostOf(i).from) / 60})` }} aria-hidden="true">
                  <span className="when num">
                    {hm(ghostOf(i).from)}–{hm(ghostOf(i).to)}
                  </span>
                </div>
              )}
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
