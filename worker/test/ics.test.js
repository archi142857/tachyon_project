// lib/ics.js 시험 (담당: 서버 세션). 일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, prefilter, fingerprint, countIcs, IcsError, wallClockToMs, expandStats, warmUp } from '../lib/ics.js';
import { calendar, vevent } from './ics_fixtures.js';

const range = { from: new Date('2026-10-26T00:00:00Z'), to: new Date('2027-03-09T00:00:00Z') };
const byId = (items) => Object.fromEntries(items.map((it) => [it.extId, it]));

test('매주 반복: 빠진 날(EXDATE)은 빼고 옮긴 날(RECURRENCE-ID)은 옮긴 시각으로', () => {
  const text = calendar(
    vevent([
      'UID:class-1@example',
      'SUMMARY:예시 수업',
      'LOCATION:301동 101호',
      'DTSTART;TZID=Asia/Seoul:20261102T100000',
      'DTEND;TZID=Asia/Seoul:20261102T111500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261216T145959Z',
      'EXDATE;TZID=Asia/Seoul:20261104T100000',
    ]),
    vevent([
      'UID:class-1@example',
      'RECURRENCE-ID;TZID=Asia/Seoul:20261109T100000',
      'SUMMARY:예시 수업(보강)',
      'DTSTART;TZID=Asia/Seoul:20261109T130000',
      'DTEND;TZID=Asia/Seoul:20261109T141500',
    ]),
  );
  const { items } = parseIcs(text, range);
  const got = byId(items);
  assert.equal(items.length, 13); // 11/2 ~ 12/16 월·수 14번 중 11/4 하나 빠짐
  assert.equal(got['class-1@example#20261104T010000Z'], undefined);
  assert.deepEqual(got['class-1@example#20261102T010000Z'], {
    uid: 'class-1@example',
    extId: 'class-1@example#20261102T010000Z',
    title: '예시 수업',
    place: '301동 101호',
    start: '2026-11-02T10:00:00+09:00',
    end: '2026-11-02T11:15:00+09:00',
    allDay: false,
  });
  const moved = got['class-1@example#20261109T010000Z'];
  assert.equal(moved.title, '예시 수업(보강)');
  assert.equal(moved.start, '2026-11-09T13:00:00+09:00');
});

test('옮긴 날의 RECURRENCE-ID가 UTC로 와도 원래 자리를 바꾼다', () => {
  const text = calendar(
    vevent(['UID:w@example', 'SUMMARY:예시 모임', 'DTSTART;TZID=Asia/Seoul:20261103T190000', 'DTEND;TZID=Asia/Seoul:20261103T200000', 'RRULE:FREQ=WEEKLY;COUNT=4']),
    vevent(['UID:w@example', 'RECURRENCE-ID:20261110T100000Z', 'SUMMARY:예시 모임(장소 바뀜)', 'DTSTART;TZID=Asia/Seoul:20261110T200000', 'DTEND;TZID=Asia/Seoul:20261110T210000']),
  );
  const got = byId(parseIcs(text, range).items);
  assert.equal(Object.keys(got).length, 4);
  assert.equal(got['w@example#20261110T100000Z'].title, '예시 모임(장소 바뀜)');
  assert.equal(got['w@example#20261110T100000Z'].start, '2026-11-10T20:00:00+09:00');
});

test('하루 종일: 날짜만, end는 끝난 다음 날', () => {
  const text = calendar(vevent(['UID:allday@example', 'SUMMARY:예시 축제', 'DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261114']));
  const [it] = parseIcs(text, range).items;
  assert.equal(it.allDay, true);
  assert.equal(it.start, '2026-11-12');
  assert.equal(it.end, '2026-11-14');
});

