// 대시보드 틀(11-11 사람 피드백 → 컨셉): 모든 기기에서 화면을 꽉 채우고, 전체 화면은 스크롤하지 않고 칸 안에서만 스크롤한다.
// 넓은 화면(900px부터) = 왼쪽 메뉴(오늘 · 달력 · 할 일 · 메모) + 오른쪽 내용, 폰 = 위 막대 + 작은 탭 + 한 번에 한 칸(덜 복잡하게).
// 모양은 dhsrua555 시연 9판(100dvh 앱 틀)을 차분한 종이 색으로. 메모 칸은 늘 맨 아래.
// 일정처럼 보이는 메모를 보내면 메모 칸 바로 위에 '이대로 저장할까요?' 팝업이 뜬다. 설정은 햄버거 메뉴.
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import { dayLegs, loadCampus } from '../campus.js';
import CalendarSheet from '../components/CalendarSheet.jsx';
import Composer from '../components/Composer.jsx';
import DeleteAccount from '../components/DeleteAccount.jsx';
import DoneSheet from '../components/DoneSheet.jsx';
import { EventEditSheet, TaskEditSheet } from '../components/EditSheets.jsx';
import EtlSheet from '../components/EtlSheet.jsx';
import FeedbackSheet from '../components/FeedbackSheet.jsx';
import Icon from '../components/Icon.jsx';
import InstallSheet from '../components/InstallSheet.jsx';
import JoinSheet from '../components/JoinSheet.jsx';
import Logo from '../components/Logo.jsx';
import MemoCard from '../components/MemoCard.jsx';
import MemoPopup from '../components/MemoPopup.jsx';
import MonthCalendar from '../components/MonthCalendar.jsx';
import Sheet from '../components/Sheet.jsx';
import Snackbar from '../components/Snackbar.jsx';
import TaskList from '../components/TaskList.jsx';
import ThemeSheet from '../components/ThemeSheet.jsx';
import TogetherPage from '../components/TogetherPage.jsx';
import OursMain from '../ours/OursMain.jsx';
import { useSkin } from '../ours/skin.jsx';
import TodayView from '../components/TodayView.jsx';
import TtwSheet from '../components/TtwSheet.jsx';
import WeekCalendar from '../components/WeekCalendar.jsx';
import { PLAN_DAYS, dateKey, eventOnlyDay, fromServerPlan, planDensity } from '../density.js';
import { WEEKDAYS, addDays, dayStart, kst, monthGrid, sameDay, shiftMonth, shortDate } from '../time.js';

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

const PAGES = [
  ['today', '오늘'],
  ['cal', '달력'],
  ['tasks', '할 일'],
  ['memo', '메모'],
  ['together', '같이'],
];
const PANES = [
  ['ring', '하루'],
  ['day', '일정'],
  ['tasks', '할 일'],
];

// 두 목록을 id로 합친다(같은 일정이 오늘부터 6주 목록과 보이는 달력 목록에 같이 있을 수 있다)
function mergeEvents(a, b) {
  const seen = new Map();
  for (const ev of [...a, ...b]) seen.set(ev.id, ev);
  return [...seen.values()];
}

