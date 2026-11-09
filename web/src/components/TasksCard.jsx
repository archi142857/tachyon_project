// 할 일 3개(왼쪽 위). 순서와 몰린 주 경고는 서버(/api/briefing/rank)가 준다. 체크하면 끝, 제목을 누르면 고치기.
// 전체 목록은 햄버거 메뉴 안에 있다.
import { minutesLabel, readyLabel, slackLabel } from '../tasks.js';
import { dueLabel } from '../time.js';

export function TaskRow({ task, now, onDone, onEdit }) {
  const ready = readyLabel(task);
  const minutes = minutesLabel(task.minutes);
  const slack = slackLabel(task.slack_days);
  return (
    <div className="task">
      <input type="checkbox" aria-label={`${task.title} 끝`} checked={!!task.done} onChange={() => onDone(task)} />
      <span className="body">
        <button type="button" className="title" onClick={() => onEdit(task)}>
          {task.title}
        </button>
        <span className="meta num">
          {dueLabel(task.due, now)}
          {minutes && <span className="min"> · {minutes}</span>}
          {slack && <span className={task.slack_days < 0 ? 'min short' : 'min'}> · {slack}</span>}
          {ready && <span> · {ready}</span>}
        </span>
      </span>
    </div>
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