test('eTL 모양: VALUE=DATE에 T000000이 붙고 끝이 시작과 같아도 하루로 본다', () => {
  const text = calendar(
    vevent(['UID:event-assignment-101', 'SUMMARY:예시 과제 [예시 과목]', 'DTSTART;VALUE=DATE:20261112T000000', 'DTEND;VALUE=DATE:20261112T000000']),
    vevent(['UID:event-assignment-102', 'SUMMARY:예시 과제 2 [예시 과목]', 'DTSTART:20261113T055900Z', 'DTEND:20261113T055900Z']),
  );
  const got = byId(parseIcs(text, range).items);
  assert.equal(got['event-assignment-101'].start, '2026-11-12');
  assert.equal(got['event-assignment-101'].end, '2026-11-13');
  assert.equal(got['event-assignment-102'].start, '2026-11-13T14:59:00+09:00');
  assert.equal(got['event-assignment-102'].end, '2026-11-13T14:59:00+09:00');
  assert.deepEqual(countIcs(text, range), { vevents: 2, inRange: 2, assignments: 2, others: 0, allDay: 1 });
});

test('시간대: floating·모르는 이름은 한국, 정의 없는 IANA 이름은 그 시간대로', () => {
  const text = calendar(
    vevent(['UID:floating@example', 'SUMMARY:예시', 'DTSTART:20261114T090000', 'DTEND:20261114T100000']),
    vevent(['UID:windows@example', 'SUMMARY:예시', 'DTSTART;TZID=Korea Standard Time:20261114T090000', 'DTEND;TZID=Korea Standard Time:20261114T100000']),
    vevent(['UID:ny@example', 'SUMMARY:예시', 'DTSTART;TZID=America/New_York:20261114T090000', 'DTEND;TZID=America/New_York:20261114T100000']),
  );
  const got = byId(parseIcs(text, range).items);
  assert.equal(got['floating@example'].start, '2026-11-14T09:00:00+09:00');
  assert.equal(got['windows@example'].start, '2026-11-14T09:00:00+09:00');
  assert.equal(got['ny@example'].start, '2026-11-14T23:00:00+09:00'); // 11월 뉴욕 = UTC-5
  assert.equal(wallClockToMs(2026, 7, 1, 9, 0, 0, 'America/New_York'), Date.parse('2026-07-01T13:00:00Z')); // 서머타임 UTC-4
});

test('취소된 일정과 취소된 한 번은 뺀다', () => {
  const text = calendar(
    vevent(['UID:cancel@example', 'SUMMARY:예시 취소', 'STATUS:CANCELLED', 'DTSTART:20261120T010000Z', 'DTEND:20261120T020000Z']),
    vevent(['UID:s@example', 'SUMMARY:예시 스터디', 'DTSTART;TZID=Asia/Seoul:20261102T200000', 'DTEND;TZID=Asia/Seoul:20261102T210000', 'RRULE:FREQ=WEEKLY;COUNT=3']),
    vevent(['UID:s@example', 'RECURRENCE-ID;TZID=Asia/Seoul:20261109T200000', 'STATUS:CANCELLED', 'SUMMARY:예시 스터디', 'DTSTART;TZID=Asia/Seoul:20261109T200000', 'DTEND;TZID=Asia/Seoul:20261109T210000']),
  );
  const ids = parseIcs(text, range).items.map((it) => it.extId).sort();
  assert.deepEqual(ids, ['s@example#20261102T110000Z', 's@example#20261116T110000Z']);
});

test('원래 일정 없이 옮긴 날만 있으면(한 번만 초대) 단발로 넣는다', () => {
  const text = calendar(
    vevent(['UID:orphan@example', 'RECURRENCE-ID:20261118T050000Z', 'SUMMARY:예시 초대', 'DTSTART:20261118T060000Z', 'DTEND:20261118T070000Z']),
  );
  const [it] = parseIcs(text, range).items;
  assert.equal(it.extId, 'orphan@example#20261118T050000Z');
  assert.equal(it.start, '2026-11-18T15:00:00+09:00');
});

