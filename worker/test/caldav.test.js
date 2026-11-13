// lib/caldav.js(네이버 캘린더 CalDAV 읽기)와 2_collect_ics.js의 naver 칸 시험 (담당: 컨셉 세션 11-13).
// 아이디·비밀번호·일정은 모두 지어낸 예시이고, 네이버 서버 대신 가짜 CalDAV 서버(아래 fakeNaver)를 쓴다.
// 가짜 서버의 답은 RFC 4791 모양 그대로다(접두어·주소 모양은 서버마다 달라서 일부러 섞었다).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { calendar, vevent } from './ics_fixtures.js';
import { fetchCalDav, CalDavError, calendarQuery, davTime, calendarsIn, calendarDataIn, mergeCalendars, hrefIn, NAVER_CALDAV } from '../lib/caldav.js';
import { handle, normalizeNaver, collectDue } from '../2_collect_ics.js';
import { expandCalendar, prefilter } from '../lib/ics.js';

const NOW = Date.parse('2026-11-13T05:00:00Z'); // 한국 14:00
const ID = 'exampleuser';
const PW = 'EXAMPLEAPPPW1234';
const FROM = new Date('2026-10-13T15:00:00Z');
const TO = new Date('2027-05-14T15:00:00Z');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function eventsCalendar() {
  return calendar(
    vevent(['UID:naver-lab@example', 'SUMMARY:예시 실험 & 정리', 'LOCATION:예시 500동', 'DTSTART;TZID=Asia/Seoul:20261116T140000', 'DTEND;TZID=Asia/Seoul:20261116T160000']),
    vevent(['UID:naver-club@example', 'SUMMARY:예시 동아리', 'DTSTART;TZID=Asia/Seoul:20261118T190000', 'DTEND;TZID=Asia/Seoul:20261118T210000', 'RRULE:FREQ=WEEKLY;COUNT=3']),
  );
}
function birthdayCalendar() {
  return calendar(vevent(['UID:naver-bday@example', 'SUMMARY:예시 생일', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202']));
}

/**
 * 가짜 네이버 CalDAV 서버. opts로 실패를 흉내 낸다.
 * calls에 [method, path, depth, auth] 를 쌓는다.
 */
function fakeNaver({ password = PW, noTimeRange = false, calendarsDown = [] } = {}) {
  const calls = [];
  const good = `Basic ${btoa(`${ID}:${password}`)}`;
  const xml = (status, body) => new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { status, headers: { 'content-type': 'application/xml; charset=utf-8' } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const headers = new Headers(init.headers);
    calls.push([method, u.pathname, headers.get('depth'), headers.get('authorization') === good ? 'ok' : 'bad', String(init.body || '')]);
    if (headers.get('authorization') !== good) return new Response('Unauthorized', { status: 401 });
    if (method === 'PROPFIND' && u.pathname === '/') {
      return xml(207, `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/principals/users/${ID}/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
    }
    if (method === 'PROPFIND' && u.pathname === `/principals/users/${ID}/`) {
      return xml(207, `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:href>/principals/users/${ID}/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>https://caldav.calendar.naver.com/caldav/${ID}/calendar/</D:href></C:calendar-home-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
    }
    if (method === 'PROPFIND' && u.pathname === `/caldav/${ID}/calendar/`) {
      assert.equal(headers.get('depth'), '1');
      return xml(
        207,
        `<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">` +
          `<response><href>/caldav/${ID}/calendar/</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>` +
          `<response><href>/caldav/${ID}/calendar/1001/</href><propstat><prop><resourcetype><collection/><cal:calendar/></resourcetype><displayname>내 캘린더</displayname>` +
          `<cal:supported-calendar-component-set><cal:comp name="VEVENT"/><cal:comp name="VTODO"/></cal:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>` +
          `<response><href>/caldav/${ID}/calendar/1002/</href><propstat><prop><resourcetype><collection/><cal:calendar/></resourcetype><displayname>기념일</displayname></prop><status>HTTP/1.1 200 OK</status></propstat></response>` +
          `<response><href>/caldav/${ID}/calendar/todo/</href><propstat><prop><resourcetype><collection/><cal:calendar/></resourcetype><displayname>할 일</displayname>` +
          `<cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response>` +
          `</multistatus>`,
      );
    }
    if (method === 'REPORT') {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (calendarsDown.includes(id)) return new Response('oops', { status: 500 });
      if (noTimeRange && String(init.body).includes('time-range')) return new Response('time-range not supported', { status: 400 });
      const data = id === '1001' ? eventsCalendar() : birthdayCalendar();
      // 하나는 글자 탈출(&lt;)로, 하나는 CDATA로 준다
      const payload = id === '1001' ? esc(data) : `<![CDATA[${data}]]>`;
      return xml(207, `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${u.pathname}x.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag><c:calendar-data>${payload}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('davTime·calendarQuery: UTC 시각과 기간 거르기', () => {
  assert.equal(davTime(FROM), '20261013T150000Z');
  const q = calendarQuery(FROM, TO);
  assert.match(q, /<c:time-range start="20261013T150000Z" end="20270514T150000Z"\/>/);
  assert.match(q, /comp-filter name="VEVENT"/);
  assert.doesNotMatch(calendarQuery(null, null), /time-range/);
});

test('XML 읽기: 접두어가 달라도 주소·캘린더·일정 글을 찾는다', () => {
  const principal = '<x:multistatus xmlns:x="DAV:"><x:response><x:propstat><x:prop><x:current-user-principal><x:href>/p/me/</x:href></x:current-user-principal></x:prop></x:propstat></x:response></x:multistatus>';
  assert.equal(hrefIn(principal, 'current-user-principal', 'https://dav.example.invalid/'), 'https://dav.example.invalid/p/me/');
  const list = '<multistatus xmlns="DAV:"><response><href>/c/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>' +
    '<response><href>/c/a/</href><propstat><prop><resourcetype><collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response></multistatus>';
  assert.deepEqual(calendarsIn(list, 'https://dav.example.invalid/c/'), ['https://dav.example.invalid/c/a/']);
  const data = `<d:multistatus xmlns:d="DAV:"><d:response><c:calendar-data xmlns:c="urn:ietf:params:xml:ns:caldav">${esc(eventsCalendar())}</c:calendar-data></d:response></d:multistatus>`;
  const [one] = calendarDataIn(data);
  assert.match(one, /SUMMARY:예시 실험 & 정리/); // &amp; → &
  assert.match(one, /^BEGIN:VCALENDAR/);
});

test('mergeCalendars: VTIMEZONE은 하나만, VEVENT는 모두 → lib/ics가 그대로 펼친다', () => {
  const zone = 'BEGIN:VTIMEZONE\nTZID:Asia/Seoul\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0900\nTZOFFSETTO:+0900\nEND:STANDARD\nEND:VTIMEZONE';
  const a = eventsCalendar().replace('BEGIN:VEVENT', `${zone}\r\nBEGIN:VEVENT`);
  const b = birthdayCalendar().replace('BEGIN:VEVENT', `${zone}\r\nBEGIN:VEVENT`);
  const merged = mergeCalendars([a, b]);
  assert.equal(merged.match(/BEGIN:VTIMEZONE/g).length, 1);
  assert.equal(merged.match(/BEGIN:VEVENT/g).length, 3);
  assert.ok(merged.startsWith('BEGIN:VCALENDAR\r\n') && merged.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(merged, /[^\r]\n/); // 줄 끝은 모두 CRLF
  const window = { from: FROM, to: TO };
  const { items } = expandCalendar(prefilter(merged, FROM.getTime(), TO.getTime()), window);
  assert.deepEqual(items.map((i) => i.title).sort(), ['예시 동아리', '예시 동아리', '예시 동아리', '예시 생일', '예시 실험 & 정리']);
});

test('fetchCalDav: 사람 주소 → 캘린더 집 → 일정 캘린더 둘(할 일 캘린더는 뺌) → 기간 안 일정', async () => {
  const { fetchImpl, calls } = fakeNaver();
  const { text, calendars } = await fetchCalDav({ user: ID, password: PW, from: FROM, to: TO, fetchImpl });
  assert.equal(calendars, 2);
  assert.equal(text.match(/BEGIN:VEVENT/g).length, 3);
  assert.deepEqual(
    calls.map(([m, p, d]) => `${m} ${p} ${d}`),
    ['PROPFIND / 0', `PROPFIND /principals/users/${ID}/ 0`, `PROPFIND /caldav/${ID}/calendar/ 1`, `REPORT /caldav/${ID}/calendar/1001/ 1`, `REPORT /caldav/${ID}/calendar/1002/ 1`],
  );
  assert.ok(calls.every((c) => c[3] === 'ok'));
  assert.ok(calls.filter((c) => c[0] === 'REPORT').every((c) => c[4].includes('time-range')));
  assert.equal(NAVER_CALDAV, 'https://caldav.calendar.naver.com/');
});

test('fetchCalDav: 비밀번호가 틀리면 auth 오류(다시 넣어야 함), 문장에 아이디·비밀번호가 없다', async () => {
  const { fetchImpl } = fakeNaver({ password: 'OTHERPASSWORD99' });
  await assert.rejects(fetchCalDav({ user: ID, password: PW, from: FROM, to: TO, fetchImpl }), (err) => {
    assert.ok(err instanceof CalDavError);
    assert.equal(err.auth, true);
    assert.equal(err.permanent, true);
    assert.ok(!err.message.includes(ID) && !err.message.includes(PW));
    return true;
  });
});

test('fetchCalDav: 기간 거르기를 못 하는 서버면 거르기 없이 다시, 한 캘린더가 고장 나도 나머지는 받는다', async () => {
  const a = fakeNaver({ noTimeRange: true });
  const r1 = await fetchCalDav({ user: ID, password: PW, from: FROM, to: TO, fetchImpl: a.fetchImpl });
  assert.equal(r1.text.match(/BEGIN:VEVENT/g).length, 3);
  assert.equal(a.calls.filter((c) => c[0] === 'REPORT').length, 4); // 캘린더마다 두 번

  const b = fakeNaver({ calendarsDown: ['1002'] });
  const r2 = await fetchCalDav({ user: ID, password: PW, from: FROM, to: TO, fetchImpl: b.fetchImpl });
  assert.equal(r2.text.match(/BEGIN:VEVENT/g).length, 2);

  const c = fakeNaver({ calendarsDown: ['1001', '1002'] });
  await assert.rejects(fetchCalDav({ user: ID, password: PW, from: FROM, to: TO, fetchImpl: c.fetchImpl }), /받지 못했어요/);
});

test('normalizeNaver: 아이디는 @naver.com 앞부분, 로그인 비밀번호 같은 짧은 글은 받지 않는다', () => {
  assert.deepEqual(normalizeNaver({ id: ' ExampleUser@naver.com ', password: 'EXAM PLEA PPPW 1234' }), { id: 'exampleuser', password: 'EXAMPLEAPPPW1234' });
  assert.throws(() => normalizeNaver({ id: '', password: PW }), /아이디/);
  assert.throws(() => normalizeNaver({ id: 'a b', password: PW }), /아이디/);
  assert.throws(() => normalizeNaver({ id: ID, password: 'short' }), /애플리케이션 비밀번호/);
  assert.throws(() => normalizeNaver('exampleuser'), /아이디와 애플리케이션 비밀번호/);
});

// ── 2_collect_ics.js의 naver 칸(가짜 네이버 서버를 globalThis.fetch로) ──

const req = (path, init = {}) => new Request(`https://tachyon.example.invalid${path}`, init);
const realFetch = globalThis.fetch;
const realNow = Date.now;

async function withNaver(opts, fn) {
  const fake = fakeNaver(opts);
  globalThis.fetch = (url, init) => (String(url).startsWith(NAVER_CALDAV) ? fake.fetchImpl(url, init) : Promise.resolve(new Response('no', { status: 404 })));
  Date.now = () => NOW;
  try {
    return await fn(fake);
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
}

test('PUT /api/feeds {naver}: 연결하면 일정이 source naver로 들어오고, 아이디·비밀번호는 잠가 둔다', async () => {
  await withNaver({}, async () => {
    const env = makeEnv();
    const user = await addTestUser(env);
    const res = await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify({ naver: { id: ID, password: PW } }) }), env, makeCtx(), user);
    const data = await res.json();
    assert.equal(res.status, 200);
    const [r] = data.results;
    assert.equal(r.kind, 'naver');
    assert.equal(r.saved, true);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.events, 5); // 실험 1 + 동아리 3 + 생일 1
    const n = (await env.DB.prepare("SELECT count(*) AS n FROM events WHERE source = 'naver'").first()).n;
    assert.equal(n, 5);
    const lab = await env.DB.prepare("SELECT title, start, place FROM events WHERE source = 'naver' AND ext_id = 'naver-lab@example'").first();
    assert.deepEqual(lab, { title: '예시 실험 & 정리', start: '2026-11-16T14:00:00+09:00', place: '예시 500동' });

    const feed = data.feeds.find((f) => f.kind === 'naver');
    assert.equal(feed.set, true);
    assert.equal(feed.hint, '네이버 · ex******');
    const dump = JSON.stringify(data) + JSON.stringify((await env.DB.prepare('SELECT * FROM feeds').all()).results);
    assert.ok(!dump.includes(PW) && !dump.includes(ID), '아이디·비밀번호가 새면 안 됨');

    // Cron도 같은 길로 받는다(14분 뒤)
    Date.now = () => NOW + 15 * 60 * 1000;
    const summary = await collectDue(env, NOW + 15 * 60 * 1000);
    assert.equal(summary.feeds, 1);
    assert.equal(summary.failed, 0);

    // 연결 끊기: 줄과 일정이 함께 지워진다
    const del = await (await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify({ naver: null }) }), env, makeCtx(), user)).json();
    assert.equal(del.results[0].removed, true);
    assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM events WHERE source = 'naver'").first()).n, 0);
    assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM feeds WHERE kind = 'naver'").first()).n, 0);
  });
});

test('PUT /api/feeds {naver}: 비밀번호가 틀리면 저장하지 않고 까닭을 칸 아래에', async () => {
  await withNaver({ password: 'OTHERPASSWORD99' }, async () => {
    const env = makeEnv();
    const user = await addTestUser(env);
    const data = await (await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify({ naver: { id: ID, password: PW } }) }), env, makeCtx(), user)).json();
    const [r] = data.results;
    assert.equal(r.saved, false);
    assert.match(r.error, /애플리케이션 비밀번호/);
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM feeds').first()).n, 0);

    const bad = await (await handle(req('/api/feeds', { method: 'PUT', body: JSON.stringify({ naver: { id: ID, password: 'short' } }) }), env, makeCtx(), user)).json();
    assert.equal(bad.results[0].saved, false);
    assert.match(bad.results[0].error, /애플리케이션 비밀번호/);
  });
});
