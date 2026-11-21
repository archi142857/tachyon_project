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
// 알림(11-14 아침 알림 · 11-16 리마인드 · 11-21 다시 짬): 서버 푸시 없이 폰이 스스로 띄운다(LocalNotifications). 아래 '알림' 칸 머리말.
//   앱을 열 때 · 다시 볼 때 · 할 일·일정을 바꾼 뒤(api.js widgetsChanged) 앞으로 14일 치를 다시 잡는다.
//   ponytail: 다른 기기(PC)에서 바꾼 것은 이 폰에서 앱을 한 번 열어야 잡힌다. 늘 맞아야 하면 서버 푸시(FCM)로.
// eTL · 구글 캘린더 원터치(11-20 사람 "로그인만 하면 나머진 알아서"):
//   eTL — 앱 안 창(app/android-native EtlPlugin.kt)에서 서울대 로그인 → eTL 쪽에서 토큰 · 캘린더 주소를 만들어 옴(etlToken.js grab). 새 APK에서만
//   구글 — 앱 안 화면은 구글이 동의 창을 막으니 폰 브라우저로 2분짜리 표와 함께 열고(worker/12_gcal.js /api/gcal/app), tachyon://gcal?r=… 로 돌아옴
import { gcalAppUrl, getCalendarItems, getReminders, sendDeviceEvents } from './api.js';
import { ETL_ORIGIN, nativeScript } from './etlToken.js';
import { readPrefs } from './prefs.js';

const plugins = () => window.Capacitor?.Plugins;
export const inApp = () => Boolean(plugins()?.Calendar);

export const GCAL_BACK = 'tachyon:gcal';
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

/** eTL 원터치를 이 앱이 할 수 있나(EtlPlugin이 든 APK) */
export const canEtlLogin = () => Boolean(plugins()?.TachyonEtl);

/** 앱 안 창에서 eTL 로그인 → { token, ics } | { error }. 창을 닫으면 reject(code 'closed') */
export const etlLogin = () => plugins().TachyonEtl.open({ url: `${ETL_ORIGIN}/`, script: nativeScript() });

/** 구글 캘린더 연결을 폰 브라우저에서(앱 안 화면은 구글이 막음). 끝나면 tachyon://gcal로 돌아와 /?gcal=… 로 간다 */
export async function gcalInApp() {
  await plugins().Browser.open({ url: await gcalAppUrl() });
}

/** 브라우저에서 로그인하고 돌아오면(tachyon://login?…) 표를 쿠키로 바꾸러 간다. 구글 캘린더 연결(tachyon://gcal?r=…)도 여기로 온다. 앱이 켜질 때 한 번 부른다. */
export function listenAppLogin() {
  plugins().App.addListener('appUrlOpen', ({ url }) => {
    const to = new URL(url);
    if (to.host === 'gcal') {
      plugins().Browser.close?.().catch(() => {}); // 안드로이드는 못 닫을 수 있다(앱이 앞으로 오면 됨)
      // 대시보드가 떠 있으면 화면을 새로 열지 않고 그 자리에서 알린다(11-21). 아니면(첫 설정 등) 지금처럼 /?gcal=…로
      const r = to.searchParams.get('r') || 'state';
      if (window.dispatchEvent(new CustomEvent(GCAL_BACK, { detail: r, cancelable: true }))) window.location.href = `/?gcal=${encodeURIComponent(r)}`;
      return;
    }
    const back = to.searchParams;
    const v = localStorage.getItem(V_KEY);
    localStorage.removeItem(V_KEY);
    const ticket = back.get('ticket');
    window.location.href = ticket && v ? `/api/login/ticket?t=${encodeURIComponent(ticket)}&v=${v}` : `/?login_error=${back.get('error') || 'state'}`;
  });
}

