// ICS 글 → 일정 목록 (담당: 서버 세션)
//
// - 반복 일정(RRULE·RDATE)은 [from, to) 기간 안에서만 펼친다. 빠진 날(EXDATE)과
//   옮긴 날(RECURRENCE-ID)도 반영한다.
// - 시각은 schema.sql 머리말대로 한국 시간 글자 '2026-11-13T15:00:00+09:00'(lib/time.js).
//   하루 종일 일정은 날짜만 '2026-11-13'이고 end는 ICS처럼 끝난 다음 날이다.
// - 시간대가 없는 시각(floating)이나 모르는 시간대 이름은 한국 시간(Asia/Seoul)으로 본다.
// - 무료 요금제 CPU 한도(요청당 10ms)에 덜 걸리게:
//   1) 기간 밖의 단발 일정은 해석하기 전에 글자 수준에서 버린다(prefilter).
//   2) 거른 글의 지문(fingerprint)이 지난번과 같으면 해석을 건너뛸 수 있다.
//   3) 오래된 매일·매주 반복은 기간 근처로 건너뛰고, 반복마다 같은 값은 한 번만 계산한다.
//   4) 수업·생일처럼 간단한 반복(매주·매일은 BYDAY만, 매달·매년은 같은 날짜, RDATE 없음)은
//      ical.js 반복기 없이 날짜 셈으로 펼친다(simpleOccurrences).
//      ical.js 반복기가 해석 시간의 절반 넘게 쓴다. 결과는 ical.js 길과 같다(시험에서 무작위 규칙으로 비교).

import ICAL from 'ical.js';
import { kstIso, kstDate } from './time.js';

const DAY = 86400000;
const MAX_STEPS = 1000; // 반복 일정 하나를 펼칠 때 최대 걸음 수

export class IcsError extends Error {}

/** 반복 일정을 어느 길로 펼쳤는지 센다(시험에서 날짜 셈 길이 실제로 쓰였는지 본다) */
export const expandStats = { simple: 0, iterator: 0 };

/**
 * ICS 글을 읽어 기간 안의 일정을 돌려준다. (prefilter + expandCalendar)
 * @param {string} text
 * @param {{from: Date, to: Date, timeZone?: string, fastForward?: boolean, simpleRules?: boolean, maxSteps?: number}} range
 *   fastForward·simpleRules·maxSteps는 시험에서 결과를 비교할 때만 바꾼다.
 */
export function parseIcs(text, range) {
  return expandCalendar(prefilter(text, range.from.getTime(), range.to.getTime()), range);
}

/**
 * @returns {{items: Array<{uid:string, extId:string, title:string, place:string,
 *            start:string, end:string, allDay:boolean}>, blocks:number, kept:number}}
 *   start·end: '2026-11-13T15:00:00+09:00', 하루 종일이면 '2026-11-13'(end는 다음 날)
 */
export function expandCalendar(pre, { from, to, timeZone = 'Asia/Seoul', fastForward = true, simpleRules = true, maxSteps = MAX_STEPS }) {
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(pre.calendar));
  } catch (err) {
    throw new IcsError(`ICS를 읽지 못했어요: ${err.message}`);
  }

  const masters = [];
  const exceptions = new Map(); // uid → [옮긴 날 VEVENT]
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const uid = vevent.getFirstPropertyValue('uid');
    if (!uid) continue;
    if (vevent.hasProperty('recurrence-id')) {
      if (!exceptions.has(uid)) exceptions.set(uid, []);
      exceptions.get(uid).push(vevent);
    } else {
      masters.push(new ICAL.Event(vevent));
    }
  }

  const ctx = { fromMs: from.getTime(), toMs: to.getTime(), timeZone, fastForward, simpleRules, maxSteps, out: new Map() };
  const masterUids = new Set();

  for (const event of masters) {
    masterUids.add(event.uid);
    if (event.isRecurring()) {
      for (const ex of exceptions.get(event.uid) || []) event.relateException(ex);
      expandSeries(event, ctx);
    } else {
      emitEvent(ctx, event, event.startDate, event.endDate, null, null);
    }
  }

  // 반복 일정의 한 번만 초대받은 경우: 원래 일정 없이 옮긴 날만 있다 → 단발로 넣는다.
  for (const [uid, list] of exceptions) {
    if (masterUids.has(uid)) continue;
    for (const vevent of list) {
      const event = new ICAL.Event(vevent);
      emitEvent(ctx, event, event.startDate, event.endDate, event.recurrenceId, paramTzid(vevent, 'recurrence-id'));
    }
  }

  return { items: [...ctx.out.values()], blocks: pre.blocks, kept: pre.kept };
}

