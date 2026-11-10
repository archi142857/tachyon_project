// 8. Tachyon 캘린더 내보내기 (담당: 서버 세션)
//
// 웹만 쓰는 사람이 폰 달력(구글·애플 캘린더)에서 Tachyon 일정과 마감을 '구독'하게 한다(계획 2단계).
//
//   GET /api/calendar                     (로그인) → { url, webcal } 내 구독 주소. 화면은 '복사' 버튼과 함께 보여 준다.
//   GET /api/calendar/<id>.<서명>.ics      (로그인 없이 — 주소 자체가 비밀) → ICS
//   GET /api/calendar/items               (로그인) → { items: [{ key, title, start, end, allDay, place }] } ICS와 같은 줄을 ms 시각으로.
//                                          안드로이드 앱이 폰 안 'Tachyon' 캘린더를 맞출 때 쓴다(web/src/native.js, 11-10 컨셉 — 사람 요청 '달력 자동 동기화')
//
// 들어가는 것
// - 일정: 메모·시간표·eTL 등에서 온 것. 구글·애플·폰 캘린더에서 온 것(source google·apple·device)은 이미 폰에 있어서 뺀다.
// - 할 일: 안 끝낸 것의 마감을 그날 하루 종일 일정으로('마감 23:59 · 과제 이름').
// - 기간: 지난 30일 ~ 앞으로 6개월(수집기와 같음).
// 주소의 서명은 APP_SECRET에서 사람마다 만든다(표가 필요 없다). 주소가 새면 지금은 APP_SECRET을 바꾸는 수밖에 없다
// (모두의 로그인과 구독 주소가 바뀜). 사람마다 바꾸려면 users에 칸을 하나 더해야 한다.

import { deriveKey, b64url, utf8 } from './lib/secret.js';
import { json, fail } from './lib/http.js';
import { kstDate, DAY_MS } from './lib/time.js';
import { logAction } from './lib/log.js';
import { syncWindow } from './2_collect_ics.js';

const SKIP_SOURCES = ['google', 'apple', 'device'];
const SIG_CHARS = 24; // 144비트

export async function handle(request, env, ctx, user) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return fail(405, 'GET만 받아요');

  if (url.pathname === '/api/calendar') {
    if (!user) return fail(401, '로그인이 필요해요');
    const path = `/api/calendar/${user.id}.${await sign(env, user.id)}.ics`;
    ctx?.waitUntil?.(logAction(env, user.id, 'calendar_url'));
    return json({ ok: true, url: `${url.origin}${path}`, webcal: `webcal://${url.host}${path}` });
  }

  if (url.pathname === '/api/calendar/items') {
    if (!user) return fail(401, '로그인이 필요해요');
    return json({ ok: true, items: await calendarItems(env, user.id) });
  }

  const m = /^\/api\/calendar\/(\d+)\.([\w-]+)\.ics$/.exec(url.pathname);
  if (!m) return fail(404, '없는 주소예요');
  const userId = Number(m[1]);
  if (!sameText(m[2], await sign(env, userId))) return fail(404, '없는 주소예요');

  const owner = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!owner) return fail(404, '없는 주소예요');
  const body = await buildCalendar(env, userId);
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=300',
      'content-disposition': 'inline; filename="tachyon.ics"',
    },
  });
}

async function sign(env, userId) {
  const key = await deriveKey(env, 'calendar');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(`calendar:${userId}`)));
  return b64url(mac).slice(0, SIG_CHARS);
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── ICS 만들기 ───────────────────────────────────────────────────