/**
 * 폰 캘린더 일정을 서버에 보낸다. → { count, same } · 권한이 없으면 null
 * ask: true면 권한을 묻는다. 'once'면 이 폰에서 처음일 때만 묻는다(앱을 열 때).
 * ifChanged: 마지막으로 올린 목록과 같으면 안 올리고 null(앱으로 돌아올 때마다 부른다 — 11-21 사람 "캘린더 수정하면 자동으로 반영")
 */
let sent = null;
export async function syncDevice(ask = false, ifChanged = false) {
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
  const list = mine.map((e) => ({ id: e.id, title: e.title, start: e.startDate, end: e.endDate, allDay: Boolean(e.isAllDay), place: e.location }));
  const sig = JSON.stringify(list);
  if (ifChanged && sig === sent) return null;
  const out = await sendDeviceEvents(list);
  sent = sig;
  return out;
}

// ── 폰 캘린더에 쓰기 ─────────────────────────────────────────

export const pushOn = () => localStorage.getItem(PUSH_KEY) === '1';

/**
 * 앱을 다시 볼 때(뒤에 있다가 앞으로) 폰 'Tachyon' 캘린더를 맞춘다. 5분에 한 번까지.
 * 폰 → 서버(syncDevice)는 앱을 열 때 + 돌아올 때 바뀐 것이 있으면(Dashboard.jsx back, 11-21).
 */
