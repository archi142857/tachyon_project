// 오늘 화면: 오늘 타임라인 · 하루 고리 · 할 일을 한 번에 본다(넓은 화면은 타임라인 왼쪽, 고리 오른쪽 위, 할 일 오른쪽 아래. 폰은 고리 → 타임라인 → 할 일).
// 고리의 색 구간이나 할 일 줄을 누르면 고리 · 타임라인 · 할 일이 같이 골라진다(sel = 'e일정 id' | 't할 일 id').
// 타임라인은 굴리지 않고 하루가 한눈에 보이며, 누르면 주간 달력으로 간다(onWeek).
// 옅은 점선 칸은 빈 시간에 할 일을 넣어 본 자리다(slots.js). 저장하지 않는다.
import { useState } from 'react';
import { layoutDay } from '../layout.js';
import { dayEvents, daySlots, freeMinutes, hm } from '../slots.js';
import { minuteOfDay } from '../time.js';
import DayRing from './DayRing.jsx';
import { TaskRow } from './TasksCard.jsx';

const kindOf = (ev) => (ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics');
const span = (min) => [Math.floor(min / 60) && `${Math.floor(min / 60)}시간`, min % 60 && `${min % 60}분`].filter(Boolean).join(' ') || '0분';

// 할 일을 오늘 못 넣은 까닭
function noSlot(task) {
  if (!task.minutes) return '걸리는 시간을 몰라 자리를 못 잡았어요';
  if (task.ready === 0) return '수업·자료 뒤에 할 수 있어요';
  return '오늘은 넣을 빈 시간이 없어요';
}

// today = 오늘 0시(ISO), tasks = 화면에 보일 할 일(순서대로), total = 안 끝낸 할 일 수
export default function TodayView({ today, events, tasks, total, now, onDone, onEvent, onTask, onAll, onWeek }) {
  const [sel, setSel] = useState(null);
  const nowMin = minuteOfDay(now);
  const busy = dayEvents(events, today);
  const slots = daySlots(tasks, busy, nowMin);
  const placed = tasks.map((task, i) => ({ task, slot: slots[i], key: `t${task.id}` })).filter((p) => p.slot);

  // 고를 수 있는 것 모두: 일정 + 넣어 본 자리
  const items = [
    ...busy.map(({ ev, from, to }) => ({ key: `e${ev.id}`, from, to, kind: kindOf(ev), title: ev.title, sub: ev.place, edit: () => onEvent(ev) })),
    ...placed.map(({ task, slot, key }) => ({ key, from: slot[0], to: slot[1], kind: 'slot', title: task.title, sub: '넣어 본 자리', edit: () => onTask(task) })),
  ];
  const picked = items.find((x) => x.key === sel);
  const pick = (key) => setSel((s) => (s === key ? null : key));

  const first = Math.min(9, ...items.map((x) => Math.floor(x.from / 60)), Math.floor(nowMin / 60));
  const last = Math.max(20, ...items.map((x) => Math.ceil(x.to / 60)), Math.ceil((nowMin + 1) / 60));
  const top = (min) => `calc(var(--hour) * ${(min - first * 60) / 60})`;
  const box = (from, to) => ({ top: `calc(${top(from)} + 1px)`, height: `calc(var(--hour) * ${Math.max(to - from, 30) / 60} - 2px)` });

  return (
    <>
      {/* 카드 어디를 눌러도 주간 달력으로 간다. 키보드로는 머리의 '주간 달력' 단추(누름이 카드로 올라온다) */}
      <section className="card day" aria-label="오늘 타임라인" onClick={onWeek}>
        <div className="tasks-head">
          <h2 className="card-title">오늘 일정</h2>
          <span className="tag num">{busy.length}</span>
          <button type="button" className="btn-text">
            주간 달력
          </button>
        </div>
        {/* 하루 전체가 --day-h 높이에 들어가게 한 시간 높이를 나눈다 */}
        <div className="cal-grid one" style={{ '--hour': `calc(var(--day-h) / ${last - first})`, height: 'var(--day-h)' }}>
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
          <div className="col">
            {layoutDay(busy.map((b) => b.ev)).map(({ ev, col, cols }) => {
              const { from, to } = busy.find((b) => b.ev === ev);
              const key = `e${ev.id}`;
              return (
                <div
                  key={key}
                  className={`ev ${kindOf(ev)}${ev.important ? ' important' : ''}${sel === key ? ' sel' : ''}`}
                  style={{ ...box(from, to), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                >
                  <span className="sr-only">
                    {hm(from)}–{hm(to)},{' '}
                  </span>
                  {ev.title}
                  {ev.place && <span className="place">{ev.place}</span>}
                  {ev.important ? <span className="sr-only">, 중요</span> : null}
                </div>
              );
            })}
            {placed.map(({ task, slot, key }) => (
              <div key={key} className={`ev slot${sel === key ? ' sel' : ''}`} style={{ ...box(slot[0], slot[1]), left: '2px', width: 'calc(100% - 4px)' }}>
                <span className="sr-only">
                  {hm(slot[0])}–{hm(slot[1])},{' '}
                </span>
                {task.title}
                <span className="place">넣어 본 자리</span>
              </div>
            ))}
            <div className="now-line" role="img" style={{ top: top(nowMin) }} aria-label={`지금 ${hm(nowMin)}`} />
          </div>
        </div>
      </section>

      <section className="card ring-card" aria-label="하루 고리">
        <DayRing arcs={items} nowMin={nowMin} sel={sel} onPick={pick}>
          {picked ? (
            <>
              <strong className="mid-title">{picked.title}</strong>
              <span className="mid-sub num">
                {hm(picked.from)}–{hm(picked.to)}
              </span>
              {picked.sub && <span className="mid-sub">{picked.sub}</span>}
            </>
          ) : (
            <>
              <span className="mid-sub">오늘 남은 빈 시간</span>
              <strong className="mid-big num">{span(freeMinutes(busy, nowMin))}</strong>
            </>
          )}
        </DayRing>
        {picked ? (
          <div className="ring-key">
            <button type="button" className="btn-text" onClick={picked.edit}>
              고치기
            </button>
            <button type="button" className="btn-text quiet" onClick={() => setSel(null)}>
              고르기 풀기
            </button>
          </div>
        ) : (
          <p className="ring-key">
            <span>
              <i className="key-dot" />
              일정
            </span>
            <span>
              <i className="key-dot slot" />
              할 일을 넣어 본 자리
            </span>
          </p>
        )}
      </section>

      <section className="card tasks" aria-label="할 일">
        <div className="tasks-head">
          <h2 className="card-title">할 일</h2>
          {total > tasks.length && (
            <button type="button" className="btn-text" onClick={onAll}>
              전체 {total}개
            </button>
          )}
        </div>
        {tasks.length === 0 && <p className="empty">할 일이 없어요</p>}
        {tasks.map((task, i) => {
          const key = `t${task.id}`;
          return (
            <div key={key} className={sel === key ? 'pick on' : 'pick'} onClick={slots[i] ? () => setSel(key) : undefined}>
              <TaskRow task={task} now={now} onDone={onDone} onEdit={onTask} />
              <p className="slot-note num">{slots[i] ? `넣어 본 자리 ${hm(slots[i][0])}–${hm(slots[i][1])}` : noSlot(task)}</p>
            </div>
          );
        })}
      </section>
    </>
  );
}
