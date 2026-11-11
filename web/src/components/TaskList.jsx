// '할 일' 쪽(11-11 사람 피드백): 마감이 가까운 무리별로(지남 · 오늘 · 내일 · 이번 주 · 나중 · 마감 없음), 줄마다 마감 날짜·시각.
// 넓은 화면 오른쪽 '나눠 둔 몫'은 밀도(density.js)가 할 일을 오늘부터 며칠에 고르게 나눈 것. 폰은 맨 위 한 줄만.
import { hoursText } from '../density.js';
import { WEEKDAYS, daysUntil, kst } from '../time.js';
import DensityRing from './DensityRing.jsx';
import { TaskRow } from './TasksCard.jsx';

const GROUPS = [
  ['late', '마감 지남'],
  ['today', '오늘'],
  ['tomorrow', '내일'],
  ['week', '이번 주'],
  ['later', '나중'],
  ['none', '마감 없음'],
];

function groupOf(task, now) {
  if (!task.due) return 'none';
  if (Date.parse(task.due) < new Date(now).getTime()) return 'late';
  const d = daysUntil(task.due, now);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return 'week';
  return 'later';
}

// plan = 오늘부터 며칠의 밀도(density.js planDensity 앞부분)
export default function TaskList({ tasks, now, plan, onDone, onEdit, onDoneList }) {
  const groups = GROUPS.map(([key, label]) => [key, label, tasks.filter((t) => groupOf(t, now) === key)]).filter(([, , list]) => list.length);
  const today = plan[0];
  const todayMin = today ? today.taskMin + today.over : 0;
  return (
    <>
      <section className="card task-list" aria-label="할 일 전체">
        <div className="tasks-head">
          <h2 className="card-title">할 일</h2>
          <span className="tag num">{tasks.length}</span>
          <span className="grow" />
          <button type="button" className="btn-text quiet" onClick={onDoneList}>
            끝낸 일
          </button>
        </div>
        {today && todayMin > 0 && (
          <p className="share-line num">
            오늘 할 몫 {hoursText(todayMin)} · {today.items.length}개 (마감 전 날들에 고르게 나눈 것)
          </p>
        )}
        <div className="list-scroll">
          {tasks.length === 0 && <p className="empty">남은 할 일이 없어요</p>}
          {groups.map(([key, label, list]) => (
            <div key={key} className={`task-group ${key}`}>
              <h3 className="group-title">
                {label} <span className="num">{list.length}</span>
              </h3>
              {list.map((task) => (
                <TaskRow key={task.id} task={task} now={now} onDone={onDone} onEdit={onEdit} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card share" aria-label="날마다 나눠 둔 몫">
        <div className="tasks-head">
          <h2 className="card-title">나눠 둔 몫</h2>
        </div>
        <p className="hint">할 일의 걸리는 시간을 마감 전 날들에 고르게 나눴어요. 하루가 너무 차지 않게 맞춘 것이라 저장하지 않아요.</p>
        <div className="list-scroll">
          {plan.slice(0, 7).map((d) => {
            const p = kst(d.date);
            return (
              <div key={d.key} className="share-day">
                <DensityRing day={d} size={30} />
                <div className="share-body">
                  <p className="share-date num">
                    {d.today ? '오늘' : `${p.m}/${p.d}(${WEEKDAYS[p.wd]})`} · 일정 {hoursText(d.eventMin)}
                    {d.taskMin + d.over > 0 && ` · 할 일 ${hoursText(d.taskMin + d.over)}`}
                    {d.over > 0 && <span className="late-due"> · 빈 시간 모자람</span>}
                  </p>
                  {d.items.map(({ task, min }) => (
                    <button key={task.id} type="button" className="share-item" onClick={() => onEdit(task)}>
                      <span className="num">{hoursText(min)}</span> {task.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
