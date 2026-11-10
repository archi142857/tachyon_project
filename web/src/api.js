// 화면이 서버와 주고받는 것은 모두 이 파일을 거친다. 주소와 JSON 모양은 web/API.md에 있다.
// '예시로 둘러보기'(또는 주소 끝 ?example)일 때는 서버 대신 example.js의 지어낸 자료를 쓴다.
// 시각은 schema.sql 머리말대로 '…T15:00:00+09:00', 종일 일정은 날짜만('2026-11-13').
import { examplePopup, makeExample } from './example.js';
import { CROWDED, dueThisWeek, topThree } from './tasks.js';
import { addDays, dayStartKst, isDateOnly, toKstIso, weekStart } from './time.js';

// 웹은 같은 주소(/api/...)로 부른다. 나중에 Capacitor 앱으로 감쌀 때만 VITE_API_BASE에 서버 주소를 넣는다.
const BASE = import.meta.env?.VITE_API_BASE || '';

let ex = null;

export const SIGNED_OUT = 'tachyon:signed-out';

export function startExample(now = new Date()) {
  ex = makeExample(now);
}

export function isExample() {
  return ex !== null;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: BASE ? 'include' : 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    // 5xx는 서버가 스스로 오류를 보고한다. 화면은 한 줄 안내만(서버 문장은 4xx일 때만 그대로)
    const text = res.status >= 500 ? '잠깐 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' : data?.error || (res.status === 401 ? '로그인이 필요해요' : `요청을 처리하지 못했어요 (${res.status})`);
    const error = new Error(text);
    error.status = res.status;
    // 쓰는 도중 로그인이 끝나면(쿠키 30일) 화면 전체가 로그인으로 돌아간다(App.jsx가 듣는다)
    if (res.status === 401 && path !== '/api/login/me') window.dispatchEvent(new CustomEvent(SIGNED_OUT));
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

// 예시 모드: 서버처럼 잠깐 기다렸다가 복사본을 돌려준다
function reply(value, ms = 120) {
  return new Promise((resolve) => setTimeout(() => resolve(value == null ? value : structuredClone(value)), ms));
}

// 종일 일정(날짜만)은 그날 0시~다음 날 0시로 바꿔서 화면이 한 가지 모양만 다루게 한다.
// 끝도 날짜만이면 그날 0시까지(ICS처럼 끝 날짜는 빼고 센다).
export function normalizeEvent(ev) {
  if (!isDateOnly(ev.start)) return ev;
  const start = dayStartKst(ev.start);
  const end = isDateOnly(ev.end) ? dayStartKst(ev.end) : addDays(start, 1);
  return { ...ev, start: toKstIso(start), end: toKstIso(end > start ? end : addDays(start, 1)), all_day: true };
}

// 팝업 칸(날짜·시각) → 일정의 시작·끝. 서버(3_memo_popup.js toStartEnd)와 같은 규칙
export function popupToEvent(f) {
  if (f.time === '?' || !f.time) return { start: f.date, end: null };
  const start = `${f.date}T${f.time}:00+09:00`;
  const end = f.end_time && f.end_time !== '?' && f.end_time > f.time ? `${f.date}T${f.end_time}:00+09:00` : null;
  return { start, end };
}

/* ── 1_login (서버 세션, worker/1_login.js) ── */

export const LOGIN_URL = `${BASE}/api/login?next=/`;

// 실패해서 돌아오면 주소에 ?login_error=denied|state|google|email|config
export function loginErrorText(code) {
  if (!code) return null;
  if (code === 'denied') return '구글 로그인을 그만뒀어요. 다시 해 주세요';
  if (code === 'config') return '로그인 준비가 아직 안 됐어요(서버 설정). 잠시 뒤에 다시 해 주세요';
  return '로그인하지 못했어요. 다시 해 주세요';
}

// 첫 설정을 건너뛰었는지는 이 기기에만 적어 둔다(서버는 학과·학년이 비면 needsSetup = true)
const skipKey = (id) => `tachyon.setup-skipped.${id}`;
function skipped(id) {
  try {
    return localStorage.getItem(skipKey(id)) === '1';
  } catch {
    return false;
  }
}
export function markSetupSkipped(id) {
  if (ex) {
    ex.user.setup_done = true; // 예시 모드는 기기에 남기지 않는다
    return;
  }
  try {
    localStorage.setItem(skipKey(id), '1');
  } catch {
    /* 저장 못 해도 다음에 첫 설정이 한 번 더 뜰 뿐이다 */
  }
}

// → { id, email, name, dept, year, setup_done }
export async function getMe() {
  if (ex) return reply(ex.user);
  const { user, needsSetup } = await call('GET', '/api/login/me');
  return { ...user, setup_done: !needsSetup || skipped(user.id) };
}

export function logout() {
  if (ex) {
    ex = null;
    return reply(null);
  }
  return call('POST', '/api/login/logout');
}

// 학과·학년 저장(서버는 둘 다 있어야 받는다)
// 계정 지우기(서버 1_login.js): { confirm: true }가 있어야 지운다. 내 자료를 모두 지우고 로그인 쿠키도 지운다.
// 예시 모드는 아무것도 보내지 않고 예시만 끝낸다.
export async function deleteAccount() {
  if (ex) {
    ex = null;
    return { ok: true, example: true };
  }
  return call('DELETE', '/api/login/me', { confirm: true });
}

export async function saveProfile({ dept, year }) {
  if (ex) {
    Object.assign(ex.user, { dept, year, setup_done: true });
    return reply(ex.user);
  }
  const { user } = await call('PUT', '/api/login/me', { dept, year });
  return { ...user, setup_done: true };
}

/* ── 2_collect_ics (서버 세션, worker/2_collect_ics.js): 캘린더 주소 ── */

// → [{ kind, set: false } | { kind, set: true, hint: 'myetl.snu.ac.kr/…a1b2', count, okAt, triedAt, error, stopped }]
// 주소 원문은 돌려받지 않는다. stopped면 주소가 죽어서 수집을 멈춘 것(error에 '다시 붙여 주세요' 문장).
export async function getFeeds() {
  if (ex) return reply(ex.feeds);
  return (await call('GET', '/api/feeds')).feeds;
}

// urls: { etl, google, apple } 가운데 바꿀 것만. 값이 null이면 그 주소를 지운다.
// 서버가 붙이자마자 한 번 받아 보고 칸마다 결과를 돌려준다 → { results, feeds }
//   results[] = { kind, ok, saved, tasks, events, count, error, removed }
//   saved: false면 저장 안 됨(모양이 틀리거나 이미 안 열리는 주소) → error를 칸 아래에 그대로 보인다.
export async function saveFeeds(urls) {
  if (ex) {
    // 예시 모드는 주소를 어디에도 보내거나 남기지 않는다
    ex.feeds = ex.feeds.map((f) => (f.kind in urls ? (urls[f.kind] ? { kind: f.kind, set: true, hint: '예시라 저장 안 함', count: null, error: null } : { kind: f.kind, set: false }) : f));
    const results = Object.keys(urls).map((kind) => (urls[kind] ? { kind, ok: true, saved: true, example: true } : { kind, ok: true, saved: false, removed: true }));
    return reply({ results, feeds: ex.feeds }, 400);
  }
  const { results, feeds } = await call('PUT', '/api/feeds', urls);
  return { results, feeds };
}

// 저장된 주소를 지금 다시 받는다(멈춘 주소도 한 번 더). → { results, feeds }
// 안드로이드 앱이 읽은 폰 캘린더 일정을 통째로 보낸다(native.js). → { count, same }
export const sendDeviceEvents = (events) => call('POST', '/api/feeds/device', { events });

export async function collectFeeds() {
  if (ex) return reply({ results: ex.feeds.filter((f) => f.set).map((f) => ({ kind: f.kind, ok: true, example: true })), feeds: ex.feeds }, 400);
  const { results, feeds } = await call('POST', '/api/feeds/collect');
  return { results, feeds };
}

/* ── 7_items (서버 세션, worker/7_items.js): 할 일·일정 읽기·고치기 ── */

// eTL·구글·애플에서 온 것은 그 캘린더가 원본이라 서버가 제목·시각·장소 고치기를 막는다(409).
// 그래도 바꿀 수 있는 칸: 할 일 done·minutes·ready, 일정 important
export const FEED_SOURCES = ['etl', 'google', 'apple', 'device']; // device = 앱이 읽은 폰 캘린더
export const fromFeed = (item) => FEED_SOURCES.includes(item.source);

// 그 주(월요일 0시부터 7일)의 일정. from·to는 한국 날짜, to는 빼고 센다.
export async function getWeekEvents(start) {
  if (ex) {
    const from = new Date(start);
    const to = addDays(start, 7);
    return reply({ events: ex.events.map(normalizeEvent).filter((e) => new Date(e.start) < to && new Date(e.end || e.start) >= from) });
  }
  const day = (d) => toKstIso(d).slice(0, 10);
  const res = await call('GET', `/api/events?from=${day(start)}&to=${day(addDays(start, 7))}`);
  return { events: res.events.map(normalizeEvent) };
}

export function setTaskDone(id, done) {
  if (ex) {
    const task = ex.tasks.find((t) => t.id === id);
    if (task) task.done = done ? 1 : 0;
    return reply(task);
  }
  return call('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { done: done ? 1 : 0 });
}

// 눌러서 고치기: fields = { title, due, minutes, ready } 가운데 바꾼 것 (캘린더에서 온 할 일은 minutes·ready만)
export function updateTask(id, fields) {
  if (ex) {
    const task = ex.tasks.find((t) => t.id === id);
    Object.assign(task, fields);
    return reply(task);
  }
  return call('PATCH', `/api/tasks/${encodeURIComponent(id)}`, fields);
}

// 눌러서 고치기: fields = { important, title, start, end, place } 가운데 바꾼 것 (시각을 모르면 start는 날짜만, end는 null)
export function updateEvent(id, fields) {
  if (ex) {
    const event = ex.events.find((e) => e.id === id);
    Object.assign(event, fields);
    return reply(event);
  }
  return call('PATCH', `/api/events/${encodeURIComponent(id)}`, fields);
}

// 지우기: 메모·시간표에서 온 것만 된다(캘린더에서 온 것은 서버가 409)
export function deleteTask(id) {
  if (ex) {
    ex.tasks = ex.tasks.filter((t) => t.id !== id);
    return reply({ ok: true });
  }
  return call('DELETE', `/api/tasks/${encodeURIComponent(id)}`);
}

export function deleteEvent(id) {
  if (ex) {
    ex.events = ex.events.filter((e) => e.id !== id);
    ex.memos = ex.memos.map((m) => (m.event_id === id ? { ...m, event_id: null } : m));
    return reply({ ok: true });
  }
  return call('DELETE', `/api/events/${encodeURIComponent(id)}`);
}

/* ── 8_calendar_feed (서버 세션, worker/8_calendar_feed.js): 폰 달력에서 구독하는 Tachyon 주소 ── */

// → { url: 'https://…/api/calendar/<id>.<서명>.ics', webcal: 'webcal://…' }. 사람마다 다른 비밀 주소라 어디에도 남기지 않는다.
export function getCalendarFeed() {
  if (ex) return reply({ url: 'https://example.com/api/calendar/0.example.ics', webcal: 'webcal://example.com/api/calendar/0.example.ics', example: true });
  return call('GET', '/api/calendar');
}

// 끝나지 않은 할 일 전체를 여유 적은 순(AI 세션 4_night.js의 순서)으로 + 몰린 주 경고 한 줄 → { tasks, warning }
// 대시보드 '할 일 3개'는 앞 3개, 메뉴의 '할 일 전체'와 달력의 마감 줄도 같은 목록을 쓴다.
// 예시 모드는 1단계 규칙(마감 가까운 순, 이번 주 마감 4개부터 경고)으로 흉내 낸다.
export function getTasks(now = new Date()) {
  if (ex) {
    const tasks = topThree(ex.tasks, Infinity);
    const due = dueThisWeek(ex.tasks, weekStart(now));
    return reply({ tasks, warning: due >= CROWDED ? `이번 주 마감 ${due}개 몰림` : null });
  }
  return call('GET', '/api/tasks');
}

// 끝낸 할 일(끝낸 지 얼마 안 된 순). done_at = 끝낸 시각(기록이 없으면 null) → { tasks }
export function getDoneTasks() {
  if (ex) return reply({ tasks: ex.tasks.filter((t) => t.done).map((t) => ({ done_at: null, ...t })) });
  return call('GET', '/api/tasks?done=1&limit=100');
}

/* ── 3_memo_popup (AI 세션, worker/3_memo_popup.js) ── */

// 최근 메모 50개, 오래된 것부터. event_id가 있으면 팝업으로 일정에 넣은 메모
export function listMemos() {
  return ex ? reply({ memos: ex.memos }) : call('GET', '/api/memo?limit=50');
}

// 메모 하나를 보내고, 일정처럼 보이면 popup { title, date, time, end_time, place, by }를 받는다(모르는 칸 '?').
// AI 때문에 2.5초까지 걸릴 수 있다.
export function sendMemo(text) {
  if (ex) {
    const memo = { id: Date.now(), text, created_at: toKstIso(new Date()), handled: 0, event_id: null };
    ex.memos.push(memo);
    return reply({ memo, popup: examplePopup(text) }, 450);
  }
  return call('POST', '/api/memo', { text });
}

// 팝업 저장. fields = { title, date, time, end_time, place }('?' 그대로), suggested = 받았던 popup.
// 고쳤는지는 서버가 suggested와 견줘 log에 남긴다(팝업 정확도).
export function savePopup(memoId, fields, suggested) {
  if (ex) {
    const event = { id: Date.now(), title: fields.title, ...popupToEvent(fields), place: fields.place === '?' ? null : fields.place, source: 'memo', important: 0 };
    ex.events.push(event);
    const memo = ex.memos.find((m) => m.id === memoId);
    if (memo) Object.assign(memo, { handled: 1, event_id: event.id });
    return reply({ event });
  }
  return call('POST', `/api/memo/${encodeURIComponent(memoId)}/save`, { ...fields, suggested });
}

// 팝업 취소: 메모는 메모로 남고 밤 정리가 읽는다
export function cancelPopup(memoId) {
  if (ex) return reply({ ok: true });
  return call('POST', `/api/memo/${encodeURIComponent(memoId)}/cancel`);
}

/* ── 6_feedback (서버 세션) ── */

// 'Android · 홈 화면 앱 · 412×915' 처럼 짧게. 이름·이메일은 넣지 않는다.
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타';
  const app = window.Capacitor?.isNativePlatform?.() ? '앱' : window.matchMedia('(display-mode: standalone)').matches ? '홈 화면 앱' : '브라우저';
  return `${os} · ${app} · ${window.innerWidth}×${window.innerHeight}`;
}

// 서버(6_feedback.js)가 시각·기기(User-Agent)를 붙인다. 화면은 홈 화면 앱인지·화면 크기를 화면 이름 뒤에 붙인다.
// kind: 'bug'(버그) · 'pain'(불편) · 'idea'(추가) → { ok, issue, url }
export function sendFeedback({ kind, text, screen }) {
  if (ex) return reply({ ok: true, example: true }, 300);
  return call('POST', '/api/feedback', { kind, text, screen: `${screen} · ${deviceLabel()}` });
}

// 화면 오류 자동 보고 → { ok, issue, duplicate }. 같은 오류는 서버도 이슈 하나로 묶는다.
export function reportError({ message, stack, screen }) {
  if (ex) return Promise.resolve(null);
  return call('POST', '/api/feedback/error', { message, stack, screen: `${screen} · ${deviceLabel()}` });
}

/* ── 9_etl (컨셉 세션, worker/9_etl.js) ── */
// eTL API(학생 개인 액세스 토큰, 선택). 토큰은 서버가 잠가 두고 다시 돌려주지 않는다.
// 상태 { ok, connected, last_ok_at, last_error, dead, counts: { notice, file } }. 서버에 표가 아직 없으면 503(준비 중).
export function getEtl() {
  if (ex) return reply({ ok: true, ...ex.etl.status });
  return call('GET', '/api/etl');
}

// 붙여 넣은 토큰 → eTL이 받으면 저장하고 바로 한 번 받는다 → 상태 + result { courses, tasks, notices, files, calendar, ai }
export function connectEtl(token) {
  if (ex) return Promise.reject(new Error('예시에서는 eTL을 연결하지 않아요'));
  return call('PUT', '/api/etl', { token });
}

export function disconnectEtl() {
  if (ex) {
    ex.etl.status = { connected: false };
    return reply({ ok: true, connected: false });
  }
  return call('DELETE', '/api/etl');
}

// 지금 다시 받기(1분 안에 받았으면 건너뜀) → 상태 + result
export function collectEtl() {
  if (ex) return reply({ ok: true, result: { ok: true, recent: true }, ...ex.etl.status });
  return call('POST', '/api/etl/collect');
}

// 강의자료·공지 목록(새 것 먼저) → { notices: [{ id, course, title, url, posted_at, tag }], files: [...] }
export function getEtlItems() {
  if (ex) return reply({ ok: true, notices: ex.etl.notices, files: ex.etl.files });
  return call('GET', '/api/etl/items');
}
