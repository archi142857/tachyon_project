// 대시보드 틀(11-11 사람 피드백 → 컨셉): 모든 기기에서 화면을 꽉 채우고, 전체 화면은 스크롤하지 않고 칸 안에서만 스크롤한다.
// 넓은 화면(900px부터) = 왼쪽 메뉴(오늘 · 달력 · 할 일 · 메모) + 오른쪽 내용, 폰 = 위 막대 + 작은 탭 + 한 번에 한 칸(덜 복잡하게).
// 모양은 dhsrua555 시연 9판(100dvh 앱 틀). 색은 테마(바우하우스 · 입자 밤 · 입자 낮). 메모 칸은 늘 맨 아래.
// 일정처럼 보이는 메모를 보내면 메모 칸 바로 위에 '이대로 저장할까요?' 팝업이 뜬다. 설정은 햄버거 메뉴.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../api.js';
import { dayLegs, loadCampus } from '../campus.js';
import Composer from '../components/Composer.jsx';
import { FloatMemo, FloatPopup, activeWindow, canFloat, growFloat, openCenterWindow, shrinkFloat, useFloatWindow } from '../components/MemoFloat.jsx';
import { EventEditSheet, EventInfoSheet, TaskEditSheet } from '../components/EditSheets.jsx';
import { takeHashGift } from '../etlToken.js';
import InboxSheet from '../components/InboxSheet.jsx';
import GuideSheet, { guideSeen } from '../components/GuideSheet.jsx';
import Icon from '../components/Icon.jsx';
import JoinSheet from '../components/JoinSheet.jsx';
import Logo from '../components/Logo.jsx';
import MemoCard from '../components/MemoCard.jsx';
import MeSheet from '../components/MeSheet.jsx';
import MemoPopup from '../components/MemoPopup.jsx';
import TaskActSheet from '../components/TaskActSheet.jsx';
import { BACK, GCAL_BACK, NOTIFY_TAP, inApp, notifyState, planReminders, snoozeNotify, syncDevice, takeNotify, tick, turnDueSoon } from '../native.js';
import { askedPrefs, readPrefs } from '../prefs.js';
import { addFocus, arrange, fixTask, fixedOn, pinTask, planTask, plansFrom, snoozeTask } from '../taskLocal.js';
import { planLabel } from '../tasks.js';
import MonthCalendar from '../components/MonthCalendar.jsx';
import { ThemeBackdrop } from '../components/art/Backdrop.jsx'; // 그림 테마의 화면 뒤 그림(11-13 02:47)
import Sheet from '../components/Sheet.jsx';
import Snackbar from '../components/Snackbar.jsx';
import TaskList from '../components/TaskList.jsx';
import TodayView from '../components/TodayView.jsx';
import WidgetGrid from '../components/WidgetGrid.jsx';
import { DEFAULT_ORDER, FIRST, LAYOUTS, readLayout, swapOrder, writeLayout } from '../todayLayout.js';
import WeekCalendar, { calPad } from '../components/WeekCalendar.jsx';
import { useThemeName } from '../themeName.js';
import { PARTICLE, applyTheme } from '../themes.js';
import { PLAN_DAYS, dateKey, eventOnlyDay, fromServerPlan, planDensity } from '../density.js';
import { WEEKDAYS, addDays, dateInput, dayStart, hhmm, isoFromInputs, kst, monthGrid, sameDay, shiftMonth, shortDate, timeInput, toKstIso } from '../time.js';

// 가끔 여는 창 · 쪽은 열 때 받는다(11-21 — 첫 화면에 실리는 코드를 줄인다). 받는 동안은 아무것도 안 그린다(보통 한 장면 안)
function later(load) {
  const C = lazy(load);
  return function Later(props) {
    return (
      <Suspense fallback={null}>
        <C {...props} />
      </Suspense>
    );
  };
}
const CalendarSheet = later(() => import('../components/CalendarSheet.jsx'));
const AiSheet = later(() => import('../components/AiSheet.jsx'));
const DeleteAccount = later(() => import('../components/DeleteAccount.jsx'));
const DoneSheet = later(() => import('../components/DoneSheet.jsx'));
const EtlSheet = later(() => import('../components/EtlSheet.jsx'));
const FeedbackSheet = later(() => import('../components/FeedbackSheet.jsx'));
const InstallSheet = later(() => import('../components/InstallSheet.jsx'));
const ThemeSheet = later(() => import('../components/ThemeSheet.jsx'));
const TogetherPage = later(() => import('../components/TogetherPage.jsx'));
const ActivitiesPage = later(() => import('../components/ActivitiesPage.jsx'));
const TidySheet = later(() => import('../components/TidySheet.jsx'));
const TtwSheet = later(() => import('../components/TtwSheet.jsx'));

// 넓은 화면(900px부터)인가 — 오늘 쪽 위젯 칸은 넓은 화면에서만(폰은 지금 탭)
const WIDE = '(min-width: 900px)';
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// 열린 창을 가리키는 짧은 이름(알림 막대가 그 창 안으로 옮겨 갈 때 쓴다)
const sheetKey = (sheet) => (!sheet ? '' : typeof sheet === 'string' ? sheet : sheet.event ? `event-${sheet.event.id}` : sheet.act ? `act-${sheet.act.id}` : `task-${sheet.task?.id}`);

// 이미 홈 화면 앱이거나 Capacitor 앱이면 '홈 화면에 추가'를 숨긴다
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || !!window.Capacitor?.isNativePlatform?.();

// 겹쳐 보기 고른 그룹 · 켜짐(이 기기, 11-13). 계정에 두려면 표를 바꿔야 해서 나중에
const OVERLAY_KEY = 'tachyon_together_overlay';
function readOverlay() {
  try {
    const v = JSON.parse(localStorage.getItem(OVERLAY_KEY) || 'null');
    if (v && typeof v === 'object') return { groupId: Number.isInteger(v.groupId) ? v.groupId : null, on: v.on === true };
  } catch {
    /* 저장이 막혔거나 깨진 값 */
  }
  return { groupId: null, on: false };
}

// 달력 보기: 날 수(1~14일, − · +로) 또는 월(11-14 피드백 '달력도 하루 3일 (지정 가능)', 11-19 사람 "1, 3, 7로 지정하는게 아니라, 숫자를 직접 조절할 수 잇게").
// 고른 것은 이 기기에(CAL_KEY = 'month' 또는 날 수, CAL_DAYS_KEY = 월로 가도 기억하는 날 수), 처음엔 폰 3일 · 넓은 화면 7일
const CAL_KEY = 'tachyon_cal_mode';
const CAL_DAYS_KEY = 'tachyon_cal_days';
const CAL_MAX = 14;
const OLD_DAYS = { day: 1, three: 3, week: 7 }; // 11-19 전에 기억해 둔 값
function readCal(wide) {
  let v = null;
  let d = null;
  try {
    v = localStorage.getItem(CAL_KEY);
    d = localStorage.getItem(CAL_DAYS_KEY);
  } catch {
    /* 저장이 막힌 브라우저 */
  }
  const n = Number(d) || OLD_DAYS[v] || Number(v);
  return { days: n >= 1 && n <= CAL_MAX ? Math.round(n) : wide ? 7 : 3, month: v === 'month' };
}

const PAGES = [
  ['today', '오늘'],
  ['cal', '달력'],
  ['tasks', '할 일'],
  ['memo', '메모'],
  ['together', '같이'],
  ['activities', '활동'], // 11-19 사람 "서울대 비교과 … 활동 / 행사 안내 … 모아볼 수 있는 섹션"(ActivitiesPage.jsx)
];
const PANES = [
  ['ring', '하루'],
  ['day', '일정'],
  ['tasks', '할 일'],
];

// 보던 쪽을 새로 고쳐도 그대로(이 탭에만, 11-21). 홈 화면 바로가기는 /?page=cal처럼 온다(manifest shortcuts)
const PAGE_KEY = 'tachyon_page';
function startPage() {
  let p = new URLSearchParams(window.location.search).get('page');
  try {
    p ||= sessionStorage.getItem(PAGE_KEY);
  } catch {
    /* 저장이 막힌 브라우저 */
  }
  return PAGES.some(([k]) => k === p) ? p : readPrefs().first;
}

