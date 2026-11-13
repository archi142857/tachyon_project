// 안드로이드 앱(app/) 안에서만 하는 일: 구글 로그인, 폰 캘린더 읽기, (켜면) Tachyon 일정을 폰 캘린더에 쓰기.
// 앱은 이 사이트를 그대로 띄우고, 폰 기능은 Capacitor가 window.Capacitor.Plugins로 넣어 준다(그래서 화면 쪽에 새 패키지가 없다).
//
// 로그인: 구글은 앱 안 화면(WebView)에서 로그인을 막는다 → 폰 브라우저에서 로그인하고 표(ticket)만 앱으로 받는다.
//   1. 앱이 비밀 글자 v를 만들어 두고, 브라우저로 /api/login?app=<v의 SHA-256> 을 연다
//   2. 로그인이 끝나면 서버가 tachyon://login?ticket=… 으로 보내 앱이 다시 뜬다
//   3. 앱이 /api/login/ticket?t=<표>&v=<v> 로 가면 서버가 로그인 쿠키를 준다 (서버: worker/1_login.js)
// 폰 캘린더: 권한을 받으면 수집 기간의 일정을 통째로 서버에 보낸다 (서버: worker/2_collect_ics.js 폰 캘린더)
// 폰 캘린더에 쓰기(11-10 컨셉, 사람 요청 "달력도 자동으로 동기화 되게는 못 함?"): '폰 달력에서 보기' 창에서 켜면
//   폰 안에 'Tachyon' 캘린더(이 폰에만 있음)를 만들고, 앱을 열거나 다시 볼 때마다 서버 목록(GET /api/calendar/items —
//   구독 주소와 같은 줄)과 맞춘다. 짝은 폰 일정 메모 칸 끝 줄 'tachyon:event-12'로 찾고, 없어진 것은 지우고 바뀐 것은 지우고 다시 넣는다.
//   폰 → 서버(syncDevice)는 이 캘린더를 뺀다(제자리 돌기 막기). 구독 주소와 달리 몇 시간씩 늦지 않는다.
// 아침 알림(11-14 피드백 '매일 아침 알림'): 서버 푸시 없이 폰이 스스로 띄우는 알림(LocalNotifications). 하루 1번,
//   일어나는 시각(나 → 몇 시에 일어나요) 정각. 앱을 열 때마다 앞으로 7일 치를 다시 잡는다(첫 아침은 지금 할 일 3개, 그 뒤는 짧은 말).
import { getCalendarItems, sendDeviceEvents } from './api.js';
import { readPrefs } from './prefs.js';

const plugins = () => window.Capacitor?.Plugins;
export const inApp = () => Boolean(plugins()?.Calendar);

const V_KEY = 'tachyon_app_v';
const ASKED_KEY = 'tachyon_calendar_asked';
const PUSH_KEY = 'tachyon_push_calendar'; // '1'이면 폰 캘린더에 Tachyon 일정을 쓴다
export const CAL_NAME = 'Tachyon';
const CAL_COLOR = '#3b5bdb';
const DAY_MS = 24 * 60 * 60 * 1000;

export async function appLogin() {
  const v = crypto.randomUUID() + crypto.randomUUID();
  localStorage.setItem(V_KEY, v);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
  const check = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await plugins().Browser.open({ url: `${window.location.origin}/api/login?app=${check}` });
}

/** 브라우저에서 로그인하고 돌아오면(tachyon://login?…) 표를 쿠키로 바꾸러 간다. 앱이 켜질 때 한 번 부른다. */
export function listenAppLogin() {
  plugins().App.addListener('appUrlOpen', ({ url }) => {
    const back = new URL(url).searchParams;
    const v = localStorage.getItem(V_KEY);
    localStorage.removeItem(V_KEY);
    const ticket = back.get('ticket');
    window.location.href = ticket && v ? `/api/login/ticket?t=${encodeURIComponent(ticket)}&v=${v}` : `/?login_error=${back.get('error') || 'state'}`;
  });
}

/**
 * 폰 캘린더 일정을 서버에 보낸다. → { count, same } · 권한이 없으면 null
 * ask: true면 권한을 묻는다. 'once'면 이 폰에서 처음일 때만 묻는다(앱을 열 때).
 */
