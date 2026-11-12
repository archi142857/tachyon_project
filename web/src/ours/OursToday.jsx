// 오늘(시연 9판): 하루 고리 · 오늘 타임라인 · 해야 할 일을 한 화면에. 고리의 색 구간, 타임라인의 칸, 할 일 줄이 같이 골라진다.
// 자리 넣기 계산은 원래 화면(TodayView)과 같다: slots.js. 저장하지 않는다.
import { useState } from 'react';
import { dayEvents, daySlots, freeMinutes, hm } from '../slots.js';
import { minutesLabel, readyLabel, slackLabel } from '../tasks.js';
import { daysUntil, deadlineLabel, deadlineShort, minuteOfDay } from '../time.js';
import { TimeGrid } from './OursCal.jsx';
import OursRing from './OursRing.jsx';
import { CHECK, PAL, colorOf } from './skin.jsx';

// 할 일을 오늘 못 넣은 까닭
function noSlot(task) {
  if (!task.minutes) return '걸리는 시간을 몰라 자리를 못 잡았어요';
  if (task.ready === 0) return '수업·자료 뒤에 할 수 있어요';
  return '오늘은 넣을 빈 시간이 없어요';
}

function TaskRow({ task, now, onDone }) {
  const slack = slackLabel(task.slack_days);
  return (
    <div className="y-row">
      <i className="y-dot" style={{ '--c': colorOf(task.title) }} />
      <div>
        <b>{task.title}</b>
        <small>{[minutesLabel(task.minutes), readyLabel(task)].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="y-r">
        {slack && <b>{slack}</b>}
        <small>마감 {deadlineShort(task.due, now)}</small>
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

  return (
    <div className="y-hx">
      <div className="y-hc">
        <div className="y-rw" style={{ '--sc': picked ? picked.color : PAL[0] }}>
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
              고치기
            </button>
            <button type="button" className="y-gb" onClick={() => setSel(null)}>
              고르기 풀기
            </button>
          </div>
        ) : (
          <p className="y-cap">한 바퀴 = 오늘 0–24시 · 색 = 수업과 일정 · 옅은 구간 = 할 일을 넣어 본 자리 · 흰 입자 = 지금 · 바깥 점 = 아직 정리 안 된 메모</p>
        )}
      </div>

      <div className="y-hc y-tc">
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

      <div className="y-hc">
        <p className="y-lb">해야 할 일 · 남은 {openTasks.length}개</p>
        <div className="y-rows y-hr">
          {tasks.length === 0 && <p className="y-night">할 일이 없어요</p>}
          {tasks.map((task, i) => {
            const key = `t${task.id}`;
            return (
              <div key={key} className={sel === key ? 'y-ti y-on' : 'y-ti'} style={{ '--c': colorOf(task.title) }}>
                <div data-act="pick" onClick={() => pick(key)}>
                  <TaskRow task={task} now={now} onDone={doneTask} />
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
      </div>
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