// 시작할 때(요청 CPU 한도 밖, Worker 전역 실행) 해석 코드를 한 번 돌려 둔다. 처음 요청·Cron의 해석이 반 넘게 빨라진다
// (무료 요금제 CPU 10ms). 지어낸 예시 캘린더: 매주 수업(빠진 날·옮긴 날), 하루 종일, 매년, eTL 모양 과제.
const WARM_UP_ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tachyon//warm-up//KO',
  'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'DTSTART:19700101T000000', 'END:STANDARD', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:warm-1', 'SUMMARY:예시 수업', 'LOCATION:예시', 'DTSTART;TZID=Asia/Seoul:20260302T100000', 'DTEND;TZID=Asia/Seoul:20260302T111500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260619T145959Z', 'EXDATE;TZID=Asia/Seoul:20260304T100000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:warm-1', 'RECURRENCE-ID;TZID=Asia/Seoul:20260309T100000', 'SUMMARY:예시 보강', 'DTSTART;TZID=Asia/Seoul:20260309T130000', 'DTEND;TZID=Asia/Seoul:20260309T141500', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:warm-2', 'SUMMARY:예시 생일', 'DTSTART;VALUE=DATE:20000315', 'DTEND;VALUE=DATE:20000316', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:event-assignment-1', 'SUMMARY:예시 과제', 'DTSTART;VALUE=DATE:20260320T000000', 'DTEND;VALUE=DATE:20260320T000000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:warm-3', 'SUMMARY:예시 시험', 'DTSTART:20260325T010000Z', 'DTEND:20260325T030000Z', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

export function warmUp(rounds = 2) {
  try {
    const range = { from: new Date(Date.UTC(2026, 1, 20)), to: new Date(Date.UTC(2026, 5, 1)) };
    for (let i = 0; i < rounds; i++) parseIcs(WARM_UP_ICS, range);
    return true;
  } catch {
    return false; // 데우기가 실패해도 Worker 시작은 막지 않는다
  }
}

/** 위험 확인용: 내용 없이 개수만 센다. */
export function countIcs(text, range) {
  const { items, blocks } = parseIcs(text, range);
  const assignments = items.filter((it) => isAssignment(it.uid)).length;
  return {
    vevents: blocks,
    inRange: items.length,
    assignments,
    others: items.length - assignments,
    allDay: items.filter((it) => it.allDay).length,
  };
}

/** eTL(Canvas) 캘린더의 과제 UID: event-assignment-123, event-assignment-override-45 */
export function isAssignment(uid) {
  return /^event-assignment-/.test(uid);
}

