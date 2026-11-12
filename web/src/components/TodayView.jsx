// 오늘 화면: 오늘 타임라인 · 하루 고리 · 할 일을 한 번에 본다(넓은 화면은 타임라인 왼쪽, 고리 오른쪽 위, 할 일 오른쪽 아래. 폰은 고리 → 타임라인 → 할 일).
// 고리의 색 구간이나 할 일 줄을 누르면 고리 · 타임라인 · 할 일이 같이 골라진다(sel = 'e일정 id' | 't할 일 id').
// 타임라인은 굴리지 않고 하루가 한눈에 보이며, 누르면 주간 달력으로 간다(onWeek).
// 옅은 점선 칸은 빈 시간에 할 일을 넣어 본 자리다(slots.js). 저장하지 않는다.
import { useLayoutEffect, useRef, useState } from 'react';
import { layoutDay } from '../layout.js';
import { dayEvents, daySlots, freeMinutes, hm } from '../slots.js';
import { deadlineLabel, deadlineShort, minuteOfDay } from '../time.js';
import { tint, useParticles } from '../themeName.js';
import DayRing from './DayRing.jsx';
import { TaskRow } from './TasksCard.jsx';

const kindOf = (ev) => (ev.source === 'timetable' || ev.source === 'memo' ? ev.source : 'ics');
const parts = (min) => [[Math.floor(min / 60), '시간'], [min % 60, '분']].filter(([n]) => n);
const span = (min) => parts(min).map(([n, u]) => `${n}${u}`).join(' ') || '0분';
// 9판의 큰 숫자: 숫자는 크고 가늘게, 단위는 작게('14시간 45분')
const bigSpan = (min) => (parts(min).length ? parts(min).map(([n, u]) => (
  <span key={u}>
    {n}
    <i>{u}</i>{' '}
  </span>
)) : '0분');

// 할 일을 오늘 못 넣은 까닭
function noSlot(task) {
  if (!task.minutes) return '걸리는 시간을 몰라 자리를 못 잡았어요';
  if (task.ready === 0) return '수업·자료 뒤에 할 수 있어요';
  return '오늘은 넣을 빈 시간이 없어요';
}

