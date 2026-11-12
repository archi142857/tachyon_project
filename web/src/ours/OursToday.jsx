// 오늘(시연 9판): 하루 고리 · 오늘 타임라인 · 해야 할 일을 한 화면에. 고리의 색 구간, 타임라인의 칸, 할 일 줄이 같이 골라진다.
// 자리 넣기 계산은 원래 화면(TodayView)과 같다: slots.js. 저장하지 않는다.
import { useLayoutEffect, useRef, useState } from 'react';
import { dayEvents, daySlots, freeMinutes, hm } from '../slots.js';
import { minutesLabel, readyLabel, slackLabel } from '../tasks.js';
import { daysUntil, deadlineLabel, deadlineShort, minuteOfDay } from '../time.js';
import { TimeGrid } from './OursCal.jsx';
import OursRing from './OursRing.jsx';
import { CHECK, PAL, colorOf, usePhone } from './skin.jsx';

// 할 일을 오늘 못 넣은 까닭
function noSlot(task) {
  if (!task.minutes) return '걸리는 시간을 몰라 자리를 못 잡았어요';
  if (task.ready === 0) return '수업·자료 뒤에 할 수 있어요';
  return '오늘은 넣을 빈 시간이 없어요';
}

// 넓은 화면은 3칸. 고리를 끌어 세 칸 중 하나로 옮기면 나머지가 차례대로 비켜선다(11-13 사람 "고리가 커서를 따라와야").
// 고른 차례는 이 기기에만 둔다.
const CARDS = ['ring', 'time', 'tasks']; // 기본 = 시연 9판 처음 3칸
const ORDER_KEY = 'tachyon_today_order';
function loadOrder() {
  try {
    const o = JSON.parse(localStorage.getItem(ORDER_KEY));
    return Array.isArray(o) && o.length === 3 && CARDS.every((k) => o.includes(k)) ? o : CARDS;
  } catch {
    return CARDS;
  }
}