/** 거른 글의 지문(SHA-256). 받을 때마다 바뀌는 DTSTAMP 줄은 빼고 계산한다. */
export async function fingerprint(calendar) {
  const stable = calendar.replace(/\r?\nDTSTAMP[;:][^\r\n]*/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── 반복 일정 펼치기 ─────────────────────────────────────────────

function expandSeries(event, ctx) {
  const tzid = paramTzid(event.component, 'dtstart');
  const series = describe(event, tzid);
  if (series.cancelled) return;
  const startMs = timeToMs(event.startDate, tzid, ctx.timeZone);
  const endMs = event.endDate ? timeToMs(event.endDate, paramTzid(event.component, 'dtend') || tzid, ctx.timeZone) : startMs;
  const durationMs = fixEnd(series.allDay, startMs, endMs) - startMs;
  // THISANDFUTURE처럼 범위로 바꾼 예외가 있으면 하나씩 정확히 계산한다(느리지만 드묾).
  const slow = event.rangeExceptions && event.rangeExceptions.length > 0;
  // 옮긴 날(예외)의 원래 시각. RECURRENCE-ID가 UTC로 와도 맞추려고 밀리초로 비교한다.
  const movedMs = new Set();
  for (const ex of Object.values(event.exceptions)) {
    movedMs.add(timeToMs(ex.recurrenceId, paramTzid(ex.component, 'recurrence-id') || tzid, ctx.timeZone));
  }

  const stopMs = ctx.toMs + 7 * DAY; // 옮긴 날이 기간 앞으로 당겨진 경우를 위해 한 주 여유
  if (!slow && ctx.simpleRules) {
    let done = false;
    try {
      done = simpleOccurrences(event, tzid, series, durationMs, movedMs, stopMs, ctx);
    } catch {
      dropSeries(ctx, series.uid); // 날짜 셈에서 문제가 나면 ical.js 길로 다시
    }
    if (done) {
      expandStats.simple++;
      return;
    }
  }
  expandStats.iterator++;

  try {
    iterateSeries(event, tzid, series, durationMs, movedMs, stopMs, slow, ctx);
  } catch {
    // ical.js가 못 푸는 규칙(BYDAY와 BYMONTHDAY를 같이 쓴 매달 등): 캘린더 전체를 버리지 않고 이 일정만 첫 번째 한 번으로
    dropSeries(ctx, series.uid);
    emitTimes(ctx, series, startMs, startMs + durationMs, null);
  }
}

/** 반쯤 펼친 반복 일정을 결과에서 지운다 */
function dropSeries(ctx, uid) {
  for (const key of [...ctx.out.keys()]) if (key.startsWith(`${uid}#`)) ctx.out.delete(key);
}

function iterateSeries(event, tzid, series, durationMs, movedMs, stopMs, slow, ctx) {
  const it = event.iterator(ctx.fastForward ? fastForwardStart(event, ctx.fromMs) : undefined);
  const skip = exdates(event.component, ctx);
  let next;
  let steps = 0;
  while ((next = it.next())) {
    if (++steps > ctx.maxSteps) break;
    const ridMs = timeToMs(next, tzid, ctx.timeZone);
    if (ridMs >= stopMs) break;
    // ical.js는 EXDATE를 하나씩만 넘겨서, 일정과 안 맞는 EXDATE 바로 뒤의 EXDATE를 놓칠 때가 있다 → 한 번 더 본다
    if (skip.ms.has(ridMs) || (skip.days.size > 0 && skip.days.has(`${next.year}${pad(next.month)}${pad(next.day)}`))) continue;
    if (slow || movedMs.has(ridMs)) {
      const occ = event.getOccurrenceDetails(next);
      emitEvent(ctx, occ.item, occ.startDate, occ.endDate, next, tzid);
    } else {
      emitTimes(ctx, series, ridMs, ridMs + durationMs, recurrenceKey(next, ridMs));
    }
  }
}

// EXDATE → 밀리초(시각)·날짜 글자(하루 종일 EXDATE는 그날 전체를 뺀다, ical.js와 같음)
function exdates(comp, ctx) {
  const ms = new Set();
  const days = new Set();
  for (const prop of comp.getAllProperties('exdate')) {
    const tzid = prop.getParameter('tzid') || null;
    for (const t of prop.getValues()) {
      if (!t) continue;
      if (t.isDate) days.add(`${t.year}${pad(t.month)}${pad(t.day)}`);
      else ms.add(timeToMs(t, tzid, ctx.timeZone));
    }
  }
  return { ms, days };
}

// ── 간단한 반복(매주·매일·매달·매년): ical.js 반복기 없이 날짜 셈으로 ─────────────
//
// FREQ=WEEKLY|DAILY는 조건이 BYDAY(요일)만, MONTHLY|YEARLY는 DTSTART와 같은 날짜만(BYMONTHDAY·BYMONTH가 있으면 그 값과 같을 때,
// 매달은 28일까지, 매년은 2/29 빼고). INTERVAL·WKST·COUNT·UNTIL·EXDATE 가능. 하나라도 벗어나면 false를 돌려주고
// 원래 길(ical.js 반복기)로 간다: 그 밖의 조건, RDATE, 'n번째 요일', DTSTART 요일이 BYDAY에 없음,
// 날짜·시각 종류가 DTSTART와 다른 UNTIL·EXDATE, VTIMEZONE에만 있는 시간대 이름(Outlook), 시간대 없는 시각의 UNTIL.
// 날짜는 1970-01-01부터의 날 수(벽시계 날짜)로 센다. 시각 바꾸기는 timeToMs와 같은 규칙이다.

const WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const SIMPLE_PARTS = { WEEKLY: ['BYDAY'], DAILY: ['BYDAY'], MONTHLY: ['BYMONTHDAY'], YEARLY: ['BYMONTH', 'BYMONTHDAY'] };
const sameOne = (list, value) => !list || (list.length === 1 && Number(list[0]) === value);
const MAX_SIMPLE_STEPS = 20000; // 날짜 셈 한 걸음은 가벼워서 ical.js보다 넉넉히
const dayOfWeek = (day) => (((day + 4) % 7) + 7) % 7; // 1970-01-01 = 목요일(4), 0 = 일요일

function simpleOccurrences(event, tzid, series, durationMs, movedMs, stopMs, ctx) {
  const comp = event.component;
  const rrules = comp.getAllProperties('rrule');
  if (rrules.length !== 1 || comp.hasProperty('rdate')) return false;
  const rule = rrules[0].getFirstValue();
  const allowed = SIMPLE_PARTS[rule.freq];
  if (!allowed) return false;
  const parts = rule.parts || {};
  for (const key of Object.keys(parts)) if (!allowed.includes(key)) return false;

  const start = event.startDate;
  if (rule.freq === 'MONTHLY' && (start.day > 28 || !sameOne(parts.BYMONTHDAY, start.day))) return false;
  if (rule.freq === 'YEARLY') {
    if (start.month === 2 && start.day === 29) return false;
    if (!sameOne(parts.BYMONTH, start.month) || !sameOne(parts.BYMONTHDAY, start.day)) return false;
  }
  const allDay = start.isDate;
  const zone = start.zone && start.zone.tzid;
  // 시각이 확실한 시간대인지: ical.js 안의 UNTIL·EXDATE 비교와 우리 밀리초 계산이 같은 순간을 가리킬 때만 UNTIL을 받는다
  let wallZone = null;
  let fixed = null;
  let sure = true;
  if (allDay) wallZone = ctx.timeZone;
  else if (zone === 'UTC') fixed = 0;
  else if (validTimeZone(tzid)) {
    wallZone = tzid;
    sure = Boolean(zone && zone !== 'floating'); // TZID는 있는데 VTIMEZONE이 없으면 ical.js는 floating으로 본다
  } else if (zone && zone !== 'floating') return false; // VTIMEZONE에만 있는 이름 → ical.js
  else {
    wallZone = ctx.timeZone;
    sure = false;
  }
  if (wallZone === 'Asia/Seoul') fixed = 9 * 3600000; // wallClockToMs와 같음(서머타임 없음)
  const [h, mi, sec] = allDay ? [0, 0, 0] : [start.hour, start.minute, start.second];
  const tod = ((h * 60 + mi) * 60 + sec) * 1000;
  const wallDate = (day) => {
    const d = new Date(day * DAY);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  };
  const toMs =
    fixed !== null
      ? (day) => day * DAY + tod - fixed
      : (day) => {
          const [y, m, d] = wallDate(day);
          return wallClockToMs(y, m, d, h, mi, sec, wallZone);
        };

  const day0 = Date.UTC(start.year, start.month - 1, start.day) / DAY;
  let weekdays = null;
  if (parts.BYDAY) {
    weekdays = [];
    for (const name of parts.BYDAY) {
      const n = WEEKDAY[name];
      if (n === undefined) return false; // '1MO' 같은 n번째 요일
      if (!weekdays.includes(n)) weekdays.push(n);
    }
    if (!weekdays.includes(dayOfWeek(day0))) return false;
  }

  let untilDay = null;
  let untilMs = null;
  if (rule.until) {
    const u = rule.until;
    if (u.isDate !== allDay) return false;
    if (allDay) untilDay = Date.UTC(u.year, u.month - 1, u.day) / DAY;
    else if (sure && u.zone && u.zone.tzid === 'UTC') untilMs = Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute, u.second);
    else return false;
    if (allDay ? untilDay < day0 : untilMs < toMs(day0)) return false;
  }

  const skipDays = new Set();
  const skipMs = new Set();
  for (const prop of comp.getAllProperties('exdate')) {
    const exTzid = prop.getParameter('tzid') || null;
    for (const t of prop.getValues()) {
      if (!t || t.isDate !== allDay) return false;
      if (allDay) {
        skipDays.add(Date.UTC(t.year, t.month - 1, t.day) / DAY);
        continue;
      }
      const exZone = t.zone && t.zone.tzid;
      if (!sure && !(exZone === zone && exTzid === tzid)) return false; // 시간대 없는 일정은 같은 모양의 EXDATE만
      skipMs.add(timeToMs(t, exTzid, ctx.timeZone));
    }
  }

  const interval = Math.max(1, rule.interval || 1);
  const count = rule.count || 0;
  // 기간 앞쪽 여유: 긴 일정·시간대 차이·옮긴 날(ical.js 길의 14일보다 넉넉히)
  const fromDay = Math.floor((ctx.fromMs - durationMs) / DAY) - 16;

  let n = 0;
  let steps = 0;
  // 한 번(day)을 처리한다. 더 볼 필요가 없으면 false
  const visit = (day) => {
    if (++steps > MAX_SIMPLE_STEPS) return false;
    if (untilDay !== null && day > untilDay) return false;
    const ridMs = toMs(day);
    if (untilMs !== null && ridMs > untilMs) return false;
    if (ridMs >= stopMs) return false;
    if (count && ++n > count) return false; // COUNT는 EXDATE로 뺀 것도 센다(RFC 5545)
    if (allDay ? skipDays.has(day) : skipMs.has(ridMs)) return true;
    if (movedMs.has(ridMs)) {
      const [year, month, date] = wallDate(day);
      const rid = ICAL.Time.fromData({ year, month, day: date, hour: h, minute: mi, second: sec, isDate: allDay }, start.zone);
      const occ = event.getOccurrenceDetails(rid);
      emitEvent(ctx, occ.item, occ.startDate, occ.endDate, rid, tzid);
    } else {
      const key = allDay ? wallDate(day).map((v, i) => (i ? pad(v) : v)).join('') : new Date(ridMs).toISOString().replace(/[-:]|\.\d{3}/g, '');
      emitTimes(ctx, series, ridMs, ridMs + durationMs, key);
    }
    return true;
  };

  if (rule.freq === 'WEEKLY') {
    const wkst = rule.wkst ? (rule.wkst + 6) % 7 : 1; // ical.js: 일요일 = 1 … 토요일 = 7, 기본 월요일
    const offsets = (weekdays || [dayOfWeek(day0)]).map((d) => (d - wkst + 7) % 7).sort((a, b) => a - b);
    const week0 = day0 - ((dayOfWeek(day0) - wkst + 7) % 7);
    let k = 0;
    if (!count) k = Math.max(0, Math.floor((fromDay - week0) / (7 * interval)));
    for (;; k++) {
      const weekStart = week0 + 7 * interval * k;
      for (const off of offsets) {
        const day = weekStart + off;
        if (day < day0) continue;
        if (!visit(day)) return true;
      }
    }
  }
  if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
    const months = rule.freq === 'YEARLY' ? 12 * interval : interval; // 한 걸음에 몇 달
    const month0 = start.year * 12 + (start.month - 1);
    const from = new Date(fromDay * DAY);
    const fromMonth = from.getUTCFullYear() * 12 + from.getUTCMonth() - 1;
    let k = count ? 0 : Math.max(0, Math.floor((fromMonth - month0) / months));
    for (;; k++) {
      const m = month0 + k * months;
      if (!visit(Date.UTC(Math.floor(m / 12), m % 12, start.day) / DAY)) return true;
    }
  }
  let i = count ? 0 : Math.max(0, Math.floor((fromDay - day0) / interval));
  for (;; i++) {
    const day = day0 + i * interval;
    if (weekdays && !weekdays.includes(dayOfWeek(day))) {
      if (++steps > MAX_SIMPLE_STEPS) return true;
      continue;
    }
    if (!visit(day)) return true;
  }
}

