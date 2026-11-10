// 안드로이드 앱(app/) 안에서만 하는 일: 구글 로그인과 폰 캘린더 읽기.
// 앱은 이 사이트를 그대로 띄우고, 폰 기능은 Capacitor가 window.Capacitor.Plugins로 넣어 준다(그래서 화면 쪽에 새 패키지가 없다).
//
// 로그인: 구글은 앱 안 화면(WebView)에서 로그인을 막는다 → 폰 브라우저에서 로그인하고 표(ticket)만 앱으로 받는다.
//   1. 앱이 비밀 글자 v를 만들어 두고, 브라우저로 /api/login?app=<v의 SHA-256> 을 연다
//   2. 로그인이 끝나면 서버가 tachyon://login?ticket=… 으로 보내 앱이 다시 뜬다
//   3. 앱이 /api/login/ticket?t=<표>&v=<v> 로 가면 서버가 로그인 쿠키를 준다 (서버: worker/1_login.js)
// 폰 캘린더: 권한을 받으면 수집 기간의 일정을 통째로 서버에 보낸다 (서버: worker/2_collect_ics.js 폰 캘린더)
import { sendDeviceEvents } from './api.js';

const plugins = () => window.Capacitor?.Plugins;
export const inApp = () => Boolean(plugins()?.Calendar);

const V_KEY = 'tachyon_app_v';
const ASKED_KEY = 'tachyon_calendar_asked';
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
  return sendDeviceEvents(events.map((e) => ({ id: e.id, title: e.title, start: e.startDate, end: e.endDate, allDay: Boolean(e.isAllDay), place: e.location })));
}