// 줄 아래 글: 예상 시간 · 추천 시간(오늘 빈 시간에 넣어 본 자리, 시연 9판처럼) · 지금 가능 (11-12 사람 "예상 시간과 추천시간 띄워줘")
function TaskRow({ task, now, onDone, slot }) {
  const slack = slackLabel(task.slack_days);
  const time = task.minutes == null ? '예상 시간 ?' : `예상 ${minutesLabel(task.minutes).replace('약 ', '')}`;
  return (
    <div className="y-row">
      <i className="y-dot" style={{ '--c': colorOf(task.title) }} />
      <div>
        <b>{task.title}</b>
        <small>{[time, slot && `추천 ${hm(slot[0])}–${hm(slot[1])}`, readyLabel(task)].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="y-r">
        {slack && <b>{slack}</b>}
        <small>{task.due ? `마감 ${deadlineShort(task.due, now)}` : '마감 없음'}</small>
      </div>
      <button
        type="button"
        className="y-ck"
        aria-label={`${task.title} 끝냄`}
        onClick={(e) => {
          e.stopPropagation();
          onDone(task);
        }}
      >
        {CHECK}
      </button>
    </div>
  );
}

export default function OursToday({ app }) {
  const { today, now, planEvents, openTasks, memos, doneTask, setSheet, setPage, showWeekOf } = app;
  const [sel, setSel] = useState(null);
  const tasks = openTasks.slice(0, 6);
  const nowMin = minuteOfDay(now);
  const busy = dayEvents(planEvents, today);
  const slots = daySlots(tasks, busy, nowMin);
  const placed = tasks.map((task, i) => ({ key: `t${task.id}`, task, slot: slots[i] })).filter((p) => p.slot);

  // 고를 수 있는 것 모두: 일정 + 넣어 본 자리
  const items = [
    ...busy.map(({ ev, from, to }) => ({ key: `e${ev.id}`, from, to, color: colorOf(ev.title), title: ev.title, sub: ev.place, edit: () => setSheet({ event: ev }) })),
    ...placed.map(({ key, task, slot }) => ({ key, task: true, from: slot[0], to: slot[1], color: colorOf(task.title), title: task.title, sub: '넣어 본 자리', edit: () => setSheet({ task }) })),
  ];
  const picked = items.find((x) => x.key === sel);
  const pick = (key) => setSel((s) => (s === key ? null : key));
  const free = freeMinutes(busy, nowMin);
  const later = busy.filter((b) => b.to > nowMin); // 오늘 남은 일정(폰: 타임라인 대신 목록으로)

  // 고리 끌기: 6px 넘게 움직이면 고리 칸이 커서를 따라오고, 놓으면 그 아래 칸으로 미끄러져 들어간다(FLIP)
  const phone = usePhone();
  const [order, setOrder] = useState(loadOrder);
  const [over, setOver] = useState(null); // 끄는 동안 고리가 들어갈 칸(0~2)
  const grid = useRef(null);
  const cards = useRef({});
  const before = useRef(null); // 옮기기 직전 칸들의 자리
  useLayoutEffect(() => {
    const first = before.current;
    if (!first) return;
    before.current = null;
    for (const [k, r] of Object.entries(first)) {
      const el = cards.current[k];
      el.style.transition = 'none';
      el.style.transform = ''; // 끌던 자리를 빼고 새 칸 자리를 잰다
      const now = el.getBoundingClientRect();
      el.style.transform = `translate(${r.left - now.left}px, ${r.top - now.top}px)`;
      el.getBoundingClientRect(); // 시작 자리를 먼저 그리게
      el.style.transition = 'transform .38s cubic-bezier(.2, .8, .2, 1)';
      el.style.transform = '';
    }
  }, [order]);
  const grab = (e) => {
    if (phone || e.button !== 0) return;
    const el = cards.current.ring;
    const [x0, y0] = [e.clientX, e.clientY];
    let moved = false;
    const zoneAt = (x) => {
      const r = grid.current.getBoundingClientRect();
      return Math.min(2, Math.max(0, Math.floor(((x - r.left) / r.width) * 3)));
    };
    const move = (ev) => {
      const [dx, dy] = [ev.clientX - x0, ev.clientY - y0];
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.classList.add('y-drag');
      setOver(zoneAt(ev.clientX));
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      // 끈 뒤 손 뗄 때 생기는 누름(고리 구간 고르기)은 버린다
      const eat = (c) => c.stopPropagation();
      window.addEventListener('click', eat, true);
      setTimeout(() => window.removeEventListener('click', eat, true));
      el.classList.remove('y-drag');
      setOver(null);
      before.current = Object.fromEntries(Object.entries(cards.current).map(([k, n]) => [k, n.getBoundingClientRect()]));
      const next = order.filter((k) => k !== 'ring');
      next.splice(zoneAt(ev.clientX), 0, 'ring');
      setOrder(next);
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      } catch {
        // 못 적어도 이번에는 옮겨진다
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const place = (k) => ({ ref: (el) => (cards.current[k] = el), style: { gridArea: `1 / ${order.indexOf(k) + 1}` } });

  return (
    <div className="y-hx" ref={grid}>
      <div className="y-hc" {...place('ring')}>
        <div className="y-rw" style={{ '--sc': picked ? picked.color : PAL[0] }} onPointerDown={grab} title={phone ? undefined : '끌어서 다른 칸으로 옮길 수 있어요'}>
          <OursRing items={items} nowMin={nowMin} sel={sel} onPick={pick} memos={memos.filter((m) => !m.handled).length} onMemos={() => setPage('memo')}>
            {picked ? (
              <>
                <b className="y-nm">{picked.title}</b>
                <span>
                  {hm(picked.from)} – {hm(picked.to)}
                  {picked.sub ? ` · ${picked.sub}` : ''}
                </span>
              </>
            ) : (
              <>
                <b className="y-num">
                  {Math.floor(free / 60)}
                  <i>시간</i> {free % 60}
                  <i>분</i>
                </b>
                <span>오늘 남은 빈 시간</span>
              </>
            )}
          </OursRing>
        </div>
        {picked ? (
          <div className="y-chips y-pick">
            <button type="button" className="y-gb" onClick={picked.edit}>
              {picked.task ? '고치기' : '자세히'}
            </button>
            <button type="button" className="y-gb" onClick={() => setSel(null)}>
              고르기 풀기
            </button>
          </div>
        ) : (
          <p className="y-cap">한 바퀴 = 오늘 0–24시 · 색 = 수업과 일정 · 옅은 구간 = 할 일을 넣어 본 자리 · 흰 입자 = 지금 · 바깥 점 = 아직 정리 안 된 메모</p>
        )}
      </div>

      <div className="y-hc y-tc" {...place('time')}>
        <p className="y-lb">
          오늘 일정 · 고리를 누르면 여기서 같은 칸이 골라져요
          <button type="button" className="y-bk y-go" onClick={() => showWeekOf(today)}>
            주간 달력 ›
          </button>
        </p>
        {/* 굴리지 않고 하루가 한눈에. 빈 곳을 누르면 주간 달력으로 */}
        <div className="y-tw" onClick={() => showWeekOf(today)}>
          <TimeGrid days={[today]} events={planEvents} tasks={openTasks} now={now} sel={sel} placed={placed} onEvent={(ev, key) => pick(key)} onPlaced={pick} />
        </div>
      </div>

      <div className="y-hc" {...place('tasks')}>
        <p className="y-lb">해야 할 일 · 남은 {openTasks.length}개</p>
        <div className="y-rows y-hr">
          {tasks.length === 0 && <p className="y-night">할 일이 없어요. 아래 메모 칸에 적으면 할 일로 넣어 드려요</p>}
          {tasks.map((task, i) => {
            const key = `t${task.id}`;
            return (
              <div key={key} className={sel === key ? 'y-ti y-on' : 'y-ti'} style={{ '--c': colorOf(task.title) }}>
                <div data-act="pick" onClick={() => pick(key)}>
                  <TaskRow task={task} now={now} onDone={doneTask} slot={slots[i]} />
                </div>
                <div className="y-dt">
                  <small>
                    {slots[i] ? `넣어 본 자리 ${hm(slots[i][0])}–${hm(slots[i][1])}` : noSlot(task)} · {deadlineLabel(task.due, now)}
                  </small>
                  <div className="y-chips">
                    <button type="button" className="y-gb" onClick={() => setSheet({ task })}>
                      고치기
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {openTasks.length > tasks.length && (
            <button type="button" className="y-gb" onClick={() => setPage('tasks')}>
              전체 {openTasks.length}개 보기
            </button>
          )}
        </div>
        {/* 폰에서만: 오늘 남은 일정 목록(넓은 화면은 타임라인이 있다). 누르면 고치기 */}
        <div className="y-later">
          <p className="y-lb">
            오늘 남은 일정 · {later.length}개
            <button type="button" className="y-bk y-go" onClick={() => showWeekOf(today)}>
              주간 달력 ›
            </button>
          </p>
          <div className="y-rows">
            {later.length === 0 && <p className="y-night">오늘 남은 일정이 없어요</p>}
            {later.map(({ ev, from, to }) => (
              <div key={ev.id} className="y-ti" onClick={() => setSheet({ event: ev })}>
                <div className="y-row">
                  <i className="y-dot" style={{ '--c': colorOf(ev.title) }} />
                  <div>
                    <b>{ev.title}</b>
                    <small>{ev.place || '장소 없음'}</small>
                  </div>
                  <div className="y-r">
                    <b className="num">
                      {hm(from)} – {hm(to)}
                    </b>
                    <small>{from <= nowMin ? '하는 중' : `${Math.floor((from - nowMin) / 60) ? `${Math.floor((from - nowMin) / 60)}시간 ` : ''}${(from - nowMin) % 60}분 뒤`}</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {over != null && <i className="y-zone" style={{ gridArea: `1 / ${over + 1}` }} aria-hidden="true" />}
    </div>
  );
}

// 전체: 남은 할 일을 마감 가까운 묶음으로
const GROUPS = [
  ['마감 지남', (d) => d != null && d < 0],
  ['오늘까지', (d) => d === 0],
  ['이레 안', (d) => d > 0 && d <= 7],
  ['그 뒤', (d) => d > 7],
  ['마감 없음', (d) => d == null],
];

export function OursTasks({ app }) {
  const { openTasks, now, doneTask, setSheet } = app;
  const left = (task) => (task.due ? daysUntil(task.due, now) : null);
  return (
    <div className="y-col">
      <p className="y-lb">남은 할 일 {openTasks.length}개 · 줄을 누르면 고칠 수 있어요</p>
      {GROUPS.map(([name, test], g) => {
        const list = openTasks.filter((task) => test(left(task)));
        if (!list.length) return null;
        return (
          <div key={name} className="y-rows">
            <p className="y-gh">
              <i className="y-dot" style={{ '--c': PAL[g] }} />
              <b>{name}</b>
              <span>남은 {list.length}개</span>
            </p>
            {list.map((task) => (
              <div key={task.id} className="y-ti" onClick={() => setSheet({ task })}>
                <div data-act="edit">
                  <TaskRow task={task} now={now} onDone={doneTask} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {openTasks.length === 0 && <p className="y-night">남은 할 일이 없어요</p>}
      <button type="button" className="y-gb" onClick={() => setSheet('done')}>
        끝낸 일 보기
      </button>
    </div>
  );
}