export async function syncDevice(ask = false) {
  const calendar = plugins().Calendar;
  let { readCalendar } = await calendar.checkPermissions();
  if (readCalendar !== 'granted' && (ask === true || (ask === 'once' && !localStorage.getItem(ASKED_KEY)))) {
    localStorage.setItem(ASKED_KEY, '1');
    ({ readCalendar } = await calendar.requestPermissions({ permissions: ['readCalendar'] }));
  }
  if (readCalendar !== 'granted') return null;
  // 서버 수집 기간(30일 전 ~ 183일 뒤)보다 하루씩 넓게. 넘는 것은 서버가 버린다
  const now = Date.now();
  const { events } = await calendar.findEvents({ startDate: now - 31 * DAY_MS, endDate: now + 184 * DAY_MS });
  const mine = events.filter((e) => e.calendarName !== CAL_NAME); // Tachyon이 써 넣은 일정은 다시 올리지 않는다
  return sendDeviceEvents(mine.map((e) => ({ id: e.id, title: e.title, start: e.startDate, end: e.endDate, allDay: Boolean(e.isAllDay), place: e.location })));
}

// ── 폰 캘린더에 쓰기 ─────────────────────────────────────────

export const pushOn = () => localStorage.getItem(PUSH_KEY) === '1';

/**
 * 앱을 다시 볼 때(뒤에 있다가 앞으로) 폰 'Tachyon' 캘린더를 맞춘다. 5분에 한 번까지.
 * 폰 → 서버(syncDevice)는 지금처럼 앱을 처음 열 때만(서버 읽기 줄이기, 11-10 서버 쪽지).
 */
export function listenAppResume(ready) {
  let last = Date.now();
  plugins().App.addListener('resume', () => {
    if (!ready() || !pushOn() || Date.now() - last < 5 * 60 * 1000) return;
    last = Date.now();
    pushToDevice().catch(() => null);
  });
}

/** 켜기: 읽기·쓰기 권한을 묻고, 되면 바로 한 번 맞춘다 → { added, removed, total } · 권한이 없으면 null */
export async function turnPushOn() {
  const calendar = plugins().Calendar;
  const perm = await calendar.requestPermissions({ permissions: ['readCalendar', 'writeCalendar'] });
  if (perm.readCalendar !== 'granted' || perm.writeCalendar !== 'granted') return null;
  localStorage.setItem(PUSH_KEY, '1');
  return pushToDevice();
}

/** 끄기: 폰의 'Tachyon' 캘린더와 그 안 일정을 지운다(다른 캘린더는 건드리지 않음) */
export async function turnPushOff() {
  localStorage.removeItem(PUSH_KEY);
  const calendar = plugins().Calendar;
  if (await findTachyonCalendar(calendar)) await calendar.deleteCalendar({ name: CAL_NAME });
}

let running = null;
/** 켜져 있으면 폰 'Tachyon' 캘린더를 서버 목록과 맞춘다. 동시에 두 번 돌지 않는다 */
export function pushToDevice() {
  if (!pushOn()) return Promise.resolve(null);
  running ??= runPush().finally(() => {
    running = null;
  });
  return running;
}

async function runPush() {
  const calendar = plugins().Calendar;
  const perm = await calendar.checkPermissions();
  if (perm.readCalendar !== 'granted' || perm.writeCalendar !== 'granted') return null; // 설정에서 권한을 끈 경우: 다시 켜기 전까지 쉼
  const { items } = await getCalendarItems();
  const found = await findTachyonCalendar(calendar);
  const calendarId = found ? found.id : (await calendar.createCalendar({ name: CAL_NAME, color: CAL_COLOR })).id;
  const now = Date.now();
  const { events } = await calendar.findEvents({ startDate: now - 31 * DAY_MS, endDate: now + 184 * DAY_MS, calendarName: CAL_NAME });
  const { add, remove } = planPush(events, items);
  for (const id of remove) await calendar.deleteEvent({ id }).catch(() => {}); // 이미 없으면 넘어간다
  for (const it of add) {
    await calendar.createEvent({
      calendarId,
      title: it.title,
      startDate: it.start,
      endDate: it.end,
      isAllDay: it.allDay,
      ...(it.place ? { location: it.place } : {}),
      notes: `Tachyon에서 넣은 일정이에요. 고치거나 지우려면 Tachyon에서 하세요.\n${TAG}${it.key}`,
    });
  }
  return { added: add.length, removed: remove.length, total: items.length };
}

async function findTachyonCalendar(calendar) {
  const { calendars } = await calendar.listCalendars();
  return calendars.find((c) => c.name === CAL_NAME || c.displayName === CAL_NAME) || null;
}