// today = 오늘 0시(ISO), tasks = 화면에 보일 할 일(순서대로), total = 안 끝낸 할 일 수
// widget(id) = 넓은 화면 위젯 칸(WidgetGrid): { slot, lifted, grip } — 없으면 지금 그대로. editing이면 타임라인 카드를 눌러도 달력으로 가지 않는다
const card = (base, w) => `card ${base}${w.lifted ? ' lifted' : ''}`;
// fixed = { 할 일 id: { from, to } } 오늘 '이 시간에 넣기'로 정한 것(taskLocal.js) — 자리를 다시 잡지 않고 '정함'으로 보인다
// onTask(task, slot) = 할 일 바로 다루기 창(slot = 추천 자리, 없으면 null)
export default function TodayView({ today, events, tasks, total, now, fixed = {}, onDone, onEvent, onTask, onAll, onWeek, loose = [], onTidy, widget = () => ({}), editing = false, layoutKey = '' }) {
  const [sel, setSel] = useState(null);
  const w = { day: widget('day'), ring: widget('ring'), tasks: widget('tasks') };
  // 낮은 칸에서 타임라인이 카드 안에서 굴면(디자인 ②) 처음엔 지금 시각이 보이게 굴려 둔다
  const dayRef = useRef(null);
  useLayoutEffect(() => {
    const box = dayRef.current;
    const line = box?.querySelector('.now-line');
    if (!box || !line || box.scrollHeight <= box.clientHeight + 1) return;
    box.scrollTop = Math.max(0, line.offsetTop - box.clientHeight / 3);
  }, [layoutKey, w.day.slot]);
  const particles = useParticles(); // 입자 테마 = 9판 모양(과목 색 · 시각 줄 · 큰 숫자 · 고리 설명 한 줄)
  const nowMin = minuteOfDay(now);
  const busy = dayEvents(events, today);
  const slots = daySlots(tasks.map((t) => (fixed[t.id] ? { ...t, minutes: 0 } : t)), [...busy, ...Object.values(fixed)], nowMin); // 정한 것은 자리를 잡지 않고, 그 시간은 다른 할 일이 피한다
  const placed = tasks.map((task, i) => ({ task, slot: slots[i], key: `t${task.id}` })).filter((p) => p.slot);

  // 고를 수 있는 것 모두: 일정 + 넣어 본 자리
  const items = [
    ...busy.map(({ ev, from, to }) => ({ key: `e${ev.id}`, from, to, kind: kindOf(ev), title: ev.title, sub: ev.place, edit: () => onEvent(ev) })),
    ...placed.map(({ task, slot, key }) => ({ key, from: slot[0], to: slot[1], kind: 'slot', title: task.title, sub: `넣어 본 자리 · ${deadlineLabel(task.due, now)}`, edit: () => onTask(task, slot) })),
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
      <section ref={dayRef} className={card('day', w.day)} data-slot={w.day.slot} data-widget={w.day.slot && 'day'} aria-label="오늘 타임라인" onClick={editing ? undefined : onWeek}>
        {w.day.grip}
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
                  className={`ev ${kindOf(ev)}${to - from <= 60 ? ' short' : ''}${ev.important ? ' important' : ''}${sel === key ? ' sel' : ''}`}
                  style={{ ...box(from, to), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, '--c': tint(ev.title) }}
                >
                  <span className="sr-only">
                    {hm(from)}–{hm(to)},{' '}
                  </span>
                  {ev.title}
                  {particles ? <span className="place">{[ev.place, `${hm(from)} – ${hm(to)}`].filter(Boolean).join(' · ')}</span> : ev.place && <span className="place">{ev.place}</span>}
                  {ev.important ? <span className="sr-only">, 중요</span> : null}
                </div>
              );
            })}
            {placed.map(({ task, slot, key }) => (
              <div key={key} className={`ev slot${sel === key ? ' sel' : ''}`} style={{ ...box(slot[0], slot[1]), left: '2px', width: 'calc(100% - 4px)', '--c': tint(task.title) }}>
                <span className="sr-only">
                  {hm(slot[0])}–{hm(slot[1])},{' '}
                </span>
                {task.title}
                <span className="place">넣어 본 자리 · 마감 {deadlineShort(task.due, now)}</span>
              </div>
            ))}
            <div className="now-line" role="img" style={{ top: top(nowMin) }} aria-label={`지금 ${hm(nowMin)}`}>
              {particles && <span className="now-at num">{hm(nowMin)}</span>}
            </div>
          </div>
        </div>
      </section>

      <section className={card('ring-card', w.ring)} data-slot={w.ring.slot} data-widget={w.ring.slot && 'ring'} aria-label="하루 고리">
        {w.ring.grip}
        {loose.length > 0 && onTidy && (
          <button type="button" className="btn-text loose-btn" onClick={onTidy}>
            <i className="key-loose" />
            메모 {loose.length}개 정리
          </button>
        )}
        <DayRing arcs={items} nowMin={nowMin} sel={sel} onPick={pick} loose={loose}>
          {picked ? (
            <>
              <strong className="mid-title">{picked.title}</strong>
              <span className="mid-sub num">
                {hm(picked.from)}–{hm(picked.to)}
              </span>
              {picked.sub && <span className="mid-sub">{picked.sub}</span>}
            </>
          ) : particles ? (
            <>
              <strong className="mid-big num">{bigSpan(freeMinutes(busy, nowMin))}</strong>
              <span className="mid-sub">오늘 남은 빈 시간</span>
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
        ) : particles ? (
          <p className="ring-cap">한 바퀴 = 오늘 0–24시 · 색 = 수업과 일정 · 옅은 구간 = 할 일을 넣어 본 자리 · 흰 입자 = 지금 · 바깥 점 = 아직 정리 안 된 메모</p>
        ) : (
          <p className="ring-key">
            <span>
              <i className="key-dot" />
              수업
            </span>
            <span>
              <i className="key-sq" />내 일정
            </span>
            <span>
              <i className="key-tri" />할 일을 넣어 본 자리
            </span>
            <span>
              <i className="key-now" />지금
            </span>
          </p>
        )}
      </section>

      <section className={card('tasks', w.tasks)} data-slot={w.tasks.slot} data-widget={w.tasks.slot && 'tasks'} aria-label="할 일">
        {w.tasks.grip}
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
              <TaskRow task={task} now={now} onDone={onDone} onEdit={(t) => onTask(t, slots[i])} />
              {fixed[task.id] ? (
                <p className="slot-note fixed num">정함 {hm(fixed[task.id].from)}–{hm(fixed[task.id].to)}</p>
              ) : slots[i] ? (
                // 추천(점선 · '추천' 꼬리표, 디자인 ⑦) — 누르면 '이 시간에 넣기'
                <button type="button" className="slot-note suggest num" onClick={() => onTask(task, slots[i])}>
                  <span className="tag suggest">추천</span> {hm(slots[i][0])}–{hm(slots[i][1])} 어때요?
                </button>
              ) : (
                <p className="slot-note num">{noSlot(task)}</p>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
