// 할 일 3개(왼쪽 위). 순서와 몰린 주 경고는 서버(/api/briefing/rank)가 준다. 체크하면 끝, 제목을 누르면 고치기.
// 전체 목록은 햄버거 메뉴 안에 있다.
import { minutesLabel, readyLabel, slackLabel } from '../tasks.js';
import { daysUntil, deadlineLabel } from '../time.js';

// track = 마감 자(디자인 ⑥, 사람 피드백 4 '마감 시간 선형으로'): 지금 → 7일 뒤 같은 자에 마감 ▲. 할 일 쪽 전체 목록에서만
export function TaskRow({ task, now, onDone, onEdit, track = false }) {
  const ready = readyLabel(task);
  const minutes = minutesLabel(task.minutes);
  const slack = slackLabel(task.slack_days);
  // 마감은 날짜·시각을 늘 함께(11-11 사람 "마감 시간 같은 게 안 보이니까 불편함"). 지났으면 붉게, 오늘이면 진하게
  const late = task.due && Date.parse(task.due) < new Date(now).getTime();
  const soon = !late && task.due && daysUntil(task.due, now) === 0;
  return (
    <div className="task">
      <input type="checkbox" aria-label={`${task.title} 끝`} checked={!!task.done} onChange={() => onDone(task)} />
      <span className="body">
        <button type="button" className="title" onClick={() => onEdit(task)}>
          {task.title}
        </button>
        <span className="meta num">
          <span className={late ? 'due late-due' : soon ? 'due soon' : 'due'}>{deadlineLabel(task.due, now)}</span>
          {minutes && <span className="min"> · {minutes}</span>}
          {slack && <span className={task.slack_days < 0 ? 'min short' : 'min'}> · {slack}</span>}
          {ready && <span className="ready"> · {ready}</span>}
        </span>
        {track && task.due && <DueTrack due={task.due} now={now} />}
      </span>
    </div>
  );
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
function DueTrack({ due, now }) {
  const left = Date.parse(due) - new Date(now).getTime();
  const p = Math.min(1, Math.max(0, left / WEEK));
  return (
    <span className={`due-track${left < 0 ? ' late' : left > WEEK ? ' far' : ''}`} style={{ '--p': p }} aria-hidden="true">
      <i className="fill" />
      <i className="mark" />
    </span>
  );
}

export default function TasksCard({ tasks, warning, now, onDone, onEdit }) {
  return (
    <section className="card tasks" aria-label="할 일">
      <div className="tasks-head">
        <h2 className="card-title">할 일</h2>
        {warning && (
          <span className="tag warn" title={warning}>
            {warning}
          </span>
        )}
      </div>
      {tasks.length === 0 && <p className="empty">남은 할 일이 없어요</p>}
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} now={now} onDone={onDone} onEdit={onEdit} />
      ))}
    </section>
  );
}