export function listenAppResume(ready) {
  let last = Date.now();
  plugins().App.addListener('resume', () => {
    if (!ready() || Date.now() - last < 5 * 60 * 1000) return;
    last = Date.now();
    if (pushOn()) pushToDevice().catch(() => null);
    planReminders().catch(() => null);
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

// ── 알림(11-21 다시 짬: 사람 "귀찮지 않으면서, 필요한 알림 … 알림만 보고도 필요한 일들을 잘 처리할 수 있는 정도") ──────
// 셋 다 서버 한 번(GET /api/reminders)으로 받아 폰이 스스로 띄운다(LocalNotifications, 서버 푸시 없음):
//   아침 브리핑(켠 폰만, 번호 7001~7007) — 그날 일정 · 마감 · 밀린 일을 제목과 한 줄로. 아무것도 없는 날은 안 온다
//   리마인드(손으로 켠 일정 · 할 일, 번호 10000~) — '선형대수 · 30분 뒤' / '10:00–11:15 · 25동 207호'
//   마감 임박(자동, 처음엔 켬, '내 설정'에서 끔) — 리마인드를 안 건 할 일도 마감 3시간 전 한 번. 하루 2번까지 · 23시~일어나는 시각엔 안 울림
// 알림을 누르면 그 일정 · 할 일이 열리고, 할 일 알림의 단추 완료 · 1시간 뒤 · 내일 아침은 앱이 열리며 바로 된다(Dashboard.jsx).
// ponytail: 단추를 눌러도 앱이 열린다(앱을 안 열고 끝내려면 Kotlin 수신기). 정확한 시각 알람 권한은 새 APK부터(없으면 몇 분 늦을 수 있다)
const MORNING_KEY = 'tachyon_morning'; // '1'이면 켬
const DUE_KEY = 'tachyon_due_soon'; // '0'이면 끔(처음엔 켬)
const MORNING_IDS = [1, 2, 3, 4, 5, 6, 7].map((d) => 7000 + d);
const SNOOZE_FROM = 8000; // 알림 단추로 미룬 것(8000~8999, 이 폰에만)
const REMIND_FROM = 9000; // 서버가 주는 번호(묶음 9001~, 일정 10000 + 2·id, 할 일 10001 + 2·id)
export const canMorning = () => Boolean(plugins()?.LocalNotifications); // 새 APK(플러그인 들어간 것)에서만
export const morningOn = () => localStorage.getItem(MORNING_KEY) === '1';
export const dueSoonOn = () => localStorage.getItem(DUE_KEY) !== '0';

/** 아침 브리핑 알림: 서버가 준 날마다의 글(mornings)을 wake시 정각(한국 시각)에. 지난 아침은 빼고 7번까지 */
export function morningList(mornings, wake, now = new Date()) {
  return mornings
    .map((m) => ({ m, at: new Date(`${m.date}T${String(wake).padStart(2, '0')}:00:00+09:00`) }))
    .filter(({ at }) => at > now)
    .slice(0, MORNING_IDS.length)
    .map(({ m, at }, i) => ({ id: MORNING_IDS[i], title: m.title, body: m.body, largeBody: m.large, schedule: { at, allowWhileIdle: true }, extra: { kind: 'morning' } }));
}

// 채널(폰 설정에서 종류별로 끌 수 있게) · 할 일 알림 단추. 한 번만. 안 되면(옛 플러그인) 채널 · 단추 없이 지금처럼 띄운다
let rich = null;
function notifySetup(ln) {
  rich ??= (async () => {
    try {
      await ln.createChannel({ id: 'remind', name: '일정 · 마감 알림', description: '리마인드와 마감 임박', importance: 4 });
      await ln.createChannel({ id: 'morning', name: '아침 브리핑', description: '하루 한 번, 오늘 일정과 마감', importance: 3 });
      await ln.registerActionTypes({ types: [{ id: 'task', actions: [{ id: 'done', title: '완료' }, { id: 'later', title: '1시간 뒤' }, { id: 'tomorrow', title: '내일 아침' }] }] });
      return true;
    } catch {
      return false;
    }
  })();
  return rich;
}

let lastRemind = '';
let reminding = null;
let again = false;

/** 알림 다시 잡기(아침 브리핑 · 리마인드 · 마감 임박). 앱 밖(브라우저)·예전 APK에서는 아무것도 안 한다. 도는 중에 또 부르면 끝난 뒤 한 번 더 */
export function planReminders() {
  if (!plugins()?.LocalNotifications) return Promise.resolve();
  if (reminding) {
    again = true;
    return reminding;
  }
  reminding = runReminders().finally(() => {
    reminding = null;
    if (again) {
      again = false;
      planReminders().catch(() => null);
    }
  });
  return reminding;
}
/** 일어나는 시각 · 켜고 끄기가 바뀐 뒤 다시 잡기 */
export const planMorning = () => {
  lastRemind = '';
  return planReminders();
};

async function runReminders() {
  const ln = plugins().LocalNotifications;
  let { display } = await ln.checkPermissions();
  const [morning, wake] = [morningOn(), readPrefs().wake];
  // 자동(마감 임박)은 이미 알림을 허락한 폰에만 — 처음 여는 사람에게 까닭 없이 권한을 묻지 않는다
  const { reminders, mornings = [] } = await getReminders({ auto: dueSoonOn() && display === 'granted', morning, wake });
  const sign = JSON.stringify([reminders, mornings, wake]);
  if (sign === lastRemind) return;
  if (reminders.length && display !== 'granted' && display !== 'denied') ({ display } = await ln.requestPermissions()); // 손으로 켠 리마인드가 있을 때만 묻는다
  if (display !== 'granted') return;
  const ok = await notifySetup(ln);
  const { notifications } = await ln.getPending();
  const old = notifications.filter((n) => n.id >= REMIND_FROM || MORNING_IDS.includes(n.id)).map((n) => ({ id: n.id }));
  if (old.length) await ln.cancel({ notifications: old });
  const list = [
    ...reminders.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.at), allowWhileIdle: true },
      extra: { kind: r.kind, ref: r.ref },
      ...(ok ? { channelId: 'remind', ...(r.kind === 'task' ? { actionTypeId: 'task' } : {}) } : {}),
    })),
    ...(morning ? morningList(mornings, wake).map((n) => (ok ? { ...n, channelId: 'morning' } : n)) : []),
  ];
  if (list.length) await ln.schedule({ notifications: list });
  lastRemind = sign;
}

/** 알림 권한을 묻는다 → 허락됐는지 */
async function askNotify() {
  const { display } = await plugins().LocalNotifications.requestPermissions();
  return display === 'granted';
}

