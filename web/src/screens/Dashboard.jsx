// 대시보드(시안 A, 손그림 2): 할 일 3개 · 메모(나와의 채팅) · 주간 달력 · 아래 긴 메모 칸.
// 일정처럼 보이는 메모를 보내면 메모 옆에 '이대로 저장할까요?' 팝업이 뜬다. 나머지 기능은 햄버거 메뉴.
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import Composer from '../components/Composer.jsx';
import { EventEditSheet, TaskEditSheet } from '../components/EditSheets.jsx';
import FeedbackSheet from '../components/FeedbackSheet.jsx';
import InstallSheet from '../components/InstallSheet.jsx';
import MemoCard from '../components/MemoCard.jsx';
import MemoPopup from '../components/MemoPopup.jsx';
import Sheet from '../components/Sheet.jsx';
import Snackbar from '../components/Snackbar.jsx';
import TasksCard, { TaskRow } from '../components/TasksCard.jsx';
import TopBar from '../components/TopBar.jsx';
import WeekCalendar, { PAGES } from '../components/WeekCalendar.jsx';
import { addDays, dayIndex, weekStart } from '../time.js';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// 이미 홈 화면 앱이거나 Capacitor 앱이면 '홈 화면에 추가'를 숨긴다
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || !!window.Capacitor?.isNativePlatform?.();

