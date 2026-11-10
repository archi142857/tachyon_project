// 끝낸 일: 체크해서 사라진 할 일이 끝낸 날짜와 함께 남는 곳(메뉴 → 끝낸 일). 체크를 풀면 할 일로 돌아간다.
import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { dayLabel } from '../time.js';
import Sheet from './Sheet.jsx';

export default function DoneSheet({ now, onClose, onUndone }) {
  const [tasks, setTasks] = useState(null); // null = 불러오는 중
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getDoneTasks()
      .then((r) => setTasks(r.tasks))
      .catch(() => setError('끝낸 일을 불러오지 못했어요'));
  }, []);

  async function undo(task) {
    try {
      await api.setTaskDone(task.id, false);
      setTasks((list) => list.filter((t) => t.id !== task.id));
      onUndone(task);
    } catch {
      setError('되돌리지 못했어요. 다시 해 주세요');
    }
  }

  return (
    <Sheet title="끝낸 일" onClose={onClose}>
      <div>
        {error && <p className="error">{error}</p>}
        {tasks?.length === 0 && <p className="hint">아직 끝낸 일이 없어요</p>}
        {tasks?.length > 0 && <p className="hint">체크를 풀면 할 일로 돌아가요</p>}
        {tasks?.map((task) => (
          <div className="task done" key={task.id}>
            <input type="checkbox" aria-label={`${task.title} 되돌리기`} checked onChange={() => undo(task)} />
            <span className="body">
              <span className="title">{task.title}</span>
              <span className="meta num">{task.done_at ? `${dayLabel(task.done_at, now)} 끝냄` : '끝냄'}</span>
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