// 연결 상태 한 줄(11-21): 끊긴 연결을 메뉴 안까지 들어가지 않아도 알게
const FEED_LABEL = { etl: 'eTL', google: '구글', apple: '애플', naver: '네이버' };
const HINT_KEY = 'tachyon_conn_hint'; // '0' = '연결한 캘린더가 없어요' 안내를 닫음
const ASKED_NOTIFY_KEY = 'tachyon_notify_asked'; // 마감 알림을 켤지 한 번 물어봄
const flag = (key, value) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* 저장이 막힌 브라우저 */
  }
  return null;
};

// 두 목록을 id로 합친다(같은 일정이 오늘부터 6주 목록과 보이는 달력 목록에 같이 있을 수 있다)
function mergeEvents(a, b) {
  const seen = new Map();
  for (const ev of [...a, ...b]) seen.set(ev.id, ev);
  return [...seen.values()];
}

// 집중 타이머 막대(9판 '집중 N분'): 머리 밑 한 줄. 1초마다 남은 시간, 끝나면 onEnd, '그만'은 지난 분만 적는다
function FocusBar({ focus, onStop, onEnd }) {
  const [left, setLeft] = useState(() => focus.end - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const ms = focus.end - Date.now();
      if (ms <= 0) {
        clearInterval(id);
        onEnd();
      } else setLeft(ms);
    }, 1000);
    return () => clearInterval(id);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = Math.max(0, Math.ceil(left / 1000));
  return (
    <div className="focus-bar" role="timer" aria-live="off">
      <span className="focus-dot" aria-hidden="true" />
      <span className="focus-title">집중 · {focus.task.title}</span>
      <strong className="num">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </strong>
      <button type="button" className="btn-text quiet" onClick={() => onStop(Math.floor((focus.min * 60 - s) / 60))}>
        집중 끝내기
      </button>
    </div>
  );
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
  const [page, setPageState] = useState(startPage); // 보던 쪽(이 탭) → 없으면 '첫 화면'으로 고른 쪽
  const setPage = useCallback((p) => {
    setPageState(p);
    try {
      sessionStorage.setItem(PAGE_KEY, p);
    } catch {
      /* 이번에만 */
    }
  }, []);
  const [guide, setGuide] = useState(() => !guideSeen()); // 처음 길잡이(이 기기에서 한 번)
  const [pane, setPane] = useState('ring'); // 폰의 오늘 쪽에서 보이는 한 칸
  const [join, setJoin] = useState(() => (joinCode && !example ? joinCode : null)); // 초대 링크(?join=)로 들어왔으면 받기 창
  const [togetherKey, setTogetherKey] = useState(0); // 받은 뒤 '같이' 쪽을 새로 불러오게
  const [togetherStart, setTogetherStart] = useState(false); // 달력 '같이 보기'로 들어옴 → 그룹이 없으면 만들기 칸을 연다
  const doneTogetherStart = useCallback(() => setTogetherStart(false), []);
  // 다 같이 빈 시간 겹쳐 보기(11-13 사람 "다 같이 되는 시간은 내 시간표에 오버레이해서 다른 색으로"): 고른 그룹 · 켜짐은 이 기기에
  const [overlay, setOverlayState] = useState(readOverlay); // { groupId, on }
  const setOverlay = useCallback((next) => {
    setOverlayState(next);
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(next));
    } catch {
      /* 저장이 막힌 브라우저면 이번에만 */
    }
  }, []);
  const [groups, setGroups] = useState(null); // 내 그룹(달력 쪽에서 받는다. null = 아직 · 못 받음)
  const [free, setFree] = useState(null); // { key, data } 고른 그룹의 그 주 '다 같이 빈' 구간
  // 오늘 쪽 위젯 배치(11-13, 디자인 넷째 묶음 ②): 고른 배치 · 차례는 이 기기에, '배치 바꾸기'를 눌렀을 때만 옮긴다
  const wide = useWide();
  const [todayLayout, setTodayLayout] = useState(readLayout); // { layout, order }
  const [arranging, setArranging] = useState(false);
  const saveLayout = useCallback((next) => {
    setTodayLayout(next);
    writeLayout(next);
  }, []);
  const swapWidgets = useCallback(
    (i, j) =>
      setTodayLayout((prev) => {
        const next = { ...prev, order: swapOrder(prev.order, i, j) };
        writeLayout(next);
        return next;
      }),
    [],
  );
  useEffect(() => {
    if (page !== 'today' || !wide) setArranging(false);
  }, [page, wide]);
  const [cal, setCalState] = useState(() => readCal(wide));
  const setCal = useCallback((patch) => {
    setCalState((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem(CAL_KEY, next.month ? 'month' : String(next.days));
        localStorage.setItem(CAL_DAYS_KEY, String(next.days));
      } catch {
        /* 이번에만 */
      }
      return next;
    });
  }, []);
  const calDays = cal.month ? 0 : cal.days; // 0 = 월
  // 폰 달력 쪽의 보기 고르기 줄(날 수 · 같이 · + 일정)은 접어 두고 달력 머리의 단추로 연다(11-19 사람 "옵션들을 토글로 만들어 숨기고, 최대한 달력이 크게")
  const [calTools, setCalTools] = useState(false);
  const [typingDays, setTypingDays] = useState(false); // 'N일'을 눌러 날 수를 직접 적는 중(11-21)
  const [weekFrom, setWeekFrom] = useState(today); // 주간 달력 첫 칸(처음엔 오늘)
  const [month, setMonth] = useState(() => ({ y: kst(now).y, m: kst(now).m }));

  const [planEvents, setPlanEvents] = useState([]); // 오늘부터 6주: 오늘 화면 · 밀도
  const [calEvents, setCalEvents] = useState([]); // 달력에 보이는 기간
  const [rank, setRank] = useState({ tasks: [], warning: null });
  const [memos, setMemos] = useState([]);
  const [popup, setPopup] = useState(null); // { memoId, popup }
  const [waiting, setWaiting] = useState(false);
  const [floatWin, openFloat, closeFloat] = useFloatWindow(); // 데스크탑 작은 메모 창(11-17, MemoFloat.jsx)
  const [popupWhere, setPopupWhere] = useState('main'); // 'float' = 팝업을 작은 창 안에(11-19 사람 "다른 창을 보고 있을 때도 위로 팝업으로"), 'center' = 가운데 새 창(11-20)
  const [popWin, setPopWin] = useState(null); // 가운데 새 창(11-20 사람 "새로운 창으로 가운데에 띄워줘")
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'done' | 'feedback' | 'install' | 'calendar' | 'etl' | 'theme' | 'delete' | { event } | { task }
  const [snack, setSnack] = useState(null);
  const [focus, setFocus] = useState(null); // 집중 타이머 { task, min, end }
  const [seed, setSeed] = useState(null); // 달력 '+ 일정' · '+ 할 일' · 날짜 누르기 → 메모 칸에 날짜를 미리 적는다
  const [localTick, setLocalTick] = useState(0); // 이 기기에 적은 할 일 차례(taskLocal.js)가 바뀌면 다시 셈
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

  // 주간 달력은 보이는 날 앞뒤로 2·calPad일씩 더 불러 둔다(좌우로 굴려 볼 몫, 11-15). 달력은 멈출 때마다 다시 그리지 않고
  // start에서 calPad일까지 떨어진 자리를 가운데로 그려 둔 채 굴리니(11-16) 두 배를 불러야 그려 둔 칸이 다 찬다
  const calRange = useMemo(
    () => (calDays ? [addDays(weekFrom, -2 * calPad(calDays)).toISOString(), calDays + 4 * calPad(calDays)] : [monthGrid(month.y, month.m)[0].toISOString(), 42]),
    [calDays, weekFrom, month], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 처음 받기 전에는 '할 일이 없어요' 대신 '불러오는 중…'(11-21). 못 받으면 한 줄 + [다시 시도] — 누르면 전부 다시 받는다
  const [got, setGot] = useState({ plan: false, rank: false });
  const mark = (k) => setGot((g) => (g[k] ? g : { ...g, [k]: true }));
  const reloadRef = useRef(null);
  const failed = useCallback((what) => setSnack({ text: `${what} 불러오지 못했어요. 인터넷을 확인해 주세요`, actionLabel: '다시 시도', onAction: () => reloadRef.current() }), []);
  const loadPlan = useCallback(
    () =>
      api
        .getEvents(today, PLAN_DAYS)
        .then((r) => (setPlanEvents(r.events), mark('plan')))
        .catch(() => failed('일정을')),
    [today, failed],
  );
  const calSeq = useRef(0); // 달력을 빨리 넘기면 늦게 온 앞 기간의 답은 버린다
  const loadCal = useCallback(() => {
    const seq = (calSeq.current += 1);
    return api
      .getEvents(calRange[0], calRange[1])
      .then((r) => seq === calSeq.current && setCalEvents(r.events))
      .catch(() => seq === calSeq.current && failed('달력을'));
  }, [calRange, failed]);
  const loadEvents = useCallback(() => {
    loadPlan();
    loadCal();
  }, [loadPlan, loadCal]);
  const loadRank = useCallback(
    () =>
      api
        .getTasks()
        .then((r) => (setRank(r), mark('rank')))
        .catch(() => failed('할 일을')),
    [failed],
  );
  const loadMemos = useCallback(
    () =>
      api
        .listMemos()
        .then((r) => setMemos(r.memos))
        .catch(() => failed('메모를')),
    [failed],
  );
  reloadRef.current = () => {
    loadEvents();
    loadRank();
    loadMemos();
  };
  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // 연결 상태(11-21): 구글 캘린더 · 캘린더 주소 · eTL이 끊겼는지 한 번에 받아 머리 한 줄과 메뉴 줄에 보인다. 처음 · 연결 창을 닫은 뒤 다시
  const [conn, setConn] = useState(null); // { gcal, feeds, etl } — 못 받은 칸은 null
  const loadConn = useCallback(
    () => Promise.allSettled([api.getGcal(), api.getFeeds(), api.getEtl()]).then(([g, f, e]) => setConn({ gcal: g.value ?? null, feeds: f.value ?? null, etl: e.value ?? null })),
    [],
  );
  useEffect(() => {
    loadConn();
  }, [loadConn]);
  const lastSheet = useRef(null);
  useEffect(() => {
    if (!sheet && ['calendar', 'etl', 'ttw'].includes(lastSheet.current)) loadConn();
    lastSheet.current = sheet;
  }, [sheet, loadConn]);

  // 화면에 돌아올 때(30초에 한 번까지): 구글 캘린더(12_gcal.js, 11-18)와 맞추고, 앱이면 폰 캘린더도 다시 읽어 바뀐 것만 올린다(11-21).
  // 그 뒤 일정 · 할 일 · 메모를 다시 받는다 — 다른 기기에서 넣은 것이 보이게(2분에 한 번까지, 맞춘 것이 있으면 바로. 11-21).
  // ponytail: 화면을 보는 동안 계속 바뀌게 하려면 주기 받기
  useEffect(() => {
    let last = 0;
    let loaded = Date.now(); // 처음 받기는 위 effect들이 한다
    let first = true;
    const back = () => {
      if (document.hidden || Date.now() - last < 30000) return;
      last = Date.now();
      // 앱을 연 첫 번째에는 폰 캘린더 권한을 한 번 묻는다('once') — 화면이 뜬 뒤에(빈 화면에서 묻지 않게)
      const phone = inApp() && !api.isExample() ? syncDevice(first ? 'once' : false, !first).catch(() => null) : null;
      first = false;
      const gcal = api.syncGcal().then(
        (r) => (setConn((c) => (c ? { ...c, gcal: r } : c)), r.linked && !r.error),
        () => false,
      );
      Promise.all([gcal, phone]).then(([linked, sentPhone]) => {
        if (!linked && !sentPhone && Date.now() - loaded < 120000) return;
        loaded = Date.now();
        reloadRef.current();
      });
    };
    back();
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);
  // PC eTL 북마크가 이 탭을 연 경우(/#etl=…, 11-20 원터치) → 주소에서 바로 지우고 eTL 창에서 연결
  const [etlGift, setEtlGift] = useState(takeHashGift);
  useEffect(() => {
    if (etlGift) setSheet('etl');
  }, [etlGift]);
  // 구글 동의 화면에서 돌아옴(/?gcal=ok|…) → 한 줄 알리고 주소에서 뺀다
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const text = api.gcalBackText(params.get('gcal'));
    if (!text) return;
    setSnack({ text });
    params.delete('gcal');
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
  }, []);
  // 앱: 폰 브라우저에서 구글 캘린더를 연결하고 돌아옴(native.js) → 화면을 새로 열지 않고 그 자리에서 알리고 다시 받는다(11-21)
  useEffect(() => {
    const onGcal = (e) => {
      e.preventDefault();
      setSheet(null);
      setSnack({ text: api.gcalBackText(e.detail) });
      loadConn();
      api.syncGcal().then(() => reloadRef.current(), () => {});
    };
    window.addEventListener(GCAL_BACK, onGcal);
    return () => window.removeEventListener(GCAL_BACK, onGcal);
  }, [loadConn]);
  useEffect(() => {
    loadCal();
  }, [loadCal]);
  useEffect(() => {
    loadRank();
  }, [loadRank]);
  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  const allEvents = useMemo(() => mergeEvents(planEvents, calEvents), [planEvents, calEvents]);

  // 달력 쪽에 들어오면 내 그룹을 받는다(겹쳐 보기 칩). '같이' 쪽에서 그룹을 만들거나 나간 뒤에도 달력으로 오면 다시
  useEffect(() => {
    if (page !== 'cal') return undefined;
    let live = true;
    api.getTogether().then(
      (r) => live && setGroups(r.groups),
      () => live && setGroups(null),
    );
    return () => {
      live = false;
    };
  }, [page, togetherKey]);
  const overlayGroup = groups?.find((g) => g.id === overlay.groupId) || groups?.[0] || null; // 고른 그룹이 없어졌으면 첫 그룹(꺼진 채)
  const overlayOn = Boolean(overlay.on && overlayGroup && overlayGroup.id === overlay.groupId);
  const showOverlay = overlayOn && page === 'cal' && calDays > 0;
  // 그 주 다 같이 빈 시간: 내 일정이 다시 오면(옮기기·고치기 뒤 포함) 다시 받는다. 서버는 읽기만
  useEffect(() => {
    if (!showOverlay) return undefined;
    const from = toKstIso(weekFrom).slice(0, 10);
    const key = `${overlayGroup.id}|${from}`;
    let live = true;
    api.getGroupFree(overlayGroup.id, from, 7).then(
      (data) => live && setFree({ key, data }),
      (err) => {
        if (!live) return;
        setFree(null);
        if (err.status === 404) {
          setOverlay({ groupId: null, on: false }); // 나간 그룹
          setGroups((list) => list?.filter((g) => g.id !== overlayGroup.id) ?? null);
        }
        setSnack({ text: err.message || '다 같이 빈 시간을 불러오지 못했어요' });
      },
    );
    return () => {
      live = false;
    };
    // weekFrom이 바뀌면 calEvents도 다시 오니 calEvents 하나로 센다(두 번 받지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay, overlayGroup?.id, calEvents]);
  const freeNow = showOverlay && free && free.key === `${overlayGroup.id}|${toKstIso(weekFrom).slice(0, 10)}` ? free.data : null;

  // 켜고 끄기(달력 머리 칩 · '같이' 쪽 그룹 줄 칩). 다른 그룹을 켜면 그 그룹으로 바뀐다. → 켰으면 true
  function toggleOverlay(groupId) {
    const on = !(overlay.on && overlay.groupId === groupId && groups?.some((g) => g.id === groupId));
    setOverlay({ groupId, on });
    if (on && !calDays) setCal({ month: false });
    return on;
  }

  // 수업 사이 동선(TT Wizard 걷는 시간): 장소가 있는 일정이 보이면 캠퍼스 표를 한 번 받아 둔다
  const [campus, setCampus] = useState(null);
  const hasPlace = allEvents.some((e) => e.place);
  useEffect(() => {
    if (!campus && hasPlace) loadCampus().then(setCampus, () => {});
  }, [campus, hasPlace]);
  const legs = useMemo(() => dayLegs(allEvents, campus), [allEvents, campus]);

  const openTasks = useMemo(() => rank.tasks.filter((t) => !t.done), [rank.tasks]);
  const todayKey = dateKey(now);
  // 오늘 목록: 미룬 것 빼고 당긴 것 먼저(taskLocal.js). 폰은 2~3개만(사람 결정 '오늘 화면 · 폰': "할 일은 2-3개 정도만 띄우고")
  const todayTasks = useMemo(() => arrange(openTasks, todayKey), [openTasks, todayKey, localTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    planReminders().catch(() => null); // 폰 알림(앱만): 아침 브리핑 · 리마인드 · 마감 임박을 다시 잡는다. 다시 볼 때·바꾼 뒤는 native.js·api.js가
  }, []);
  const fixedToday = useMemo(() => fixedOn(todayKey), [todayKey, localTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const plansAhead = useMemo(() => plansFrom(todayKey), [todayKey, localTick]); // eslint-disable-line react-hooks/exhaustive-deps -- 하기로 한 날·때(11-15)
  const subjects = useMemo(() => [...new Set(allEvents.filter((e) => e.source === 'timetable').map((e) => e.title))], [allEvents]);

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
      // Tachyon 창이 안 보이면(다른 탭 · 최소화 · 다른 앱에 가림) 화면 가운데 새 창에(11-20), 그게 막히면 작은 창을 키워 그 안에(11-19).
      // 보이면 지금처럼 이 창에. 둘 다 못 하면(AI 답이 늦어 손 누름 허락이 지남) 이 창에 두고 작은 창에 '창 띄우기'
      if (found) {
        const away = document.visibilityState === 'hidden';
        const center = away ? openCenterWindow(activeWindow(floatWin, window)) : null;
        if (center) setPopWin(center);
        setPopupWhere(center ? 'center' : floatWin && away && growFloat(floatWin) ? 'float' : 'main');
      }
      setPopup(found ? { memoId: memo.id, popup: found } : null);
      // 일정 · 할 일로 안 읽힌 메모: 어디로 갔는지 한 줄 + 한 번에 할 일로(11-21). 메모 쪽에서는 목록에 바로 보이니 조용히
      if (!found && page !== 'memo')
        setSnack({
          text: '메모로 남겼어요',
          actionLabel: '할 일로 넣기',
          onAction: () =>
            api.createTask({ title: text }).then(
              () => (loadRank(), setSnack({ text: `‘${text}’ 할 일에 넣었어요` })),
              () => setSnack({ text: '할 일에 넣지 못했어요. 잠시 후 다시 시도해 주세요' }),
            ),
        });
    } catch (err) {
      setMemos((m) => m.filter((x) => x.id !== temp.id));
      setSeed({ text }); // 쓴 글은 메모 칸에 그대로 돌려놓는다(11-21)
      setSnack({ text: err.offline ? err.message : '메모를 보내지 못했어요. 잠시 후 다시 시도해 주세요' });
    } finally {
      setWaiting(false);
    }
  }

  // 띠를 누르면 '이 시간으로 모임 잡기'(11-13): 메모 하나를 남기고, 팝업은 고른 시각 그대로(서버가 읽은 것은 suggested로만 — 팝업 정확도)
  const planTogether = (span) => planAt(`${overlayGroup.name} 모임`, span, { together: overlayGroup.name });

  // 추천 자리 → '이 시간에 넣기'(할 일 바로 다루기): 같은 길로 일정 팝업을 띄우고, 저장되면 그 할 일을 오늘 '정함'으로 적는다
  function placeTask(task, slot) {
    const d = new Date(today).getTime();
    setSheet(null);
    planAt(task.title, { start: new Date(d + slot[0] * 60000).toISOString(), end: new Date(d + slot[1] * 60000).toISOString() }, {}, { id: task.id, from: slot[0], to: slot[1] });
  }

  async function planAt(title, span, extra = {}, fix = null) {
    const text = `${shortDate(span.start)} ${hhmm(span.start)}–${hhmm(span.end)} ${title}`;
    const temp = { id: `tmp-${Date.now()}`, text, created_at: new Date().toISOString(), handled: 0, event_id: null };
    setMemos((m) => [...m, temp]);
    setWaiting(true);
    try {
      const { memo, popup: found } = await api.sendMemo(text);
      setMemos((m) => m.map((x) => (x.id === temp.id ? memo : x)));
      const date = toKstIso(span.start).slice(0, 10);
      setPopup({ memoId: memo.id, suggested: found ?? null, fix, popup: { title, date, time: hhmm(span.start), end_time: hhmm(span.end), place: '?', ...extra } });
    } catch {
      setMemos((m) => m.filter((x) => x.id !== temp.id));
      setSnack({ text: '일정 창을 열지 못했어요. 잠시 후 다시 시도해 주세요' });
    } finally {
      setWaiting(false);
    }
  }

  function showWeekOf(date) {
    setPage('cal');
    if (!calDays) setCal({ month: false }); // 고른 날 수는 그대로
    setWeekFrom(dayStart(date).toISOString());
  }

  async function savePopup(fields, changeId, weekly) {
    setBusy(true);
    try {
      if (fields.kind === 'task') {
        // 할 일 팝업 → 할 일 목록에 바로(걸리는 시간은 팝업의 어림, 없으면 밤 정리가 채운다). 한 메모에 여럿이면 tasks
        const { task, tasks = [task] } = await api.savePopup(popup.memoId, fields, 'suggested' in popup ? popup.suggested : popup.popup);
        // 메모에 하기로 한 날·때를 썼으면(서버 popup.plan, 11-15 '월요일 오전에 …') 이 기기에 적어 둔다 → 그날 전엔 오늘 자리를 안 잡고 그날엔 그때 추천.
        // 고치기에서 마감 날짜를 바꿨으면 같은 날이던 계획도 따라간다
        const asked = popup.popup.plan;
        const when = asked && (fields.date === popup.popup.date ? asked : asked.date === popup.popup.date && /^\d{4}-\d{2}-\d{2}$/.test(fields.date) ? { ...asked, date: fields.date } : null);
        if (when) {
          tasks.forEach((t) => planTask(t.id, when, todayKey));
          setLocalTick((n) => n + 1);
        }
        setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, task_id: task.id } : x)));
        setPopup(null);
        loadRank();
        const whenText = when && when.date !== todayKey ? ` · ${planLabel(when, now)}에` : '';
        const added = tasks.length > 1 ? `할 일 ${tasks.length}개를 넣었어요${whenText}` : `‘${task.title}’ 할 일에 넣었어요${whenText}`;
        tick();
        // 앱에서 마감 있는 할 일을 처음 넣었을 때 한 번만: 마감 알림을 켤지 묻는다(권한은 쓸모를 본 뒤에, 11-21)
        const perm = task.due && !flag(ASKED_NOTIFY_KEY) ? await notifyState().catch(() => null) : null;
        if (perm && perm !== 'granted' && perm !== 'denied') {
          flag(ASKED_NOTIFY_KEY, '1');
          setSnack({
            text: `${added}. 마감 전에 알려 드릴까요?`,
            actionLabel: '알림 켜기',
            onAction: () => turnDueSoon(true).then((ok) => setSnack({ text: ok ? '마감 3시간 전에 한 번 알려 드릴게요' : '알림 권한이 꺼져 있어요. 폰 설정에서 켤 수 있어요' })),
          });
          return;
        }
        // 방금 넣은 것은 한 번에 되돌린다(Ctrl+Z)
        setSnack({ text: added, actionLabel: '되돌리기', onAction: () => Promise.all(tasks.map((t) => api.deleteTask(t.id))).then(loadRank, loadRank) });
        return;
      }
      const { event, repeat, tasks: prepTasks = [] } = await api.savePopup(popup.memoId, fields, 'suggested' in popup ? popup.suggested : popup.popup, changeId, weekly);
      if (prepTasks.length) loadRank(); // 일정 전에 할 일(prep)도 넣었으면 할 일 목록을 다시
      setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1, event_id: event.id } : x)));
      if (popup.fix) {
        fixTask(popup.fix.id, todayKey, popup.fix.from, popup.fix.to);
        setLocalTick((n) => n + 1);
      }
      setPopup(null);
      const shown = api.normalizeEvent(event);
      if (changeId) {
        setPlanEvents((list) => list.filter((e) => e.id !== changeId)); // 옮긴 옛 일정은 바로 빠진다
        setCalEvents((list) => list.filter((e) => e.id !== changeId));
      }
      if (sameDay(shown.start, now)) setPlanEvents((list) => [...list.filter((e) => e.id !== shown.id), shown]); // 바로 보이고, 서버 목록으로 다시 맞춘다
      loadEvents();
      const prepText = prepTasks.length ? ` · 그 전에 할 일 ${prepTasks.length}개도` : '';
      tick();
      if (repeat) setSnack({ text: `매주 같은 요일로 ${repeat}번 넣었어요${prepText}` });
      else if (!sameDay(shown.start, now)) setSnack({ text: `‘${shown.title}’ ${shortDate(shown.start)}에 넣었어요${prepText}`, actionLabel: '달력에서 보기', onAction: () => showWeekOf(shown.start) });
      // 오늘 일정: 넣은 시각을 말해 주고 한 번에 되돌린다(11-21). 옮긴 일정(changeId)은 되돌릴 옛 일정이 가려져 있어 뺀다
      else setSnack({ text: `‘${shown.title}’ ${shown.all_day ? '오늘 종일로' : `${hhmm(shown.start)}에`} 넣었어요${prepText}`, ...(changeId ? {} : { actionLabel: '되돌리기', onAction: () => api.deleteEvent(event.id).then(() => forgetEvent(event.id)) }) });
    } catch (err) {
      setSnack({ text: err.offline ? err.message : '저장하지 못했어요. 잠시 후 다시 시도해 주세요' });
    } finally {
      setBusy(false);
    }
  }

  function cancelPopup() {
    api.cancelPopup(popup.memoId, popup.popup.kind).catch(() => {});
    if (popup.popup.kind === 'task') setMemos((m) => m.map((x) => (x.id === popup.memoId ? { ...x, handled: 1 } : x)));
    setPopup(null);
  }

  // 글자판 · 뒤로 단추(11-21 "거의 모든게 원터치"):
  //   Esc = 팝업 닫기 · Ctrl/⌘+Z = 방금 한 일 되돌리기 · 달력에서 ← → = 앞뒤 기간 · 아무 글자나 치면 메모 칸으로(창이 없을 때)
  //   안드로이드 뒤로 단추(native.js listenBack) = 팝업 닫기 → 첫 쪽으로 → (더 없으면 앱이 내려감)
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') return void (popup && !sheet && cancelPopup());
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && snack?.actionLabel === '되돌리기') {
        e.preventDefault();
        snack.onAction();
        return void setSnack(null);
      }
      if (typing || mod || e.altKey || sheet || popup || guide || join || arranging || document.querySelector('dialog[open]')) return;
      if (page === 'cal' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const k = e.key === 'ArrowLeft' ? -1 : 1;
        if (calDays) setWeekFrom((w) => addDays(w, k * calDays).toISOString());
        else setMonth((m) => shiftMonth(m, k));
        return;
      }
      // 글자를 치기 시작하면 메모 칸으로 — 그 글자부터 그대로 적힌다(한글은 조합 시작 'Process')
      if ((e.key.length === 1 && e.key !== ' ') || e.key === 'Process') document.getElementById('memo-input')?.focus();
    };
    const first = readPrefs().first;
    const onBack = (e) => {
      if (popup) cancelPopup();
      else if (page !== first) setPage(first);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(BACK, onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(BACK, onBack);
    };
  });

  // 작은 창 팝업(11-19): 팝업이 닫히거나 이 창으로 오면 작은 창을 키우기 전 크기로, 작은 창이 닫히면 팝업은 이 창으로
  const popupInFloat = Boolean(popup && floatWin && popupWhere === 'float');
  useEffect(() => {
    if (!popupInFloat) shrinkFloat(floatWin);
    if (popupWhere === 'float' && (!popup || !floatWin)) setPopupWhere('main');
  }, [popupInFloat, popup, popupWhere, floatWin]);
  // 가운데 창(11-20): 팝업이 닫히거나 다른 곳으로 가면 창을 닫고, 사람이 창을 직접 닫으면(제목 줄 ×) '메모로만'과 같게
  const popupInCenter = Boolean(popup && popWin && !popWin.closed && popupWhere === 'center');
  useEffect(() => {
    if (!popWin || popupInCenter) return;
    try {
      popWin.close();
    } catch {
      /* 이미 닫힘 */
    }
    setPopWin(null);
    if (popupWhere === 'center') setPopupWhere('main');
  }, [popWin, popupInCenter, popupWhere]);
  const closedByHand = useRef(null);
  closedByHand.current = () => popupInCenter && cancelPopup();
  useEffect(() => {
    if (!popWin) return undefined;
    const onHide = () => closedByHand.current?.();
    popWin.addEventListener('pagehide', onHide);
    return () => popWin.removeEventListener('pagehide', onHide);
  }, [popWin]);
  // 작은 창 '창 띄우기' — 누른 손으로 가운데 새 창을 연다(막히면 작은 창을 키워 그 안에)
  const showPopupHere = () => {
    const center = openCenterWindow(activeWindow(floatWin, window) || floatWin);
    if (center) {
      setPopWin(center);
      setPopupWhere('center');
      return;
    }
    growFloat(floatWin);
    setPopupWhere('float');
  };

  /* 할 일 체크 → 되돌리기 */
  async function doneTask(task) {
    setRank((r) => ({ ...r, tasks: r.tasks.filter((t) => t.id !== task.id) }));
    try {
      await api.setTaskDone(task.id, true);
      loadRank(); // 체크하면 여유 순서가 바뀐다
      tick();
      setSnack({
        text: `‘${task.title}’ 끝냈어요`,
        actionLabel: '되돌리기',
        onAction: () => api.setTaskDone(task.id, false).then(loadRank),
      });
    } catch (err) {
      loadRank();
      setSnack({ text: err.offline ? err.message : '끝냈다고 표시하지 못했어요. 잠시 후 다시 시도해 주세요' });
    }
  }

  // 고치기·지우기: 실패하면 오류를 던져서 고치는 창 안에 보이게 한다(창이 맨 위라 스낵바는 가려진다)
  async function saveEvent(id, fields) {
    await api.updateEvent(id, fields);
    setSheet(null);
    loadEvents();
  }

  // 달력 빈 칸 → 일정 넣기 창 → 저장(11-14). 메모를 거치지 않는다
  async function addEvent(fields) {
    const { event } = await api.createEvent(fields);
    setSheet(null);
    loadEvents();
    tick();
    setSnack({ text: `‘${event.title}’ 넣었어요`, actionLabel: '되돌리기', onAction: () => api.deleteEvent(event.id).then(() => forgetEvent(event.id)) });
  }

  // 일정 끌어 옮기기 · 길이 바꾸기(11-14): 바로 옮겨 보이고, 실패하면 되돌린다. '되돌리기'는 옛 시각으로 다시 보낸다
  async function dropEvent(ev, to) {
    const back = { start: ev.start, end: ev.end };
    const put = (list) => list.map((e) => (e.id === ev.id ? { ...e, ...to } : e));
    setCalEvents(put);
    setPlanEvents(put);
    try {
      const { event } = await api.updateEvent(ev.id, to);
      loadEvents();
      tick();
      setSnack({ text: `‘${ev.title}’ ${hhmm(to.start)}–${hhmm(to.end)}에 놓았어요`, actionLabel: '되돌리기', onAction: () => api.updateEvent(event.id, back).then(loadEvents) });
    } catch (err) {
      loadEvents();
      setSnack({ text: err.message || '옮기지 못했어요. 잠시 후 다시 시도해 주세요' });
    }
  }

  /* 마감 지난 일을 한 번에 '내일 같은 시각'으로(11-21). 되돌리기 = 옛 마감 */
  async function laterTask(task) {
    const due = isoFromInputs(dateInput(addDays(new Date(now), 1)), timeInput(task.due));
    try {
      await api.updateTask(task.id, { due });
      loadRank();
      tick();
      setSnack({ text: `‘${task.title}’ 마감을 내일로 옮겼어요`, actionLabel: '되돌리기', onAction: () => api.updateTask(task.id, { due: task.due }).then(loadRank) });
    } catch (err) {
      setSnack({ text: err.message || '옮기지 못했어요. 잠시 후 다시 시도해 주세요' });
    }
  }

  async function saveTask(id, fields) {
    await api.updateTask(id, fields);
    setSheet(null);
    loadRank();
  }

  /* 지우기(메모·시간표에서 온 것만). 직접 넣은 것은 지운 뒤 [되돌리기]로 같은 내용을 다시 넣는다(11-21 — 그래서 지울 때 두 번 묻지 않는다) */
  function forgetEvent(id) {
    setPlanEvents((list) => list.filter((e) => e.id !== id));
    setCalEvents((list) => list.filter((e) => e.id !== id));
    setMemos((m) => m.map((x) => (x.event_id === id ? { ...x, event_id: null } : x)));
    loadEvents();
  }
  async function deleteEvent(event) {
    await api.deleteEvent(event.id);
    setSheet(null);
    forgetEvent(event.id);
    const again = { title: event.title, place: event.place || null, ...(event.all_day ? { start: event.start.slice(0, 10), end: event.end.slice(0, 10) } : { start: event.start, end: event.end }) };
    const undo = event.source === 'memo' && !event.edited;
    setSnack({
      text: `‘${event.title}’ 지웠어요`,
      ...(undo && {
        actionLabel: '되돌리기',
        onAction: () =>
          api
            .createEvent(again)
            .then(({ event: made }) => (event.important || event.remind != null ? api.updateEvent(made.id, { important: event.important ? 1 : 0, remind: event.remind ?? null }) : null))
            .then(loadEvents, loadEvents),
      }),
    });
  }

  async function deleteTask(task) {
    await api.deleteTask(task.id);
    setSheet(null);
    setRank((r) => ({ ...r, tasks: r.tasks.filter((t) => t.id !== task.id) }));
    setMemos((m) => m.map((x) => (x.task_id === task.id ? { ...x, task_id: null } : x)));
    loadRank();
    setSnack({
      text: `‘${task.title}’ 지웠어요`,
      ...(task.source === 'memo' && { actionLabel: '되돌리기', onAction: () => api.createTask({ title: task.title, due: task.due ?? null, minutes: task.minutes ?? null, remind: task.remind ?? null }).then(loadRank, loadRank) }),
    });
  }

  // 폰 알림을 눌러 들어옴(native.js listenNotify, 11-21): 그 일정 · 할 일을 바로 연다. 할 일 알림의 단추(완료 · 1시간 뒤 · 내일 아침)는 여기서 바로 한다.
  // 앱이 꺼져 있다가 알림으로 켜지면 목록보다 먼저 오니, 목록을 받은 뒤에 처리한다
  const [tap, setTap] = useState(takeNotify);
  useEffect(() => {
    const onTap = () => setTap(takeNotify());
    window.addEventListener(NOTIFY_TAP, onTap);
    return () => window.removeEventListener(NOTIFY_TAP, onTap);
  }, []);
  useEffect(() => {
    if (!tap || !got.rank || !got.plan) return;
    setTap(null);
    if (tap.kind === 'morning') return void setSheet('inbox');
    if (tap.kind === 'event') {
      const ev = allEvents.find((e) => e.id === tap.ref);
      return void (ev ? setSheet({ event: ev }) : setPage('cal'));
    }
    const task = tap.kind === 'task' && rank.tasks.find((t) => t.id === tap.ref && !t.done);
    if (!task) return void setPage('tasks'); // 묶음 알림 · 이미 끝낸 것
    if (tap.action === 'done') return void doneTask(task);
    if (tap.action === 'later' || tap.action === 'tomorrow') {
      const at = new Date();
      if (tap.action === 'tomorrow') at.setHours(24 + readPrefs().wake, 0, 0, 0);
      else at.setTime(at.getTime() + 60 * 60 * 1000);
      const body = task.due ? (task.due.length > 10 ? `마감 ${shortDate(task.due)} ${hhmm(task.due)}` : `${shortDate(task.due)}까지`) : '';
      snoozeNotify({ id: tap.id, kind: 'task', ref: task.id, title: task.title, body }, at).then(
        () => setSnack({ text: `‘${task.title}’ ${tap.action === 'later' ? '1시간 뒤에' : `내일 ${readPrefs().wake}시에`} 다시 알려 드릴게요` }),
        () => setSnack({ text: '알림을 다시 잡지 못했어요' }),
      );
      return;
    }
    setSheet({ act: task });
  }, [tap, got]); // eslint-disable-line react-hooks/exhaustive-deps

  // 머리 아래 연결 한 줄: 끊긴 연결(다시 연결 한 번에) · 아직 아무 캘린더도 안 이은 사람에게 한 번(닫을 수 있음)
  const [hintOff, setHintOff] = useState(() => flag(HINT_KEY) === '0');
  const deadFeed = conn?.feeds?.find((f) => f.stopped);
  const connLine = !conn || example
    ? null
    : conn.gcal?.linked && conn.gcal.error
      ? { bad: true, text: '구글 캘린더 연결이 끊겼어요', actions: [['다시 연결', () => setSheet('calendar')]] }
      : conn.etl?.dead
        ? { bad: true, text: 'eTL 연결이 끊겼어요', actions: [['다시 연결', () => setSheet('etl')]] }
        : deadFeed
          ? { bad: true, text: `${FEED_LABEL[deadFeed.kind] || ''} 캘린더 주소가 더 이상 열리지 않아요`, actions: [['다시 붙이기', onOpenSetup]] }
          : !hintOff && got.plan && conn.gcal && conn.feeds && conn.etl && !conn.gcal.linked && !conn.etl.connected && !conn.feeds.some((f) => f.set) && !planEvents.some((e) => e.source !== 'memo')
            ? { text: '아직 연결한 캘린더가 없어요', actions: [['eTL 연결', () => setSheet('etl')], ['구글 캘린더 연결', () => setSheet('calendar')]] }
            : null;
  const feedsOn = conn?.feeds?.filter((f) => f.set).length || 0;
  const menuState = {
    feeds: deadFeed ? '끊김' : feedsOn ? `${feedsOn}개 연결됨` : '',
    etl: conn?.etl?.dead ? '끊김' : conn?.etl?.connected ? '연결됨' : '',
    gcal: conn?.gcal?.linked ? (conn.gcal.error ? '끊김' : '켜짐') : '',
  };
  const stateTag = (text) => text && <span className={text === '끊김' ? 'menu-state bad' : 'menu-state'}>{text}</span>;

  const themeName = useThemeName();
  const date = kst(now);
  const dateText = `${date.m}월 ${date.d}일 ${WEEKDAYS[date.wd]}요일`;
  // 아직 정리 안 된 메모(밤 정리 후보와 같은 기준, example.js) → 하루 고리 바깥 점(적은 시각)
  const looseMin = memos.filter((m) => !m.handled && !m.event_id && !m.task_id).map((m) => {
    const p = kst(new Date(m.created_at));
    return p.h * 60 + p.min;
  });
  const clearMemos = () =>
    api
      .clearMemos()
      .then(({ deleted }) => {
        setMemos([]);
        setSnack({ text: `메모 ${deleted}개를 지웠어요` });
      })
      .catch(() => setSnack({ text: '메모를 지우지 못했어요. 잠시 후 다시 시도해 주세요' }));
  const memoCard = <MemoCard memos={memos} now={now} activeId={popup?.memoId} waiting={waiting} onTidy={() => setSheet('tidy')} onClear={clearMemos} />;

  // 메모 칸에 'M/D '(일정) 또는 'M/D까지 '(할 일)를 적어 두고 초점 — 나머지는 사람이 적고 보내면 메모 → 팝업 → 저장
  const calDay = calDays && weekFrom !== today ? weekFrom : today;
  const seedDay = (day, tail) => {
    const p = kst(new Date(day));
    setSeed({ text: `${p.m}/${p.d}${tail || ' '}` });
  };

  // 쪽마다 머리 줄에 붙는 고르기
  const controls =
    page === 'today' ? (
      <span className="only-narrow">
        <Segmented label="오늘 보기" items={PANES} value={pane} onChange={setPane} />
      </span>
    ) : page === 'cal' ? (
      <span className="cal-controls">
        {overlayGroup ? (
          // 범례 겸 켜고 끄기(디자인 넷째 묶음 ① .together-key): 고른 그룹의 다 같이 빈 시간을 주 달력에 띠로
          <button
            type="button"
            className="together-key"
            aria-pressed={overlayOn}
            title={freeNow && freeNow.known < freeNow.members ? `달력을 연결한 ${freeNow.known}명 기준(${freeNow.members}명 중)` : undefined}
            onClick={() => toggleOverlay(overlayGroup.id)}
          >
            <span className="only-wide">다 같이 빈 시간 ·</span>
            <span className="only-narrow">다 같이 ·</span>
            <span className="tk-name">{overlayGroup.name}</span>
            {freeNow && freeNow.known < freeNow.members && <span className="num">{`${freeNow.known}/${freeNow.members}명`}</span>}
          </button>
        ) : (
          // 그룹이 없으면 '같이'로 들어가는 길(11-13 컨셉 쪽지: 그룹 만들기를 눈에 띄게) — 만들기 칸이 열린 채로 간다
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              setTogetherStart(true);
              setPage('together');
            }}
          >
            + 그룹 만들기
          </button>
        )}
        <button type="button" className="chip-btn cal-add" onClick={() => seedDay(calDay, '')}>
          + 일정
        </button>
        <button type="button" className="chip-btn cal-add" onClick={() => seedDay(calDay, '까지 ')}>
          + 할 일
        </button>
        <span className="segmented cal-pick" role="group" aria-label="달력 보기">
          <button type="button" aria-label="하루 줄이기" title="하루 줄이기" disabled={!cal.month && cal.days <= 1} onClick={() => setCal({ month: false, days: Math.max(1, cal.days - (cal.month ? 0 : 1)) })}>
            −
          </button>
          {typingDays && !cal.month ? (
            // 'N일'을 한 번 더 누르면 날 수를 바로 적는다(1~14, Enter)
            <input
              className="num cal-days-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={CAL_MAX}
              defaultValue={cal.days}
              autoFocus
              aria-label={`보여 줄 날 수(1~${CAL_MAX})`}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.target.blur()}
              onBlur={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= 1 && n <= CAL_MAX) setCal({ month: false, days: n });
                setTypingDays(false);
              }}
            />
          ) : (
            <button type="button" className="num" aria-pressed={!cal.month} title={cal.month ? undefined : '눌러서 날 수를 직접 적기'} onClick={() => (cal.month ? setCal({ month: false }) : setTypingDays(true))}>
              {cal.days}일
            </button>
          )}
          <button type="button" aria-label="하루 늘리기" title="하루 늘리기" disabled={!cal.month && cal.days >= CAL_MAX} onClick={() => setCal({ month: false, days: Math.min(CAL_MAX, cal.days + (cal.month ? 0 : 1)) })}>
            +
          </button>
          <button type="button" aria-pressed={cal.month} onClick={() => setCal({ month: true })}>
            월
          </button>
        </span>
      </span>
    ) : page === 'tasks' ? (
      // 할 일 쪽에서도 한 번에 넣기(11-21): 메모 칸으로 가서 적으면 된다
      <button type="button" className="chip-btn cal-add" onClick={() => setSeed({ text: '' })}>
        + 할 일
      </button>
    ) : null;

  // 폰에서 달력 머리 끝에 붙는 '보기 고르기' 여닫기 단추
  const calToggle = (
    <button type="button" className={calTools ? 'icon-btn cal-tools-btn only-narrow on' : 'icon-btn cal-tools-btn only-narrow'} aria-label="달력 보기 고르기" aria-expanded={calTools} onClick={() => setCalTools((o) => !o)}>
      <Icon name="tune" />
    </button>
  );

  return (
    <div className="shell">
      <ThemeBackdrop />
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
          {page === 'today' &&
            (arranging ? (
              <span className="layout-tools only-wide">
                <span className="layout-pick only-1200" role="group" aria-label="배치">
                  {LAYOUTS.map(([k, label]) => (
                    <button key={k} type="button" className={k} aria-pressed={todayLayout.layout === k} aria-label={label} title={label} onClick={() => saveLayout({ layout: k, order: DEFAULT_ORDER[k] })}>
                      <i />
                      <i />
                      <i />
                      <i />
                    </button>
                  ))}
                </span>
                <button type="button" className="btn-text quiet" onClick={() => saveLayout(FIRST)}>
                  기본 배치로
                </button>
                <button type="button" className="btn-text" onClick={() => setArranging(false)}>
                  완료
                </button>
              </span>
            ) : (
              <button type="button" className="btn-text only-wide" onClick={() => setArranging(true)}>
                배치 바꾸기
              </button>
            ))}
          {(themeName === PARTICLE.night || themeName === PARTICLE.day) && (
            // 입자 테마의 밤 ↔ 낮(9판 스위치: 달이 미끄러져 해가 된다). 색이 천천히 넘어간다
            <button type="button" className="sw" aria-label={themeName === PARTICLE.night ? '낮으로' : '밤으로'} title={themeName === PARTICLE.night ? '낮으로' : '밤으로'} onClick={() => applyTheme(themeName === PARTICLE.night ? PARTICLE.day : PARTICLE.night)}>
              <i />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="오늘 브리핑" title="오늘 브리핑" onClick={() => setSheet('inbox')}>
            <Icon name="inbox" />
          </button>
          <button type="button" className="btn-text only-wide" onClick={() => setSheet('feedback')}>
            의견
          </button>
          <button type="button" className="btn-text" title="내 설정" onClick={() => setSheet('me')}>
            나
          </button>
          <button type="button" className={connLine?.bad ? 'icon-btn has-dot' : 'icon-btn'} aria-label={connLine?.bad ? '메뉴 · 끊긴 연결이 있어요' : '메뉴'} title="메뉴" onClick={() => setSheet('menu')}>
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
        {(page === 'today' || page === 'tasks' || (page === 'cal' && calTools)) && (
          <section className="subbar only-narrow" aria-label="보기 고르기">
            <span className="date num">{page === 'today' ? dateText : ''}</span>
            <span className="grow" />
            {controls}
          </section>
        )}

        {focus && (
          <FocusBar
            focus={focus}
            onStop={(spent) => {
              if (spent > 0) addFocus(spent, todayKey);
              setFocus(null);
            }}
            onEnd={() => {
              addFocus(focus.min, todayKey);
              const task = focus.task;
              setFocus(null);
              setSnack({ text: `집중 ${focus.min}분을 마쳤어요 · ‘${task.title}’`, actionLabel: '끝냈어요', onAction: () => doneTask(task) });
            }}
          />
        )}
        {connLine && (page === 'today' || page === 'cal') && (
          <div className={connLine.bad ? 'conn-line bad' : 'conn-line'} role="status">
            <span>{connLine.text}</span>
            {connLine.actions.map(([label, go]) => (
              <button key={label} type="button" className="btn-text" onClick={go}>
                {label}
              </button>
            ))}
            {!connLine.bad && (
              <button
                type="button"
                className="btn-text quiet"
                onClick={() => {
                  flag(HINT_KEY, '0');
                  setHintOff(true);
                }}
              >
                닫기
              </button>
            )}
          </div>
        )}
        <main key={page} className={`page page-${page}`} data-pane={pane}>
          {page === 'today' && (
            <WidgetGrid wide={wide} layout={todayLayout.layout} order={todayLayout.order} editing={arranging} onSwap={swapWidgets}>
              {(widget) => (
                <>
              <TodayView
                today={today}
                events={planEvents}
                tasks={todayTasks.slice(0, wide ? 6 : 3)}
                total={openTasks.length}
                fixed={fixedToday}
                plans={plansAhead}
                todayKey={todayKey}
                now={now}
                loading={!got.plan || !got.rank}
                onDone={doneTask}
                onEvent={(event) => setSheet({ event })}
                onTask={(task, slot) => setSheet({ act: task, slot })}
                onAll={() => setPage('tasks')}
                onWeek={() => showWeekOf(today)}
                loose={looseMin}
                onTidy={() => setSheet('tidy')}
                widget={widget}
                editing={arranging}
                layoutKey={todayLayout.layout}
              />
              <MemoCard memos={memos} now={now} activeId={popup?.memoId} waiting={waiting} widget={widget('memo')} onTidy={() => setSheet('tidy')} onClear={clearMemos} />
                </>
              )}
            </WidgetGrid>
          )}
          {page === 'cal' &&
            (calDays ? (
              <WeekCalendar
                start={weekFrom}
                n={calDays}
                events={calEvents}
                tasks={openTasks}
                now={now}
                density={densityOf}
                isCurrent={weekFrom === today}
                onMove={(k) => setWeekFrom((w) => addDays(w, k).toISOString())}
                onToday={() => setWeekFrom(today)}
                onJump={showWeekOf}
                onEvent={(event) => setSheet({ event })}
                onTask={(task) => setSheet({ task })}
                onDay={(day) => seedDay(day, '')}
                onAdd={(day, min) => setSheet({ newEvent: { title: '', start: toKstIso(new Date(day.getTime() + min * 60000)), end: toKstIso(new Date(day.getTime() + (min + 60) * 60000)) } })}
                onDrop={dropEvent}
                legs={legs}
                together={freeNow ? { name: overlayGroup.name, spans: freeNow.together } : null}
                onTogether={planTogether}
                tools={calToggle}
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
                onJump={(d) => setMonth({ y: kst(d).y, m: kst(d).m })}
                onDay={(day) => showWeekOf(day)}
                tools={calToggle}
              />
            ))}
          {page === 'tasks' && (
            <div className="tasks-grid">
              <TaskList tasks={openTasks} loading={!got.rank} now={now} plan={plan} subjects={subjects} onDone={doneTask} onEdit={(task) => setSheet({ task })} onLater={laterTask} onDoneList={() => setSheet('done')} />
            </div>
          )}
          {page === 'memo' && <div className="memo-page">{memoCard}</div>}
          {page === 'together' && <TogetherPage key={togetherKey} example={example} now={now} onSnack={(text) => setSnack({ text })} startCreate={togetherStart} onStartUsed={doneTogetherStart} overlay={overlay.on ? overlay.groupId : null} onOverlay={(groupId) => {
                if (toggleOverlay(groupId)) setSnack({ text: '달력에 다 같이 빈 시간을 겹쳐 보여요', actionLabel: '달력 보기', onAction: () => setPage('cal') });
              }} />}
          {page === 'activities' && (
            <ActivitiesPage
              events={allEvents}
              now={now}
              onSnack={(text) => setSnack({ text })}
              onChanged={(what) => (what === 'tasks' ? loadRank() : loadEvents())}
            />
          )}
        </main>

        {/* 정면 창(디자인 ⑤): 뒤를 막고 흐린다. 막을 누르면 '취소'와 같음 */}
        {popup && !popupInFloat && !popupInCenter && <div className="popup-scrim" aria-hidden="true" onClick={cancelPopup} />}
        {popup && !popupInFloat && !popupInCenter && <MemoPopup key={popup.memoId} popup={popup.popup} plan={{ events: planEvents, tasks: openTasks, today, now }} busy={busy} onSave={savePopup} onCancel={cancelPopup} />}
        <Composer onSend={sendMemo} seed={seed} onFloat={canFloat() ? (floatWin ? closeFloat : openFloat) : null} floating={!!floatWin} />
        {floatWin &&
          createPortal(
            popupInFloat ? (
              <FloatPopup win={floatWin} onCancel={cancelPopup}>
                <MemoPopup key={popup.memoId} popup={popup.popup} plan={{ events: planEvents, tasks: openTasks, today, now }} busy={busy} onSave={savePopup} onCancel={cancelPopup} />
              </FloatPopup>
            ) : (
              <FloatMemo onSend={sendMemo} waiting={waiting} pending={popup ? popup.popup?.title || '메모' : null} pendingAt={popupInCenter ? 'center' : 'main'} count={memos.length} note={snack?.text} onHere={popup ? showPopupHere : null} />
            ),
            floatWin.document.body,
          )}
        {popupInCenter &&
          createPortal(
            <FloatPopup win={popWin} onCancel={cancelPopup} mode="center">
              <MemoPopup key={popup.memoId} popup={popup.popup} plan={{ events: planEvents, tasks: openTasks, today, now }} busy={busy} onSave={savePopup} onCancel={cancelPopup} />
            </FloatPopup>,
            popWin.document.body,
          )}
      </div>

      {guide && !join && (
        <GuideSheet
          onClose={() => {
            setGuide(false);
            if (!askedPrefs()) setSheet('start'); // 처음이면 길잡이 뒤에 시작 질문 셋
          }}
        />
      )}
      {sheet === 'inbox' && (
        <InboxSheet
          tasks={openTasks}
          warning={rank.warning}
          onClose={() => setSheet(null)}
          onTask={(task) => setSheet({ act: task })}
          onSnooze={(task) => {
            snoozeTask(task.id, dateKey(addDays(today, 1)));
            setLocalTick((n) => n + 1);
            setSnack({ text: `‘${task.title}’ 내일로 미뤘어요` });
          }}
          onChanged={loadRank}
        />
      )}
      {(sheet === 'me' || sheet === 'start') && <MeSheet start={sheet === 'start'} onClose={() => (setSheet(null), setLocalTick((n) => n + 1))} onDoneList={() => setSheet('done')} onSetup={onOpenSetup} />}
      {sheet?.act && (
        <TaskActSheet
          task={sheet.act}
          slot={sheet.slot}
          fixed={fixedToday[sheet.act.id]}
          now={now}
          focusMin={readPrefs().focus}
          onClose={() => setSheet(null)}
          onPlace={(slot) => placeTask(sheet.act, slot)}
          onFocus={() => {
            const min = readPrefs().focus;
            setFocus({ task: sheet.act, min, end: Date.now() + min * 60000 });
            setSheet(null);
          }}
          onPin={() => {
            pinTask(sheet.act.id);
            setLocalTick((n) => n + 1);
            setSheet(null);
            setSnack({ text: `‘${sheet.act.title}’ 맨 앞으로 당겼어요` });
          }}
          onSnooze={() => {
            const task = sheet.act;
            const n = snoozeTask(task.id, dateKey(addDays(today, 1)));
            setLocalTick((k) => k + 1);
            setSheet(null);
            setSnack({ text: n >= 3 ? `‘${task.title}’ 세 번째 미뤘어요. 안 해도 되면 지워도 돼요` : `‘${task.title}’ 내일로 미뤘어요` });
            tick();
          }}
          onEdit={() => setSheet({ task: sheet.act })}
          onDone={() => {
            const task = sheet.act;
            setSheet(null);
            doneTask(task);
          }}
        />
      )}
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
            <button type="button" onClick={onOpenSetup}>
              캘린더 가져오기 · 학과
              {stateTag(menuState.feeds)}
            </button>
            <button type="button" onClick={() => setSheet('etl')}>
              eTL 연결 · 강의자료
              {stateTag(menuState.etl)}
            </button>
            <button type="button" onClick={() => setSheet('ttw')}>
              TT Wizard 시간표
            </button>
            <button type="button" onClick={() => setSheet('calendar')}>
              구글 캘린더 동기화 · 폰에서 보기
              {stateTag(menuState.gcal)}
            </button>
            <button type="button" onClick={() => setSheet('ai')}>
              AI 앱 연결 (Claude · ChatGPT · Gemini)
            </button>
            {!standalone() && (
              <button type="button" onClick={() => setSheet('install')}>
                홈 화면에 추가
              </button>
            )}
            <button type="button" onClick={() => setSheet('theme')}>
              테마
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                setGuide(true);
              }}
            >
              사용법 보기
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
      {sheet === 'ai' && <AiSheet onClose={() => setSheet(null)} />}
      {sheet === 'ttw' && (
        <TtwSheet
          initialLink={ttwFrom}
          onClose={() => setSheet(null)}
          onSaved={(r) => {
            setSheet(null);
            loadEvents();
            setSnack({ text: `TT Wizard 시간표에서 수업 ${r.classes}개를 넣었어요(일정 ${r.saved}개)` });
          }}
        />
      )}
      {sheet === 'theme' && <ThemeSheet onClose={() => setSheet(null)} />}
      {sheet === 'tidy' && (
        <TidySheet
          onClose={() => setSheet(null)}
          onDone={(text) => {
            setSheet(null);
            setSnack({ text });
            api.listMemos().then((r) => setMemos(r.memos), () => {});
            loadRank();
          }}
        />
      )}
      {sheet === 'delete' && (
        <Sheet title="계정 지우기" onClose={() => setSheet(null)}>
          <DeleteAccount example={example} onDeleted={onDeleted} />
        </Sheet>
      )}
      {sheet === 'etl' && (
        <EtlSheet
          gift={etlGift}
          onClose={() => {
            setSheet(null);
            setEtlGift(null);
          }}
          onChanged={() => {
            loadEvents();
            loadRank();
          }}
        />
      )}
      {/* 일정을 누르면 정보 창부터, '고치기'로 고치는 창(sheet.edit) */}
      {sheet?.event && !sheet.edit && (
        <EventInfoSheet
          event={sheet.event}
          leg={legs.get(sheet.event.id)}
          campus={campus}
          events={allEvents}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ event: sheet.event, edit: true })}
        />
      )}
      {sheet?.event && sheet.edit && (
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
      {sheet?.newEvent && <EventEditSheet event={sheet.newEvent} events={allEvents} onClose={() => setSheet(null)} onSave={addEvent} />}
      {sheet?.task && <TaskEditSheet task={sheet.task} onClose={() => setSheet(null)} onSave={(fields) => saveTask(sheet.task.id, fields)} onDelete={() => deleteTask(sheet.task)} />}
      {snack && <Snackbar {...snack} layer={sheetKey(sheet)} onDone={closeSnack} />}
    </div>
  );
}