export default function Dashboard({ example, installPrompt, onOpenSetup, onLogout }) {
  const now = useNow();
  const thisWeek = weekStart(now).toISOString();
  const [page, setPage] = useState(0);
  const start = addDays(thisWeek, page * 7).toISOString();

  const [events, setEvents] = useState([]);
  const [rank, setRank] = useState({ tasks: [], warning: null });
  const [memos, setMemos] = useState([]);
  const [popup, setPopup] = useState(null); // { memoId, popup }
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'tasks' | 'feedback' | 'install' | { event } | { task }
  const [snack, setSnack] = useState(null);

  const loadWeek = useCallback(
    () =>
      api
        .getWeekEvents(start)
        .then((r) => setEvents(r.events))
        .catch(() => setSnack({ text: '일정을 불러오지 못했어요' })),
    [start],
  );
  const loadRank = useCallback(
    () =>
      api
        .getTasks()
        .then(setRank)
        .catch(() => setSnack({ text: '할 일을 불러오지 못했어요' })),
    [],
  );
  useEffect(() => {
    loadWeek();
  }, [loadWeek]);
  useEffect(() => {
    loadRank();
  }, [loadRank]);
  useEffect(() => {
    api
      .listMemos()
      .then((r) => setMemos(r.memos))
      .catch(() => setSnack({ text: '메모를 불러오지 못했어요' }));
  }, []);

  const closeSnack = useCallback(() => setSnack(null), []);
  const goPage = (p) => setPage(Math.max(0, Math.min(PAGES - 1, p)));

  /* 메모 → 즉시 팝업 */
  async function sendMemo(text) {
    const temp = { id: `tmp-${Date.now()}`, text, created_at: new Date().toISOString(), handled: 0, event_id: null };
    setMemos((m) => [...m, temp]);
    setWaiting(true);
    try {
      const { memo, popup: found } = await api.sendMemo(text);
      setMemos((m) => m.map((x) => (x.id === temp.id ? memo : x)));
      setPopup(found ? { memoId: memo.id, popup: found } : null);
    } catch {
      setMemos((m) => m.filter((x) => x.id !== temp.id));
      setSnack({ text: '메모를 보내지 못했어요. 다시 해 주세요' });
    } finally {
      setWaiting(false);
    }
  }

  async function savePopup(fields) {
    setBusy(true);
    try {
      const { event } = await api.savePopup(popup.memoId, fields, popup.popup);
      setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, event_id: event.id } : x)));
      setPopup(null);
      const start = api.normalizeEvent(event).start;
      const weeksAhead = Math.floor((Date.parse(start) - Date.parse(thisWeek)) / (7 * 24 * 3600 * 1000));
      if (weeksAhead >= 0 && weeksAhead < PAGES && weeksAhead !== page) setPage(weeksAhead);
      else loadWeek();
    } catch {
      setSnack({ text: '저장하지 못했어요. 다시 해 주세요' });
    } finally {
      setBusy(false);
    }
  }

  function cancelPopup() {
    api.cancelPopup(popup.memoId).catch(() => {});
    setPopup(null);
  }

  useEffect(() => {
    if (!popup) return undefined;
    const onKey = (e) => e.key === 'Escape' && !sheet && cancelPopup();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* 할 일 체크 → 되돌리기 */
  async function doneTask(task) {
    setRank((r) => ({ ...r, tasks: r.tasks.filter((t) => t.id !== task.id) }));
    try {
      await api.setTaskDone(task.id, true);
      loadRank(); // 체크하면 여유 순서가 바뀐다
      setSnack({
        text: `‘${task.title}’ 끝`,
        actionLabel: '되돌리기',
        onAction: () => api.setTaskDone(task.id, false).then(loadRank),
      });
    } catch {
      loadRank();
      setSnack({ text: '체크하지 못했어요. 다시 해 주세요' });
    }
  }

  async function saveEvent(id, fields) {
    try {
      await api.updateEvent(id, fields);
      setSheet(null);
      loadWeek();
    } catch (err) {
      setSnack({ text: err.message || '고치지 못했어요. 다시 해 주세요' });
    }
  }

  async function saveTask(id, fields) {
    try {
      await api.updateTask(id, fields);
      setSheet(null);
      loadRank();
    } catch (err) {
      setSnack({ text: err.message || '고치지 못했어요. 다시 해 주세요' });
    }
  }

  const openTasks = rank.tasks.filter((t) => !t.done);
  const activeMemo = popup?.memoId;

  return (
    <>
      <TopBar example={example} onFeedback={() => setSheet('feedback')} onMenu={() => setSheet('menu')} />
      <main className="dash">
        <TasksCard tasks={openTasks.slice(0, 3)} warning={rank.warning} now={now} onDone={doneTask} onEdit={(task) => setSheet({ task })} />
        <div className="memo-wrap">
          <MemoCard memos={memos} now={now} activeId={activeMemo} waiting={waiting} />
          {popup && <MemoPopup key={popup.memoId} popup={popup.popup} busy={busy} onSave={savePopup} onCancel={cancelPopup} />}
        </div>
        <WeekCalendar
          start={start}
          events={events}
          tasks={openTasks.filter((t) => dayIndex(start, t.due) >= 0)}
          now={now}
          page={page}
          onPage={goPage}
          onEvent={(event) => setSheet({ event })}
          onTask={(task) => setSheet({ task })}
        />
      </main>
      <Composer onSend={sendMemo} />

      {sheet === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button type="button" onClick={() => setSheet('tasks')}>
              할 일 전체 <span className="tag num">{openTasks.length}</span>
            </button>
            <button type="button" onClick={onOpenSetup}>
              캘린더 주소·학과
            </button>
            {!standalone() && (
              <button type="button" onClick={() => setSheet('install')}>
                홈 화면에 추가
              </button>
            )}
            <button type="button" onClick={() => setSheet('feedback')}>
              의견 보내기
            </button>
            <button type="button" onClick={onLogout}>
              {example ? '예시 끝내기' : '로그아웃'}
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'tasks' && (
        <Sheet title="할 일 전체" onClose={() => setSheet(null)}>
          <div>
            {openTasks.length === 0 && <p className="hint">남은 할 일이 없어요</p>}
            {openTasks.map((task) => (
              <TaskRow key={task.id} task={task} now={now} onDone={doneTask} onEdit={(t) => setSheet({ task: t })} />
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'feedback' && <FeedbackSheet screen="대시보드" onClose={() => setSheet(null)} onSent={(text) => setSnack({ text })} />}
      {sheet === 'install' && <InstallSheet prompt={installPrompt} onClose={() => setSheet(null)} />}
      {sheet?.event && <EventEditSheet event={sheet.event} onClose={() => setSheet(null)} onSave={(fields) => saveEvent(sheet.event.id, fields)} />}
      {sheet?.task && <TaskEditSheet task={sheet.task} onClose={() => setSheet(null)} onSave={(fields) => saveTask(sheet.task.id, fields)} />}
      {snack && <Snackbar {...snack} onDone={closeSnack} />}
    </>
  );
}