test('기간 밖은 빼고, 해석 전에 글자 수준에서 먼저 거른다', () => {
  const text = calendar(
    vevent(['UID:old@example', 'SUMMARY:예시 옛날', 'DTSTART:20200101T010000Z', 'DTEND:20200101T020000Z']),
    vevent(['UID:far@example', 'SUMMARY:예시 먼 미래', 'DTSTART:20290101T010000Z', 'DTEND:20290101T020000Z']),
    vevent(['UID:ended@example', 'SUMMARY:예시 끝난 반복', 'DTSTART:20200101T010000Z', 'DTEND:20200101T020000Z', 'RRULE:FREQ=WEEKLY;UNTIL=20201231T000000Z']),
    vevent(['UID:now@example', 'SUMMARY:예시 지금', 'DTSTART:20261110T010000Z', 'DTEND:20261110T020000Z']),
    vevent(['UID:long@example', 'SUMMARY:예시 긴 일정', 'DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261231']),
  );
  const pre = prefilter(text, range.from.getTime(), range.to.getTime());
  assert.equal(pre.blocks, 5);
  assert.equal(pre.kept, 2);
  assert.deepEqual(parseIcs(text, range).items.map((it) => it.uid).sort(), ['long@example', 'now@example']);
});

test('오래된 반복을 건너뛰어도(fastForward) 처음부터 걸은 결과와 같다', () => {
  const rules = [
    'FREQ=WEEKLY',
    'FREQ=WEEKLY;INTERVAL=2',
    'FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH',
    'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    'FREQ=DAILY',
    'FREQ=DAILY;INTERVAL=3',
    'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
    'FREQ=WEEKLY;INTERVAL=2;UNTIL=20270101T000000Z',
    'FREQ=MONTHLY;BYMONTHDAY=15',
    'FREQ=YEARLY',
  ];
  const starts = ['20150105T090000', '20180314T183000', '20231231T235500', '20260930T070000'];
  const events = [];
  let n = 0;
  for (const rule of rules) {
    for (const start of starts) {
      n++;
      events.push(
        vevent([`UID:r${n}@example`, `SUMMARY:예시 반복 ${n}`, `DTSTART;TZID=Asia/Seoul:${start}`, `DTEND;TZID=Asia/Seoul:${start.slice(0, 9)}235900`, `RRULE:${rule}`]),
      );
    }
  }
  // 건너뛴 시작점과 겹치는 날을 빼는 EXDATE도 섞는다
  events.push(
    vevent(['UID:ex@example', 'SUMMARY:예시', 'DTSTART;TZID=Asia/Seoul:20150105T090000', 'DTEND;TZID=Asia/Seoul:20150105T100000', 'RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Asia/Seoul:20261012T090000,20261019T090000']),
  );
  const text = calendar(...events);
  const sig = (items) => items.map((it) => `${it.extId}|${it.start}|${it.end}`).sort();
  const fast = parseIcs(text, { ...range, fastForward: true });
  const slow = parseIcs(text, { ...range, fastForward: false, maxSteps: 100000 });
  assert.ok(fast.items.length > 500);
  assert.deepEqual(sig(fast.items), sig(slow.items));
});

test('ICS가 아니면(로그인 화면 등) 알아듣는 오류', () => {
  assert.throws(() => parseIcs('<!doctype html><title>로그인</title>', range), IcsError);
});

test('지문: DTSTAMP만 바뀌면 같고, 제목이 바뀌면 다르다', async () => {
  const a = calendar(vevent(['UID:x@example', 'SUMMARY:예시', 'DTSTART:20261110T010000Z']));
  const b = a.replace('DTSTAMP:20261109T000000Z', 'DTSTAMP:20261109T091500Z');
  const c = a.replace('SUMMARY:예시', 'SUMMARY:예시(바뀜)');
  const fp = async (t) => fingerprint(prefilter(t, range.from.getTime(), range.to.getTime()).calendar);
  assert.equal(await fp(a), await fp(b));
  assert.notEqual(await fp(a), await fp(c));
});

// ── 날짜 셈 길(simpleOccurrences) = ical.js 반복기 길: 무작위 규칙으로 비교 ─────────────