// 오래전에 시작해 끝없이 도는 매일·매주 일정은 처음부터 걷지 않고 기간 근처로 건너뛴다.
// 주(7일)·주기(INTERVAL)의 배수만큼만 옮겨서 요일·격주가 그대로 맞는다.
// COUNT·RDATE가 있거나 BYDAY 말고 다른 조건(BYMONTH 등)이 있으면 건너뛰지 않는다.
function fastForwardStart(event, fromMs) {
  const rrules = event.component.getAllProperties('rrule');
  if (rrules.length !== 1 || event.component.hasProperty('rdate')) return undefined;
  const rule = rrules[0].getFirstValue();
  if (rule.count) return undefined;
  if (Object.keys(rule.parts || {}).some((part) => part !== 'BYDAY')) return undefined;
  const interval = rule.interval || 1;
  let step;
  if (rule.freq === 'WEEKLY') step = 7 * interval;
  else if (rule.freq === 'DAILY') step = rule.parts && rule.parts.BYDAY ? 7 * interval : interval; // 요일 조건이 있으면 주 단위로
  else return undefined;
  const start = event.startDate;
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const gapDays = Math.floor((fromMs - 14 * DAY - startMs) / DAY);
  if (gapDays <= step) return undefined;
  const anchor = start.clone();
  anchor.adjust(Math.floor(gapDays / step) * step, 0, 0, 0);
  return anchor;
}