function Segmented({ label, items, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ example, installPrompt, ttwLink, joinCode, onOpenSetup, onLogout, onDeleted }) {
  const now = useNow();
  const today = dayStart(now).toISOString(); // 자정이 지나면 저절로 하루 밀린다
  const skin = useSkin();
  const [page, setPage] = useState('today');
  const [pane, setPane] = useState('ring'); // 폰의 오늘 쪽에서 보이는 한 칸
  const [join, setJoin] = useState(() => (joinCode && !example ? joinCode : null)); // 초대 링크(?join=)로 들어왔으면 받기 창
  const [togetherKey, setTogetherKey] = useState(0); // 받은 뒤 '같이' 쪽을 새로 불러오게
  const [calMode, setCalMode] = useState('week');
  const [weekFrom, setWeekFrom] = useState(today); // 주간 달력 첫 칸(처음엔 오늘)
  const [month, setMonth] = useState(() => ({ y: kst(now).y, m: kst(now).m }));

  const [planEvents, setPlanEvents] = useState([]); // 오늘부터 6주: 오늘 화면 · 밀도
  const [calEvents, setCalEvents] = useState([]); // 달력에 보이는 기간
  const [rank, setRank] = useState({ tasks: [], warning: null });
  const [memos, setMemos] = useState([]);
  const [popup, setPopup] = useState(null); // { memoId, popup }
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'done' | 'feedback' | 'install' | 'calendar' | 'etl' | 'theme' | 'delete' | { event } | { task }
  const [snack, setSnack] = useState(null);
  // TT Wizard의 'Tachyon으로 보내기'로 들어왔으면(App.jsx가 받아 둔 #ttw=…) 그 시간표 창을 바로 연다(11-11 컨셉)
  const [ttwFrom] = useState(ttwLink || null);
  useEffect(() => {
    if (ttwLink) setSheet('ttw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전체 화면이 스크롤되지 않게(칸 안에서만). 로그인·첫 설정 화면은 그대로 스크롤된다
  useEffect(() => {
    document.documentElement.classList.add('locked');
    return () => document.documentElement.classList.remove('locked');
  }, []);

  // 자정이 지나 오늘이 바뀌면 주간 달력이 오늘에 있던 경우 함께 민다
  const [lastToday, setLastToday] = useState(today);
  if (lastToday !== today) {
    setLastToday(today);
    if (weekFrom === lastToday) setWeekFrom(today);
  }

  const calRange = useMemo(() => (calMode === 'week' ? [weekFrom, 7] : [monthGrid(month.y, month.m)[0].toISOString(), 42]), [calMode, weekFrom, month]);

  const loadPlan = useCallback(
    () =>
      api
        .getEvents(today, PLAN_DAYS)
        .then((r) => setPlanEvents(r.events))
        .catch(() => setSnack({ text: '일정을 불러오지 못했어요' })),
    [today],
  );
  const loadCal = useCallback(
    () =>
      api
        .getEvents(calRange[0], calRange[1])
        .then((r) => setCalEvents(r.events))
        .catch(() => setSnack({ text: '달력을 불러오지 못했어요' })),
    [calRange],
  );
  const loadEvents = useCallback(() => {
    loadPlan();
    loadCal();
  }, [loadPlan, loadCal]);
  const loadRank = useCallback(
    () =>
      api
        .getTasks()
        .then(setRank)
        .catch(() => setSnack({ text: '할 일을 불러오지 못했어요' })),
    [],
  );
  useEffect(() => {
    loadPlan();
  }, [loadPlan]);
  useEffect(() => {
    loadCal();
  }, [loadCal]);
  useEffect(() => {
    loadRank();
  }, [loadRank]);
  useEffect(() => {
    api
      .listMemos()
      .then((r) => setMemos(r.memos))
      .catch(() => setSnack({ text: '메모를 불러오지 못했어요' }));
  }, []);

  const allEvents = useMemo(() => mergeEvents(planEvents, calEvents), [planEvents, calEvents]);

  // 수업 사이 동선(TT Wizard 걷는 시간): 장소가 있는 일정이 보이면 캠퍼스 표를 한 번 받아 둔다
  const [campus, setCampus] = useState(null);
  const hasPlace = allEvents.some((e) => e.place);
  useEffect(() => {
    if (!campus && hasPlace) loadCampus().then(setCampus, () => {});
  }, [campus, hasPlace]);
  const legs = useMemo(() => dayLegs(allEvents, campus), [allEvents, campus]);

  const openTasks = useMemo(() => rank.tasks.filter((t) => !t.done), [rank.tasks]);

  // 날마다 밀도(오늘부터 6주). 서버 셈(AI 4_night planDays — 할 일 순서·경고와 같은 셈)을 그리고, 예시 모드나 못 받았을 때만 화면 셈.
  // 할 일·일정이 바뀌면 다시 받는다. 지난날·6주 밖은 일정만
  const [daily, setDaily] = useState(null);
  useEffect(() => {
    let live = true;
    api
      .getDailyPlan(PLAN_DAYS)
      .then((res) => live && setDaily(res))
      .catch(() => live && setDaily(null));
    return () => {
      live = false;
    };
  }, [rank.tasks, planEvents]);
  const plan = useMemo(
    () => (daily?.days?.length ? fromServerPlan(daily, openTasks) : planDensity({ events: planEvents, tasks: openTasks, now })),
    [daily, planEvents, openTasks, now],
  );
  const densityOf = useMemo(() => {
    const byKey = new Map(plan.map((d) => [d.key, d]));
    const start = dayStart(now).getTime();
    return (date) => byKey.get(dateKey(date)) || eventOnlyDay(allEvents, date, new Date(date).getTime() < start);
  }, [plan, allEvents, now]);

  const closeSnack = useCallback(() => setSnack(null), []);

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

  function showWeekOf(date) {
    setPage('cal');
    setCalMode('week');
    setWeekFrom(dayStart(date).toISOString());
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
      setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, event_id: event.id } : x)));
      setPopup(null);
      const shown = api.normalizeEvent(event);
      if (changeId) {
        setPlanEvents((list) => list.filter((e) => e.id !== changeId)); // 옮긴 옛 일정은 바로 빠진다
        setCalEvents((list) => list.filter((e) => e.id !== changeId));
      }
      if (sameDay(shown.start, now)) setPlanEvents((list) => [...list.filter((e) => e.id !== shown.id), shown]); // 바로 보이고, 서버 목록으로 다시 맞춘다
      loadEvents();
      if (repeat) setSnack({ text: `매주 같은 요일로 ${repeat}번 넣었어요` });
      else if (!sameDay(shown.start, now)) setSnack({ text: `${shortDate(shown.start)}에 넣었어요`, actionLabel: '달력에서 보기', onAction: () => showWeekOf(shown.start) });
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
    loadEvents();
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
    setPlanEvents((list) => list.filter((e) => e.id !== event.id));
    setCalEvents((list) => list.filter((e) => e.id !== event.id));
    setMemos((m) => m.map((x) => (x.event_id === event.id ? { ...x, event_id: null } : x)));
    loadEvents();
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

  const date = kst(now);
  const dateText = `${date.m}월 ${date.d}일 ${WEEKDAYS[date.wd]}요일`;
  const memoCard = <MemoCard memos={memos} now={now} activeId={popup?.memoId} waiting={waiting} />;

  // 쪽마다 머리 줄에 붙는 고르기
  const controls =
    page === 'today' ? (
      <span className="only-narrow">
        <Segmented label="오늘 보기" items={PANES} value={pane} onChange={setPane} />
      </span>
    ) : page === 'cal' ? (
      <Segmented
        label="달력 보기"
        items={[
          ['week', '주'],
          ['month', '월'],
        ]}
        value={calMode}
        onChange={setCalMode}
      />
    ) : null;

  // '입자' · '종이' 테마: 같은 자료와 함수로 시연 9판의 화면(ours/)을 그린다. 아래 창들은 같이 쓴다.
  const ours = { page, setPage, calMode, setCalMode, today, now, date, example, planEvents, calEvents, openTasks, memos, waiting, popup, busy, weekFrom, setWeekFrom, month, setMonth, densityOf, togetherKey, doneTask, sendMemo, savePopup, cancelPopup, showWeekOf, setSheet, setSnack };

  return (
    <div className="shell">
      {skin ? <OursMain app={ours} /> : (<>
      <aside className="side">
        <div className="side-brand">
          <h1 className="wordmark">
            <Logo height={26} />
          </h1>
          {example && <span className="tag">예시 자료</span>}
        </div>
        <nav className="side-nav" aria-label="쪽">
          {PAGES.map(([key, label]) => (
            <button key={key} type="button" aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}>
              {label}
              {key === 'tasks' && openTasks.length > 0 && <span className="count num">{openTasks.length}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1 className="wordmark only-narrow">
            <Logo height={24} />
          </h1>
          {example && <span className="tag only-narrow">예시 자료</span>}
          <span className="date only-wide num">{dateText}</span>
          <span className="only-wide">{controls}</span>
          <span className="grow" />
          <button type="button" className="btn-text" onClick={() => setSheet('feedback')}>
            의견
          </button>
          <button type="button" className="icon-btn" aria-label="메뉴" onClick={() => setSheet('menu')}>
            <Icon name="menu" />
          </button>
        </header>
        <nav className="tabs only-narrow" aria-label="쪽">
          {PAGES.map(([key, label]) => (
            <button key={key} type="button" aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}>
              {label}
            </button>
          ))}
        </nav>
        {(page === 'today' || page === 'cal') && (
          <section className="subbar only-narrow" aria-label="보기 고르기">
            <span className="date num">{page === 'today' ? dateText : ''}</span>
            <span className="grow" />
            {controls}
          </section>
        )}

        <main className={`page page-${page}`} data-pane={pane}>
          {page === 'today' && (
            <div className="today-grid">
              <TodayView
                today={today}
                events={planEvents}
                tasks={openTasks.slice(0, 6)}
                total={openTasks.length}
                now={now}
                onDone={doneTask}
                onEvent={(event) => setSheet({ event })}
                onTask={(task) => setSheet({ task })}
                onAll={() => setPage('tasks')}
                onWeek={() => showWeekOf(today)}
              />
              <div className="today-memo only-xl">{memoCard}</div>
            </div>
          )}
          {page === 'cal' &&
            (calMode === 'week' ? (
              <WeekCalendar
                start={weekFrom}
                events={calEvents}
                tasks={openTasks}
                now={now}
                density={densityOf}
                isCurrent={weekFrom === today}
                onPrev={() => setWeekFrom(addDays(weekFrom, -7).toISOString())}
                onNext={() => setWeekFrom(addDays(weekFrom, 7).toISOString())}
                onToday={() => setWeekFrom(today)}
                onEvent={(event) => setSheet({ event })}
                onTask={(task) => setSheet({ task })}
                legs={legs}
              />
            ) : (
              <MonthCalendar
                anchor={month}
                events={calEvents}
                tasks={openTasks}
                now={now}
                density={densityOf}
                onPrev={() => setMonth((m) => shiftMonth(m, -1))}
                onNext={() => setMonth((m) => shiftMonth(m, 1))}
                onToday={() => setMonth({ y: date.y, m: date.m })}
                onDay={(day) => showWeekOf(day)}
              />
            ))}
          {page === 'tasks' && (
            <div className="tasks-grid">
              <TaskList tasks={openTasks} now={now} plan={plan} onDone={doneTask} onEdit={(task) => setSheet({ task })} onDoneList={() => setSheet('done')} />
            </div>
          )}
          {page === 'memo' && <div className="memo-page">{memoCard}</div>}
          {page === 'together' && <TogetherPage key={togetherKey} example={example} now={now} onSnack={(text) => setSnack({ text })} />}
        </main>

        {popup && <MemoPopup key={popup.memoId} popup={popup.popup} busy={busy} onSave={savePopup} onCancel={cancelPopup} />}
        <Composer onSend={sendMemo} />
      </div>
      </>)}

      {join && (
        <JoinSheet
          code={join}
          onClose={() => setJoin(null)}
          onJoined={(text) => {
            setJoin(null);
            setTogetherKey((k) => k + 1);
            setPage('together');
            setSnack({ text });
          }}
        />
      )}
      {sheet === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button type="button" onClick={() => setSheet('done')}>
              끝낸 일
            </button>
            <button type="button" onClick={onOpenSetup}>
              캘린더 연결·학과
            </button>
            <button type="button" onClick={() => setSheet('etl')}>
              eTL 연결·강의자료
            </button>
            <button type="button" onClick={() => setSheet('ttw')}>
              TT Wizard 시간표
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
      {sheet === 'feedback' && <FeedbackSheet screen={`대시보드 · ${PAGES.find(([k]) => k === page)[1]}`} onClose={() => setSheet(null)} onSent={(text) => setSnack({ text })} />}
      {sheet === 'install' && <InstallSheet prompt={installPrompt} onClose={() => setSheet(null)} />}
      {sheet === 'calendar' && <CalendarSheet onClose={() => setSheet(null)} />}
      {sheet === 'ttw' && (
        <TtwSheet
          initialLink={ttwFrom}
          onClose={() => setSheet(null)}
          onSaved={(r) => {
            setSheet(null);
            loadEvents();
            setSnack({ text: `TT Wizard 시간표에서 수업 ${r.classes}개를 넣었어요(일정 ${r.saved}칸)` });
          }}
        />
      )}
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
            loadEvents();
            loadRank();
          }}
        />
      )}
      {sheet?.event && (
        <EventEditSheet
          event={sheet.event}
          leg={legs.get(sheet.event.id)}
          campus={campus}
          events={allEvents}
          onClose={() => setSheet(null)}
          onSave={(fields) => saveEvent(sheet.event.id, fields)}
          onDelete={() => deleteEvent(sheet.event)}
        />
      )}
      {sheet?.task && <TaskEditSheet task={sheet.task} onClose={() => setSheet(null)} onSave={(fields) => saveTask(sheet.task.id, fields)} onDelete={() => deleteTask(sheet.task)} />}
      {snack && <Snackbar {...snack} layer={sheetKey(sheet)} onDone={closeSnack} />}
    </div>
  );
}