const NEW_YORK_TZ = [
  'BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const p2 = (n) => String(n).padStart(2, '0');
const stamp = (ms, withTime) => {
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
  return withTime ? `${date}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00` : date;
};

/** 지어낸 반복 일정 하나(시드로 늘 같음) */
function randomSeries(i, rnd) {
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const kind = pick(['seoul', 'seoul', 'utc', 'ny', 'floating', 'date']);
  const allDay = kind === 'date';
  // 벽시계 시작(밀리초를 날짜·시각 글자로만 씀): 2024-01 ~ 2027-03
  const startWall = Date.UTC(2024, 0, 1) + Math.floor(rnd() * 1150) * 86400000 + (allDay ? 0 : (Math.floor(rnd() * 24) * 60 + pick([0, 15, 30, 45])) * 60000);
  const fmt = (ms, prop) => {
    if (allDay) return `${prop};VALUE=DATE:${stamp(ms, false)}`;
    if (kind === 'utc') return `${prop}:${stamp(ms, true)}Z`;
    if (kind === 'floating') return `${prop}:${stamp(ms, true)}`;
    return `${prop};TZID=${kind === 'ny' ? 'America/New_York' : 'Asia/Seoul'}:${stamp(ms, true)}`;
  };
  const freq = pick(['WEEKLY', 'WEEKLY', 'WEEKLY', 'WEEKLY', 'DAILY', 'DAILY', 'MONTHLY', 'YEARLY']);
  const interval = pick([1, 1, 1, 2, 3]);
  const dow0 = new Date(startWall).getUTCDay();
  const rule = [`FREQ=${freq}`];
  if (interval > 1) rule.push(`INTERVAL=${interval}`);
  const date0 = new Date(startWall);
  if (freq === 'MONTHLY' && rnd() < 0.3) rule.push(`BYMONTHDAY=${date0.getUTCDate()}`);
  if (freq === 'YEARLY' && rnd() < 0.3) rule.push(`BYMONTH=${date0.getUTCMonth() + 1};BYMONTHDAY=${date0.getUTCDate()}`);
  if (freq === 'MONTHLY' && rule.length === (interval > 1 ? 2 : 1) && rnd() < 0.2) rule.push(`BYDAY=${pick(['1MO', '2TU', '-1FR'])}`); // n번째 요일 → ical.js 길
  if ((freq === 'WEEKLY' || freq === 'DAILY') && rnd() < (freq === 'WEEKLY' ? 0.7 : 0.4)) {
    const days = new Set([dow0]);
    const extra = Math.floor(rnd() * 4);
    for (let k = 0; k < extra; k++) days.add(Math.floor(rnd() * 7));
    rule.push(`BYDAY=${[...days].map((d) => DAYS[d]).join(',')}`);
  }
  if (rnd() < 0.3) rule.push(`WKST=${pick(['SU', 'MO', 'WE'])}`);
  const end = rnd();
  if (end < 0.35) rule.push(`COUNT=${1 + Math.floor(rnd() * 60)}`);
  else if (end < 0.7) {
    const until = startWall + Math.floor(rnd() * 400) * 86400000 + Math.floor(rnd() * 86400) * 1000;
    rule.push(`UNTIL=${allDay ? stamp(until, false) : `${stamp(until, true)}Z`}`);
  }
  const lengthMs = allDay ? (1 + Math.floor(rnd() * 3)) * 86400000 : (30 + Math.floor(rnd() * 150)) * 60000;
  const uid = `rand-${i}@example`;
  const props = [`UID:${uid}`, `SUMMARY:예시 반복 ${i}`, fmt(startWall, 'DTSTART'), fmt(startWall + lengthMs, 'DTEND'), `RRULE:${rule.join(';')}`];
  // 빠진 날: 시작에서 주(또는 날) 단위로 떨어진 자리 몇 개(규칙에 맞지 않는 자리도 섞임)
  const step = { WEEKLY: 7 * interval, DAILY: interval, MONTHLY: 30 * interval, YEARLY: 365 * interval }[freq]; // 매달·매년은 일부러 안 맞는 날도 섞임
  for (let k = Math.floor(rnd() * 4); k > 0; k--) props.push(fmt(startWall + Math.floor(rnd() * 120) * step * 86400000, 'EXDATE'));
  const events = [vevent(props)];
  if (rnd() < 0.25) {
    const original = startWall + Math.floor(rnd() * 60) * step * 86400000;
    events.push(vevent([`UID:${uid}`, fmt(original, 'RECURRENCE-ID'), `SUMMARY:예시 옮긴 날 ${i}`, fmt(original + 2 * 3600000, 'DTSTART'), fmt(original + 2 * 3600000 + lengthMs, 'DTEND')]));
  }
  return events;
}

test('간단한 반복(매주·매일·매달·매년)은 날짜 셈으로 펼쳐도 ical.js 반복기와 결과가 같다(무작위 400개)', () => {
  let seed = 20261109;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const window = { from: new Date('2026-10-10T00:00:00Z'), to: new Date('2027-04-11T00:00:00Z') };
  const sorted = (items) => items.slice().sort((a, b) => (a.extId < b.extId ? -1 : 1));
  const before = { ...expandStats };
  let compared = 0;
  for (let i = 0; i < 400; i++) {
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//예시//EN', ...calendar().split('\r\n').slice(3, -2), ...NEW_YORK_TZ, ...randomSeries(i, rnd).flat(), 'END:VCALENDAR', ''].join('\r\n');
    const fast = parseIcs(text, window).items;
    const slow = parseIcs(text, { ...window, simpleRules: false, fastForward: false, maxSteps: 100000 }).items;
    assert.deepEqual(sorted(fast), sorted(slow), `무작위 일정 ${i}:\n${text}`);
    compared += fast.length;
  }
  const used = expandStats.simple - before.simple;
  assert.ok(used > 250, `날짜 셈 길을 쓴 반복 일정 ${used}개`); // 시간대 없는 시각의 UNTIL 등은 ical.js 길
  assert.ok(compared > 2000, `비교한 일정 ${compared}개`);
});

test('EXDATE: 일정과 안 맞는 EXDATE 바로 뒤의 EXDATE도 뺀다(ical.js 반복기만 쓰면 놓침)', () => {
  const text = calendar(
    vevent([
      'UID:monthly@example',
      'SUMMARY:예시 월례 모임',
      'DTSTART;TZID=Asia/Seoul:20261109T190000',
      'DTEND;TZID=Asia/Seoul:20261109T200000',
      'RRULE:FREQ=MONTHLY;BYDAY=2MO;COUNT=6', // 둘째 월요일: 11/9 12/14 1/11 2/8 3/8 4/12 → 날짜 셈 길이 아닌 ical.js 길
      'EXDATE;TZID=Asia/Seoul:20261210T190000', // 일정과 안 맞는 날(목요일)
      'EXDATE;TZID=Asia/Seoul:20261214T190000',
    ]),
  );
  const before = expandStats.iterator;
  const starts = parseIcs(text, range).items.map((it) => it.start).sort();
  assert.equal(expandStats.iterator, before + 1);
  assert.deepEqual(starts, ['2026-11-09T19:00:00+09:00', '2027-01-11T19:00:00+09:00', '2027-02-08T19:00:00+09:00', '2027-03-08T19:00:00+09:00']);
});

test('ical.js가 못 푸는 반복 규칙 하나 때문에 캘린더 전체를 버리지 않는다', () => {
  const text = calendar(
    vevent(['UID:odd@example', 'SUMMARY:예시 이상한 규칙', 'DTSTART;TZID=Asia/Seoul:20261102T100000', 'DTEND;TZID=Asia/Seoul:20261102T110000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15;BYDAY=1MO']), // ical.js가 던지는 조합
    vevent(['UID:ok@example', 'SUMMARY:예시 보통 일정', 'DTSTART;TZID=Asia/Seoul:20261110T100000', 'DTEND;TZID=Asia/Seoul:20261110T110000']),
  );
  const got = byId(parseIcs(text, range).items);
  assert.equal(got['ok@example'].start, '2026-11-10T10:00:00+09:00');
  assert.equal(got['odd@example'].start, '2026-11-02T10:00:00+09:00'); // 첫 번째 한 번만
  assert.equal(Object.keys(got).length, 2);
});

test('시작할 때 데우기(warmUp)는 예시 캘린더를 날짜 셈 길로 돌리고, 실패해도 던지지 않는다', () => {
  const before = expandStats.simple;
  assert.equal(warmUp(1), true);
  assert.equal(expandStats.simple, before + 2); // 매주 수업 + 매년 생일
});