// ── 한 번의 일정 → 결과 한 줄 ────────────────────────────────────

// 일정마다 한 번만 읽으면 되는 값
function describe(event, tzid) {
  const status = event.component.getFirstPropertyValue('status');
  return {
    uid: String(event.uid),
    title: clean(event.summary) || '(제목 없음)',
    place: clean(event.location),
    allDay: event.startDate ? event.startDate.isDate : false,
    cancelled: Boolean(status && String(status).toUpperCase() === 'CANCELLED'),
    tzid,
  };
}

function emitEvent(ctx, event, startDate, endDate, recurrenceId, ridTzid) {
  if (!startDate) return;
  const tzid = paramTzid(event.component, 'dtstart') || ridTzid;
  const info = describe(event, tzid);
  if (info.cancelled) return;
  info.allDay = startDate.isDate;
  const startMs = timeToMs(startDate, tzid, ctx.timeZone);
  const endMs = endDate ? timeToMs(endDate, paramTzid(event.component, 'dtend') || tzid, ctx.timeZone) : startMs;
  const key = recurrenceId ? recurrenceKey(recurrenceId, timeToMs(recurrenceId, ridTzid, ctx.timeZone)) : null;
  emitTimes(ctx, info, startMs, fixEnd(info.allDay, startMs, endMs), key);
}

