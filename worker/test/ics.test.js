// lib/ics.js 시험 (담당: 서버 세션). 일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, prefilter, fingerprint, countIcs, IcsError, wallClockToMs } from '../lib/ics.js';
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
