// 대시보드(시안 A, 손그림 2): 할 일 3개 · 메모(나와의 채팅) · 주간 달력 · 아래 긴 메모 칸.
// 일정처럼 보이는 메모를 보내면 메모 옆에 '이대로 저장할까요?' 팝업이 뜬다. 나머지 기능은 햄버거 메뉴.
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import { dayLegs, loadCampus } from '../campus.js';
import CalendarSheet from '../components/CalendarSheet.jsx';
import DeleteAccount from '../components/DeleteAccount.jsx';
import Composer from '../components/Composer.jsx';
import DoneSheet from '../components/DoneSheet.jsx';
import { EventEditSheet, TaskEditSheet } from '../components/EditSheets.jsx';
import EtlSheet from '../components/EtlSheet.jsx';
import FeedbackSheet from '../components/FeedbackSheet.jsx';
import InstallSheet from '../components/InstallSheet.jsx';
import MemoCard from '../components/MemoCard.jsx';
import MemoPopup from '../components/MemoPopup.jsx';
import Sheet from '../components/Sheet.jsx';
import Snackbar from '../components/Snackbar.jsx';
import TasksCard, { TaskRow } from '../components/TasksCard.jsx';
import ThemeSheet from '../components/ThemeSheet.jsx';
import TodayView from '../components/TodayView.jsx';
import TopBar from '../components/TopBar.jsx';
import WeekCalendar, { PAGES } from '../components/WeekCalendar.jsx';
import { WEEKDAYS, addDays, dayIndex, dayStart, kst } from '../time.js';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// 열린 창을 가리키는 짧은 이름(알림 막대가 그 창 안으로 옮겨 갈 때 쓴다)
const sheetKey = (sheet) => (!sheet ? '' : typeof sheet === 'string' ? sheet : sheet.event ? `event-${sheet.event.id}` : `task-${sheet.task.id}`);

// 이미 홈 화면 앱이거나 Capacitor 앱이면 '홈 화면에 추가'를 숨긴다
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || !!window.Capacitor?.isNativePlatform?.();