/** 아침 브리핑 켜기: 알림 권한을 묻고 되면 잡는다 → true · 권한이 없으면 false */
export async function turnMorningOn() {
  if (!(await askNotify())) return false;
  localStorage.setItem(MORNING_KEY, '1');
  await planMorning();
  return true;
}

export async function turnMorningOff() {
  localStorage.removeItem(MORNING_KEY);
  lastRemind = '';
  await plugins().LocalNotifications.cancel({ notifications: MORNING_IDS.map((id) => ({ id })) });
}

/** 마감 임박 알림 켜고 끄기 → 켜졌는지(권한이 없으면 false) */
export async function turnDueSoon(on) {
  if (on && !(await askNotify())) return false;
  localStorage.setItem(DUE_KEY, on ? '1' : '0');
  await planMorning().catch(() => null);
  return on;
}
/** 마감 임박이 실제로 울릴 수 있나(켜져 있고 알림 권한이 있음) · 아직 안 물어본 폰인가 */
export async function notifyState() {
  const ln = plugins()?.LocalNotifications;
  if (!ln) return null;
  return (await ln.checkPermissions()).display; // 'granted' | 'denied' | 'prompt…'
}

// 눌린 알림: 대시보드가 가져갈 때까지 둔다(앱이 꺼져 있다가 알림으로 켜지면 대시보드보다 먼저 온다)
export const NOTIFY_TAP = 'tachyon:notify';
let tapped = null;
export function listenNotify() {
  plugins()?.LocalNotifications?.addListener?.('localNotificationActionPerformed', ({ actionId, notification }) => {
    tapped = { action: actionId, id: notification.id, ...(notification.extra || {}) };
    window.dispatchEvent(new CustomEvent(NOTIFY_TAP));
  });
}
export const takeNotify = () => {
  const t = tapped;
  tapped = null;
  return t;
};

/** 알림 단추 '1시간 뒤' · '내일 아침': 그때 한 번 더(이 폰에만). 글은 그때도 맞게 부른 쪽이 준다 */
export async function snoozeNotify({ id, kind, ref, title, body }, at) {
  const ln = plugins()?.LocalNotifications;
  if (!ln) return;
  const ok = await notifySetup(ln);
  await ln.schedule({ notifications: [{ id: SNOOZE_FROM + (id % 1000), title, body, schedule: { at, allowWhileIdle: true }, extra: { kind, ref }, ...(ok ? { channelId: 'remind', actionTypeId: 'task' } : {}) }] });
}

/** 로그아웃 · 계정 지우기: 잡아 둔 알림을 모두 지운다(다음 사람 폰에 앞사람 일정이 울리지 않게) */
export async function clearNotify() {
  const ln = plugins()?.LocalNotifications;
  if (!ln) return;
  lastRemind = '';
  const { notifications } = await ln.getPending();
  if (notifications.length) await ln.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
}

// ── 뒤로 단추 · 손끝 떨림 ─────────────────────────────────────────
export const BACK = 'tachyon:back';
/** 안드로이드 뒤로 단추: 열린 창을 닫고 → (대시보드가) 팝업을 닫거나 첫 쪽으로 → 더 갈 데가 없으면 앱을 내린다 */
export function listenBack() {
  plugins().App.addListener('backButton', () => {
    const open = [...document.querySelectorAll('dialog[open]')].pop();
    if (open) return void open.dispatchEvent(new Event('cancel', { cancelable: true }));
    if (!window.dispatchEvent(new CustomEvent(BACK, { cancelable: true }))) return; // 화면이 받아 처리했다(preventDefault)
    plugins().App.minimizeApp?.();
  });
}

/** 끝내기 · 저장 · 옮기기에 짧은 떨림(되는 폰만. 앱은 VIBRATE 권한이 든 새 APK부터) */
export const tick = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* 막힌 브라우저 */
  }
};