/** 구독 주소와 앱이 같이 쓰는 줄: 내 일정(구글·애플·폰에서 온 것, 옮긴 것 빼고)과 안 끝낸 할 일의 마감, 수집 기간 안 */
async function feedRows(env, userId, now) {
  const window = syncWindow(now);
  const from = kstDate(window.from.getTime());
  const to = kstDate(window.to.getTime());
  const [events, tasks] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, start, "end", place FROM events
        WHERE user_id = ? AND moved_to IS NULL AND source NOT IN (${SKIP_SOURCES.map(() => '?').join(', ')}) AND start >= ? AND start < ?
        ORDER BY start, id LIMIT 3000`,
    )
      .bind(userId, ...SKIP_SOURCES, from, to)
      .all(),
    env.DB.prepare(
      `SELECT id, title, due FROM tasks
        WHERE user_id = ? AND done = 0 AND due IS NOT NULL AND due >= ? AND due < ?
        ORDER BY due, id LIMIT 2000`,
    )
      .bind(userId, from, to)
      .all(),
  ]);
  return { events: events.results, tasks: tasks.results };
}

/** 마감 할 일 → 일정 이름('마감 23:59 · 과제 이름')과 그날 */
function taskLine(t) {
  const time = t.due.length > 10 ? ` ${t.due.slice(11, 16)}` : '';
  return { day: t.due.slice(0, 10), title: `마감${time} · ${t.title}` };
}

export async function buildCalendar(env, userId, now = Date.now()) {
  const { events, tasks } = await feedRows(env, userId, now);
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tachyon//calendar feed//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tachyon',
    'X-WR-TIMEZONE:Asia/Seoul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:event-${e.id}@tachyon`, `DTSTAMP:${stamp}`, ...timeLines(e.start, e.end), `SUMMARY:${escapeText(e.title)}`);
    if (e.place) lines.push(`LOCATION:${escapeText(e.place)}`);
    lines.push('END:VEVENT');
  }
  for (const t of tasks) {
    const { day, title } = taskLine(t);
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t.id}@tachyon`,
      `DTSTAMP:${stamp}`,
      ...timeLines(day, null),
      `SUMMARY:${escapeText(title)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** DB 시각('…+09:00' 또는 종일 '2026-11-13') → DTSTART·DTEND 줄. 시각은 UTC로, 종일은 날짜로. */
function timeLines(start, end) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const endDay = end && /^\d{4}-\d{2}-\d{2}$/.test(end) && end > start ? end : kstDate(Date.parse(`${start}T00:00:00+09:00`) + DAY_MS);
    return [`DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${endDay.replace(/-/g, '')}`];
  }
  const out = [`DTSTART:${utcStamp(Date.parse(start))}`];
  if (end && end > start) out.push(`DTEND:${utcStamp(Date.parse(end))}`);
  return out;
}

const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');

// ── 앱용 목록 (폰 캘린더에 직접 쓰기) ─────────────────────────────

/** 구독 주소(ICS)와 같은 줄을 ms 시각으로. key는 ICS UID의 앞부분('event-12', 'task-5') — 앱이 폰 일정과 짝을 맞춘다 */
export async function calendarItems(env, userId, now = Date.now()) {
  const { events, tasks } = await feedRows(env, userId, now);
  const items = events.map((e) => ({ key: `event-${e.id}`, title: e.title, ...msTimes(e.start, e.end), place: e.place || null }));
  for (const t of tasks) {
    const { day, title } = taskLine(t);
    items.push({ key: `task-${t.id}`, title, ...msTimes(day, null), place: null });
  }
  return items;
}

/** DB 시각 → { start, end, allDay } ms. 종일은 UTC 자정(안드로이드 캘린더의 종일 규칙)이고 끝은 다음 날(ICS와 같음). 끝 시각이 없으면 시작과 같다(ICS도 DTEND 없음) */
export function msTimes(start, end) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const endDay = end && /^\d{4}-\d{2}-\d{2}$/.test(end) && end > start ? end : kstDate(Date.parse(`${start}T00:00:00+09:00`) + DAY_MS);
    return { start: Date.parse(`${start}T00:00:00Z`), end: Date.parse(`${endDay}T00:00:00Z`), allDay: true };
  }
  const from = Date.parse(start);
  return { start: from, end: end && end > start ? Date.parse(end) : from, allDay: false };
}

/** RFC 5545 글 이스케이프: \ ; , 줄바꿈 */
export function escapeText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 한 줄은 75바이트까지, 넘으면 다음 줄을 공백으로 시작한다(한글 한 글자 = 3바이트, 글자를 자르지 않음). */
export function fold(line) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = utf8.encode(ch).length;
    const limit = parts.length ? 74 : 75; // 이어지는 줄은 맨 앞 공백 1바이트
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