function emitTimes(ctx, info, startMs, endMs, ridKey) {
  // 기간 [from, to)와 겹치는 것만. 길이가 0인 일정(마감 시각)은 시작이 기간 안이면 넣는다.
  const overlaps = startMs < ctx.toMs && (endMs > ctx.fromMs || (endMs === startMs && startMs >= ctx.fromMs));
  if (!overlaps) return;
  const extId = ridKey ? `${info.uid}#${ridKey}` : info.uid;
  const show = info.allDay ? kstDate : kstIso; // 하루 종일 = 한국 0시 밀리초 → 날짜
  ctx.out.set(extId, {
    uid: info.uid,
    extId,
    title: info.title,
    place: info.place,
    start: show(startMs),
    end: show(endMs),
    allDay: info.allDay,
  });
}

function fixEnd(allDay, startMs, endMs) {
  if (allDay && endMs <= startMs) return startMs + DAY; // eTL은 하루 종일 과제의 끝을 시작과 같게 준다
  return endMs < startMs ? startMs : endMs;
}

// 반복 중 몇 번째인지 나타내는 열쇠: 하루 종일이면 날짜, 아니면 UTC 시각
function recurrenceKey(rid, ridMs) {
  if (rid.isDate) return `${rid.year}${pad(rid.month)}${pad(rid.day)}`;
  return new Date(ridMs).toISOString().replace(/[-:]|\.\d{3}/g, '');
}

function clean(value) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim().slice(0, 500);
}

// ── 시각 바꾸기 ──────────────────────────────────────────────────

function paramTzid(component, name) {
  const prop = component.getFirstProperty(name);
  return prop ? prop.getParameter('tzid') || null : null;
}

/**
 * ICAL.Time → UTC 밀리초.
 * - UTC 시각은 그대로, IANA 이름(Asia/Seoul 등)은 Intl로 계산한다(ICS 안의 VTIMEZONE보다 빠르다).
 * - IANA가 아닌 이름(Outlook의 'Korea Standard Time' 등)은 ICS 안의 VTIMEZONE 정의를 쓰고,
 *   그것도 없거나 floating이면 timeZone(기본 한국)으로 본다. 하루 종일은 그날 timeZone 0시.
 */