export default function Dashboard({ example, installPrompt, onOpenSetup, onLogout, onDeleted }) {
  const now = useNow();
  // 주간 달력은 오늘부터 7일(오늘이 늘 맨 앞). 다음 장은 그다음 7일. 자정이 지나면 저절로 하루 밀린다.
  const today = dayStart(now).toISOString();
  const [page, setPage] = useState(0);
  const [view, setView] = useState('today'); // 'today' = 오늘 화면(하루 고리), 'week' = 주간 달력
  const start = addDays(today, page * 7).toISOString();

  const [events, setEvents] = useState([]);
  const [rank, setRank] = useState({ tasks: [], warning: null });
  const [memos, setMemos] = useState([]);
  const [popup, setPopup] = useState(null); // { memoId, popup }
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'tasks' | 'done' | 'feedback' | 'install' | 'calendar' | 'etl' | 'theme' | { event } | { task }
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

  // 수업 사이 동선(TT Wizard 걷는 시간): 장소가 있는 일정이 보이면 캠퍼스 표를 한 번 받아 둔다
  const [campus, setCampus] = useState(null);
  const hasPlace = events.some((e) => e.place);
  useEffect(() => {
    if (!campus && hasPlace) loadCampus().then(setCampus, () => {});
  }, [campus, hasPlace]);
  const legs = useMemo(() => dayLegs(events, campus), [events, campus]);

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

  async function savePopup(fields, changeId, weekly) {
    setBusy(true);
    try {
      if (fields.kind === 'task') {
        // 할 일 팝업 → 할 일 목록에 바로(걸리는 시간은 밤 정리가 채운다)
        const { task } = await api.savePopup(popup.memoId, fields, popup.popup);
        setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, task_id: task.id } : x)));
        setPopup(null);
        loadRank();
        setSnack({ text: `‘${task.title}’ 할 일에 넣었어요` });
        return;
      }
      const { event, repeat } = await api.savePopup(popup.memoId, fields, popup.popup, changeId, weekly);
      if (repeat) setSnack({ text: `매주 같은 요일로 ${repeat}번 넣었어요` });
      setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, event_id: event.id } : x)));
      setPopup(null);
      const shown = api.normalizeEvent(event);
      const weeksAhead = Math.floor((Date.parse(shown.start) - Date.parse(today)) / (7 * 24 * 3600 * 1000));
      if (changeId) setEvents((list) => list.filter((e) => e.id !== changeId)); // 옮긴 옛 일정은 바로 빠진다
      if (weeksAhead >= 0 && weeksAhead < PAGES && weeksAhead !== page) {
        setPage(weeksAhead);
        setView('week'); // 다른 주에 넣은 일정은 주간 달력에서 보여 준다
      } else {
        if (weeksAhead === page) setEvents((list) => [...list.filter((e) => e.id !== shown.id), shown]); // 바로 보이고, 서버 목록으로 다시 맞춘다
        loadWeek();
      }
    } catch {
      setSnack({ text: '저장하지 못했어요. 다시 해 주세요' });
    } finally {
      setBusy(false);
    }
  }

  function cancelPopup() {
    api.cancelPopup(popup.memoId, popup.popup.kind).catch(() => {});
    if (popup.popup.kind === 'task') setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1 } : x)));
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

  // 고치기·지우기: 실패하면 오류를 던져서 고치는 창 안에 보이게 한다(창이 맨 위라 스낵바는 가려진다)
  async function saveEvent(id, fields) {
    await api.updateEvent(id, fields);
    setSheet(null);
    loadWeek();
  }

  async function saveTask(id, fields) {
    await api.updateTask(id, fields);
    setSheet(null);
    loadRank();
  }

  /* 지우기(메모·시간표에서 온 것만) */
  async function deleteEvent(event) {
    await api.deleteEvent(event.id);
    setSheet(null);
    setEvents((list) => list.filter((e) => e.id !== event.id));
    setMemos((m) => m.map((x) => (x.event_id === event.id ? { ...x, event_id: null } : x)));
    loadWeek();
    setSnack({ text: `‘${event.title}’ 지웠어요` });
  }

  async function deleteTask(task) {
    await api.deleteTask(task.id);
    setSheet(null);
    setRank((r) => ({ ...r, tasks: r.tasks.filter((t) => t.id !== task.id) }));
    setMemos((m) => m.map((x) => (x.task_id === task.id ? { ...x, task_id: null } : x)));
    loadRank();
    setSnack({ text: `‘${task.title}’ 지웠어요` });
  }

  const openTasks = rank.tasks.filter((t) => !t.done);
  const activeMemo = popup?.memoId;
  const date = kst(now);
  const memoWrap = (
    <div className="memo-wrap">
      <MemoCard memos={memos} now={now} activeId={activeMemo} waiting={waiting} />
      {popup && <MemoPopup key={popup.memoId} popup={popup.popup} busy={busy} onSave={savePopup} onCancel={cancelPopup} />}
    </div>
  );

  return (
    <>
      <TopBar example={example} onFeedback={() => setSheet('feedback')} onMenu={() => setSheet('menu')} />
      <div className="today-head">
        <span className="date num">
          {date.m}월 {date.d}일 {WEEKDAYS[date.wd]}요일
        </span>
        <span className="grow" />
        <div className="segmented" role="group" aria-label="보기">
          <button type="button" aria-pressed={view === 'today'} onClick={() => (setView('today'), setPage(0))}>
            오늘
          </button>
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>
            주간
          </button>
        </div>
      </div>
      {view === 'today' ? (
        <main className="dash today">
          <TodayView
            today={today}
            events={events}
            tasks={openTasks.slice(0, 5)}
            total={openTasks.length}
            now={now}
            onDone={doneTask}
            onEvent={(event) => setSheet({ event })}
            onTask={(task) => setSheet({ task })}
            onAll={() => setSheet('tasks')}
            onWeek={() => setView('week')}
          />
          {memoWrap}
        </main>
      ) : (
        <main className="dash">
          <TasksCard tasks={openTasks.slice(0, 3)} warning={rank.warning} now={now} onDone={doneTask} onEdit={(task) => setSheet({ task })} />
          {memoWrap}
          <WeekCalendar
            start={start}
            events={events}
            tasks={openTasks.filter((t) => dayIndex(start, t.due) >= 0)}
            now={now}
            page={page}
            onPage={goPage}
            onEvent={(event) => setSheet({ event })}
            onTask={(task) => setSheet({ task })}
            legs={legs}
          />
        </main>
      )}
      <Composer onSend={sendMemo} />

      {sheet === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button type="button" onClick={() => setSheet('tasks')}>
              할 일 전체 <span className="tag num">{openTasks.length}</span>
            </button>
            <button type="button" onClick={() => setSheet('done')}>
              끝낸 일
            </button>
            <button type="button" onClick={onOpenSetup}>
              캘린더 연결·학과
            </button>
            <button type="button" onClick={() => setSheet('etl')}>
              eTL 연결·강의자료
            </button>
            <button type="button" onClick={() => setSheet('calendar')}>
              폰 달력에서 보기
            </button>
            {!standalone() && (
              <button type="button" onClick={() => setSheet('install')}>
                홈 화면에 추가
              </button>
            )}
            <button type="button" onClick={() => setSheet('theme')}>
              테마
            </button>
            <button type="button" onClick={() => setSheet('feedback')}>
              의견 보내기
            </button>
            <button type="button" onClick={onLogout}>
              {example ? '예시 끝내기' : '로그아웃'}
            </button>
            <button type="button" className="danger" onClick={() => setSheet('delete')}>
              계정 지우기
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
      {sheet === 'done' && (
        <DoneSheet
          now={now}
          onClose={() => setSheet(null)}
          onUndone={(task) => {
            loadRank();
            setSnack({ text: `‘${task.title}’ 할 일로 되돌렸어요` });
          }}
        />
      )}
      {sheet === 'feedback' && <FeedbackSheet screen="대시보드" onClose={() => setSheet(null)} onSent={(text) => setSnack({ text })} />}
      {sheet === 'install' && <InstallSheet prompt={installPrompt} onClose={() => setSheet(null)} />}
      {sheet === 'calendar' && <CalendarSheet onClose={() => setSheet(null)} />}
      {sheet === 'theme' && <ThemeSheet onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <Sheet title="계정 지우기" onClose={() => setSheet(null)}>
          <DeleteAccount example={example} onDeleted={onDeleted} />
        </Sheet>
      )}
      {sheet === 'etl' && (
        <EtlSheet
          onClose={() => setSheet(null)}
          onChanged={() => {
            loadWeek();
            loadRank();
          }}
        />
      )}
      {sheet?.event && (
        <EventEditSheet
          event={sheet.event}
          leg={legs.get(sheet.event.id)}
          campus={campus}
          events={events}
          onClose={() => setSheet(null)}
          onSave={(fields) => saveEvent(sheet.event.id, fields)}
          onDelete={() => deleteEvent(sheet.event)}
        />
      )}
      {sheet?.task && <TaskEditSheet task={sheet.task} onClose={() => setSheet(null)} onSave={(fields) => saveTask(sheet.task.id, fields)} onDelete={() => deleteTask(sheet.task)} />}
      {snack && <Snackbar {...snack} layer={sheetKey(sheet)} onDone={closeSnack} />}
    </>
  );
}