const TAG = 'tachyon:';
const HALF_DAY = 15 * 60 * 60 * 1000; // 종일 일정은 폰이 그 지역 자정으로 돌려준다(한국 = UTC 자정 - 9시간) → 하루보다 작은 차이는 같은 날

/** 폰 일정 메모 칸 끝 줄의 짝 열쇠('tachyon:event-12' → 'event-12') */
export const pushKey = (notes) => new RegExp(`(?:^|\\n)${TAG}([\\w-]+)\\s*$`).exec(notes || '')?.[1] || null;

/**
 * 폰 'Tachyon' 캘린더 일정(findEvents)과 서버 목록(items) → { add: 넣을 items, remove: 지울 폰 일정 id }.
 * 같은 열쇠가 있고 칸이 같으면 그대로 둔다. 칸이 바뀌었거나, 열쇠가 없거나, 겹친 것은 지우고 다시 넣는다.
 */
export function planPush(phoneEvents, items) {
  const want = new Map(items.map((it) => [it.key, it]));
  const keep = new Set();
  const remove = [];
  for (const e of phoneEvents) {
    const key = pushKey(e.notes);
    const it = key ? want.get(key) : null;
    if (it && !keep.has(key) && sameEvent(e, it)) keep.add(key);
    else remove.push(e.id);
  }
  return { add: items.filter((it) => !keep.has(it.key)), remove: [...new Set(remove)] };
}

function sameEvent(e, it) {
  if (e.title !== it.title || (e.location || null) !== (it.place || null) || Boolean(e.isAllDay) !== it.allDay) return false;
  if (it.allDay) return Math.abs(e.startDate - it.start) < HALF_DAY && Math.abs(e.endDate - it.end) < HALF_DAY;
  return e.startDate === it.start && e.endDate === it.end;
}

// ── 아침 알림 ─────────────────────────────────────────────
const MORNING_KEY = 'tachyon_morning'; // '1'이면 켬
const MORNING_IDS = [1, 2, 3, 4, 5, 6, 7].map((d) => 7000 + d);
export const canMorning = () => Boolean(plugins()?.LocalNotifications); // 새 APK(플러그인 들어간 것)에서만
export const morningOn = () => localStorage.getItem(MORNING_KEY) === '1';

/** 앞으로 7번의 아침(wake시 정각) 알림. 첫 번째만 할 일 이름을 넣는다(그 뒤 날의 할 일은 지금 모름) */
export function morningList(titles, wake, now = new Date()) {
  const first = new Date(now);
  first.setHours(wake, 0, 0, 0);
  if (first <= now) first.setDate(first.getDate() + 1);
  const top = titles.slice(0, 3);
  return MORNING_IDS.map((id, i) => {
    const at = new Date(first);
    at.setDate(first.getDate() + i);
    const body = i === 0 && top.length ? `오늘 할 일: ${top.join(' · ')}` : '오늘 일정과 할 일을 확인해요';
    return { id, title: 'Tachyon 아침', body, schedule: { at, allowWhileIdle: true } };
  });
}

let lastTitles = [];
let lastPlan = '';
/** 켜져 있으면 7일 치를 다시 잡는다. 할 일·시각이 그대로면 건너뜀 */
export async function planMorning(titles = lastTitles) {
  lastTitles = titles;
  const ln = plugins()?.LocalNotifications;
  if (!ln || !morningOn()) return;
  const list = morningList(titles, readPrefs().wake);
  const sign = JSON.stringify(list.map((n) => [n.body, +n.schedule.at]));
  if (sign === lastPlan) return;
  await ln.cancel({ notifications: MORNING_IDS.map((id) => ({ id })) });
  await ln.schedule({ notifications: list });
  lastPlan = sign;
}

/** 켜기: 알림 권한을 묻고 되면 잡는다 → true · 권한이 없으면 false */
export async function turnMorningOn() {
  const { display } = await plugins().LocalNotifications.requestPermissions();
  if (display !== 'granted') return false;
  localStorage.setItem(MORNING_KEY, '1');
  lastPlan = '';
  await planMorning();
  return true;
}

export async function turnMorningOff() {
  localStorage.removeItem(MORNING_KEY);
  lastPlan = '';
  await plugins().LocalNotifications.cancel({ notifications: MORNING_IDS.map((id) => ({ id })) });
}