export function timeToMs(t, tzid, timeZone) {
  const zone = t.zone && t.zone.tzid;
  if (t.isDate) return wallClockToMs(t.year, t.month, t.day, 0, 0, 0, timeZone);
  if (zone === 'UTC') return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  if (validTimeZone(tzid)) return wallClockToMs(t.year, t.month, t.day, t.hour, t.minute, t.second, tzid);
  if (zone && zone !== 'floating') return t.toUnixTime() * 1000;
  return wallClockToMs(t.year, t.month, t.day, t.hour, t.minute, t.second, timeZone);
}

/** 어떤 시간대의 벽시계 시각 → UTC 밀리초 */
export function wallClockToMs(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (timeZone === 'Asia/Seoul') return guess - 9 * 3600000; // 1988년 뒤로 서머타임 없음
  const off1 = offsetMs(guess, timeZone);
  const ms = guess - off1;
  const off2 = offsetMs(ms, timeZone);
  return off2 === off1 ? ms : guess - off2;
}

const formatters = new Map();
function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function offsetMs(ms, timeZone) {
  const p = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) p[type] = value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const validZones = new Map([['Asia/Seoul', true]]);
function validTimeZone(tz) {
  if (!tz) return false;
  if (!validZones.has(tz)) {
    let ok = true;
    try {
      formatter(tz);
    } catch {
      ok = false;
    }
    validZones.set(tz, ok);
  }
  return validZones.get(tz);
}

const pad = (n) => String(n).padStart(2, '0');

// ── 해석 전에 거르기 ────────────────────────────────────────────

/**
 * VEVENT 덩어리를 잘라, 기간 밖의 단발 일정과 이미 끝난 반복 일정을 버린다.
 * 날짜를 못 읽으면 남긴다(버려서 놓치는 것보다 낫다).
 * @returns {{calendar: string, blocks: number, kept: number}}
 */
export function prefilter(text, fromMs, toMs) {
  const body = assertIcs(text);
  const fromKey = ymd(fromMs - 2 * DAY);
  const toKey = ymd(toMs + 2 * DAY);

  const zones = cutBlocks(body, 'VTIMEZONE');
  const events = cutBlocks(body, 'VEVENT');
  const kept = events.filter((block) => keepBlock(block, fromKey, toKey));

  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tachyon//prefilter//KO', ...zones, ...kept, 'END:VCALENDAR', ''].join('\r\n');
  return { calendar, blocks: events.length, kept: kept.length };
}

/** ICS 글인지(BEGIN:VCALENDAR로 시작하는지) 본다. 아니면 IcsError. 맨 앞 BOM을 뗀 글을 돌려준다. */
export function assertIcs(text) {
  const body = String(text).replace(/^\uFEFF/, '');
  if (!/^\s*BEGIN:VCALENDAR/i.test(body)) {
    throw new IcsError('ICS가 아닌 응답이에요(로그인 화면·오류 페이지일 수 있어요)');
  }
  return body;
}

function cutBlocks(text, name) {
  const begin = `BEGIN:${name}`;
  const end = `END:${name}`;
  const blocks = [];
  let pos = 0;
  for (;;) {
    const a = text.indexOf(begin, pos);
    if (a < 0) break;
    const b = text.indexOf(end, a);
    if (b < 0) break;
    blocks.push(text.slice(a, b + end.length));
    pos = b + end.length;
  }
  return blocks;
}

function keepBlock(block, fromKey, toKey) {
  if (/\n(RRULE|RDATE)[;:]/.test(block)) {
    const until = /UNTIL=(\d{8})/.exec(block.replace(/\r?\n[ \t]/g, ''));
    return !until || until[1] >= fromKey;
  }
  const start = /\nDTSTART[^:\n]*:(\d{8})/.exec(block);
  if (!start) return true;
  const end = /\nDTEND[^:\n]*:(\d{8})/.exec(block);
  const rid = /\nRECURRENCE-ID[^:\n]*:(\d{8})/.exec(block);
  const s = start[1];
  const e = end && end[1] > s ? end[1] : s;
  const inRange = s <= toKey && e >= fromKey;
  // 옮긴 날은 원래 날짜가 기간 안이어도 남긴다(원래 자리를 지워야 하므로)
  return inRange || Boolean(rid && rid[1] >= fromKey && rid[1] <= toKey);
}

function ymd(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
