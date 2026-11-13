// CalDAV로 캘린더 일정 읽기 (지금은 네이버 캘린더만, 담당: 컨셉 세션 11-13 — 사람 요청 "네이버 캘린더랑 동기화").
//
// 네이버 캘린더는 다른 앱이 구독할 ICS 주소를 주지 않는다(.ics 파일 내보내기만). 계속 받으려면 CalDAV뿐이고,
// 로그인은 네이버 아이디 + '애플리케이션 비밀번호'(2단계 인증을 켠 계정에서 만드는 앱 전용 비밀번호)다.
//
// 하는 일: 읽기만. PROPFIND로 내 캘린더 목록을 찾고(current-user-principal → calendar-home-set → 캘린더들),
// 캘린더마다 REPORT(calendar-query)로 기간 안 일정을 받아, VEVENT·VTIMEZONE을 모아 ICS 글 하나로 만든다.
// 그 글은 다른 주소(eTL·구글·애플)와 똑같이 lib/ics.js가 펼친다. 네이버 쪽에 쓰거나 지우지 않는다.
//
// 오류 문장에는 아이디·비밀번호·주소를 넣지 않는다.

export const NAVER_CALDAV = 'https://caldav.calendar.naver.com/';

const MAX_CALENDARS = 10;
const MAX_REQUESTS = 30; // 한 번 받을 때 네이버로 보내는 요청 수 한도
const MULTIGET_BATCH = 50;
const MAX_OBJECTS = 500; // 목록으로 받을 때 한 캘린더에서 받는 일정 수 한도(최근에 고친 것부터)
const MAX_GETS = 8; // multiget이 안 될 때 하나씩 받는 수(요청을 아끼려고 조금만)
const DAV = '(?:[\\w.-]+:)?'; // 이름표 앞 접두어(d:, D:, cal:, ns0: …)는 서버마다 달라서 아무거나 받는다

export class CalDavError extends Error {
  /** auth = 아이디·비밀번호가 안 맞음(다시 넣어야 함), permanent = 저절로 안 돌아옴 */
  constructor(message, { status = 0, auth = false, permanent = false } = {}) {
    super(message);
    this.status = status;
    this.auth = auth;
    this.permanent = permanent || auth;
  }
}

/**
 * 계정의 모든 일정 캘린더에서 [from, to) 안의 일정을 받아 ICS 글 하나로 돌려준다.
 * @param {{ base?: string, user: string, password: string, from: Date, to: Date,
 *           fetchImpl?: typeof fetch, timeoutMs?: number, maxChars?: number }} opts
 * @returns {Promise<{ text: string, calendars: number }>}
 */
export async function fetchCalDav({ base = NAVER_CALDAV, user, password, from, to, fetchImpl = fetch, timeoutMs = 15000, maxChars = 5_000_000, budget = MAX_REQUESTS }) {
  const auth = `Basic ${base64(`${user}:${password}`)}`;
  let used = 0; // Workers 무료 요금제는 한 번에 바깥 요청 50개까지라 아껴 쓴다(Cron은 다른 주소도 같이 받는다)
  const dav = (url, method, depth, body, extra) => {
    if (++used > budget) throw new CalDavError('네이버 캘린더 요청이 너무 많아 이번엔 멈췄어요. 다음에 이어서 받아요');
    return request(fetchImpl, url, { method, depth, body, auth, timeoutMs, maxChars }, extra);
  };

  // 1. 내 사람 주소(principal)
  let principal = null;
  for (const start of [base, new URL('/.well-known/caldav', base).toString()]) {
    const res = await dav(start, 'PROPFIND', '0', PROPFIND_PRINCIPAL);
    if (res.status === 404 || res.status === 405) continue;
    principal = hrefIn(res.text, 'current-user-principal', res.url);
    if (principal) break;
  }
  if (!principal) principal = base; // 일부 서버는 바로 calendar-home-set을 준다

  // 2. 캘린더 집(calendar-home-set)
  const homeRes = await dav(principal, 'PROPFIND', '0', PROPFIND_HOME);
  const home = hrefIn(homeRes.text, 'calendar-home-set', homeRes.url) || principal;

  // 3. 집 안의 일정 캘린더들
  const listRes = await dav(home, 'PROPFIND', '1', PROPFIND_CALENDARS);
  const calendars = calendarsIn(listRes.text, listRes.url).slice(0, MAX_CALENDARS);
  if (!calendars.length) throw new CalDavError('네이버 캘린더에서 일정 캘린더를 찾지 못했어요');

  // 4. 캘린더마다 일정 글(readCalendar: 기간 질의 → 기간 없는 질의 → 목록 + multiget 순서로 될 때까지)
  const datas = [];
  const trace = [];
  let size = 0;
  let read = 0;
  for (const [i, cal] of calendars.entries()) {
    const r = await readCalendar(dav, cal, from, to);
    trace.push(`${i + 1}:${r.trace.join('·')}`);
    if (r.auth) throw new CalDavError(AUTH_TEXT, { auth: true });
    if (!r.ok) continue; // 이 캘린더 하나만 건너뛴다(다른 캘린더는 받는다)
    read++;
    for (const data of r.datas) {
      size += data.length;
      if (size > maxChars) throw new CalDavError('네이버 캘린더가 너무 커요(5MB 넘음)');
      datas.push(data);
    }
  }
  if (!read) throw new CalDavError(`네이버 캘린더에서 일정을 받지 못했어요. 잠시 뒤에 다시 받아요(진단 ${trace.join(' ')})`);
  const text = mergeCalendars(datas);
  return { text, calendars: calendars.length, events: (text.match(/^BEGIN:VEVENT\r?$/gm) || []).length, trace: trace.join(' ') };
}

/**
 * 캘린더 하나의 일정 글들. 서버마다 되는 방법이 달라서 차례로 해 본다.
 *  q = calendar-query(기간 있음 → 없음), l = 목록(PROPFIND Depth 1), m = calendar-multiget, g = 하나씩 GET(조금만)
 * trace에는 상태 번호와 개수만 남긴다(주소·아이디·제목 없음) — 화면 '진단'으로 보여 줘도 되게.
 */
async function readCalendar(dav, cal, from, to) {
  const trace = [];
  const query = async (ranged) => {
    const res = await dav(cal, 'REPORT', '1', calendarQuery(ranged ? from : null, ranged ? to : null), { allowFail: true });
    if (!res.ok) {
      trace.push(`q${res.status}`);
      return { res, datas: [], hrefs: [] };
    }
    const datas = calendarDataIn(res.text);
    const hrefs = objectHrefsIn(res.text, res.url, cal);
    trace.push(`q${res.status}/${hrefs.length}/${datas.length}`);
    return { res, datas, hrefs };
  };

  let q = await query(true);
  if (q.res.auth) return { auth: true, trace };
  if (q.datas.length) return { ok: true, datas: q.datas, trace };
  let hrefs = q.hrefs;
  let anyOk = q.res.ok;
  if (!hrefs.length) {
    q = await query(false); // 기간 거르기를 못 하거나(오류·빈 답) 일정이 정말 없는 경우
    if (q.res.auth) return { auth: true, trace };
    if (q.datas.length) return { ok: true, datas: q.datas, trace };
    hrefs = q.hrefs;
    anyOk = anyOk || q.res.ok;
  }
  if (!hrefs.length) {
    const list = await dav(cal, 'PROPFIND', '1', PROPFIND_MEMBERS, { allowFail: true });
    if (list.auth) return { auth: true, trace };
    hrefs = list.ok ? objectHrefsIn(list.text, list.url, cal) : [];
    trace.push(list.ok ? `l${hrefs.length}` : `l${list.status}`);
    anyOk = anyOk || list.ok;
    if (!anyOk) return { ok: false, trace };
  }
  if (!hrefs.length) return { ok: true, datas: [], trace }; // 정말 빈 캘린더

  const datas = [];
  let multigetOk = true;
  for (let i = 0; i < hrefs.length && i < MAX_OBJECTS; i += MULTIGET_BATCH) {
    const res = await dav(cal, 'REPORT', '1', multigetBody(hrefs.slice(i, Math.min(i + MULTIGET_BATCH, MAX_OBJECTS)).map((h) => h.raw)), { allowFail: true });
    if (res.auth) return { auth: true, trace };
    if (!res.ok) {
      trace.push(`m${res.status}`);
      multigetOk = false;
      break;
    }
    const got = calendarDataIn(res.text);
    trace.push(`m${res.status}/${got.length}`);
    datas.push(...got);
  }
  if (!multigetOk || !datas.length) {
    let n = 0;
    for (const h of hrefs.slice(0, MAX_GETS)) {
      const res = await dav(h.abs, 'GET', '0', undefined, { allowFail: true });
      if (res.auth) return { auth: true, trace };
      const data = res.ok ? asCalendar(res.text) : null;
      if (data) {
        datas.push(data);
        n++;
      }
    }
    trace.push(`g${n}/${Math.min(hrefs.length, MAX_GETS)}`);
  }
  return { ok: true, datas, trace };
}

const AUTH_TEXT = '네이버 아이디나 애플리케이션 비밀번호가 맞지 않아요. 네이버에서 애플리케이션 비밀번호를 새로 만들어 다시 넣어 주세요';

const PROPFIND_PRINCIPAL =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
const PROPFIND_HOME =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>';
const PROPFIND_CALENDARS =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  '<d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>';

const PROPFIND_MEMBERS =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontenttype/><d:getlastmodified/></d:prop></d:propfind>';

/** calendar-multiget 본문(href는 서버가 준 모양 그대로) */
export function multigetBody(hrefs) {
  const esc = (h) => h.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    '<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    '<d:prop><d:getetag/><c:calendar-data/></d:prop>' +
    hrefs.map((h) => `<d:href>${esc(h)}</d:href>`).join('') +
    '</c:calendar-multiget>'
  );
}

/** REPORT 본문. from·to가 없으면 기간 거르기 없이 VEVENT 전부. */
export function calendarQuery(from, to) {
  const range = from && to ? `<c:time-range start="${davTime(from)}" end="${davTime(to)}"/>` : '';
  return (
    '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    '<d:prop><d:getetag/><c:calendar-data/></d:prop>' +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">${range}</c:comp-filter></c:comp-filter></c:filter>` +
    '</c:calendar-query>'
  );
}

/** 20261113T000000Z 꼴(UTC) */
export function davTime(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** 요청 하나. allowFail이면 4xx·5xx도 던지지 않고 { ok:false }로 돌려준다(401·403은 auth:true). */
async function request(fetchImpl, url, { method, depth, body, auth, timeoutMs, maxChars }, { allowFail = false } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        authorization: auth,
        depth,
        'content-type': 'application/xml; charset=utf-8',
        accept: 'application/xml, text/xml;q=0.9, */*;q=0.5',
        'user-agent': 'Tachyon-calendar-sync/0.1',
      },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new CalDavError(`네이버 캘린더가 ${timeoutMs / 1000}초 안에 답하지 않았어요`);
    throw new CalDavError('네이버 캘린더에 연결하지 못했어요');
  }
  const authFail = res.status === 401 || res.status === 403;
  if (!res.ok) {
    if (allowFail) return { ok: false, auth: authFail, status: res.status, text: '', url };
    if (authFail) throw new CalDavError(AUTH_TEXT, { status: res.status, auth: true });
    if (res.status === 404 || res.status === 405) return { ok: false, status: res.status, text: '', url };
    throw new CalDavError(`네이버 캘린더가 오류로 답했어요(HTTP ${res.status})`, { status: res.status });
  }
  const text = await res.text();
  if (text.length > maxChars) throw new CalDavError('네이버 캘린더가 너무 커요(5MB 넘음)');
  return { ok: true, status: res.status, text, url: res.url || url };
}

// ── XML 읽기(작은 것만: Workers에는 DOMParser가 없다) ─────────────────────

function unescapeXml(s) {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  if (cdata) return cdata[1];
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function elements(xml, name) {
  const re = new RegExp(`<${DAV}${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${DAV}${name}\\s*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function firstHref(xml) {
  const [h] = elements(xml, 'href');
  return h == null ? null : unescapeXml(h.trim());
}

/** <prop>…<name><href>…</href></name> 안의 주소를 base 기준 절대 주소로 */
export function hrefIn(xml, name, base) {
  for (const inner of elements(xml, name)) {
    const href = firstHref(inner);
    if (href) {
      try {
        return new URL(href, base).toString();
      } catch {
        // 다음 것
      }
    }
  }
  return null;
}

/** PROPFIND Depth 1 결과에서 일정(VEVENT)을 담는 캘린더 주소들. 집 자신과 할 일(VTODO)만 받는 캘린더는 뺀다. */
export function calendarsIn(xml, base) {
  const out = [];
  const seen = new Set();
  for (const block of elements(xml, 'response')) {
    const href = firstHref(block);
    if (!href) continue;
    const types = elements(block, 'resourcetype').join(' ');
    if (!new RegExp(`<${DAV}calendar(?:\\s[^>]*)?\\/?>`, 'i').test(types)) continue; // <cal:calendar/>, <C:calendar xmlns:C="…"/>
    const comps = elements(block, 'supported-calendar-component-set').join(' ');
    if (comps.trim() && !/name\s*=\s*["']VEVENT["']/i.test(comps)) continue;
    let url;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** REPORT 결과의 calendar-data 글들(각각 VCALENDAR 하나). VEVENT만 온 글은 VCALENDAR로 싼다. */
export function calendarDataIn(xml) {
  return elements(xml, 'calendar-data')
    .map((s) => asCalendar(unescapeXml(s).trim()))
    .filter(Boolean);
}

/** 일정 글 하나 → VCALENDAR 글(없으면 null) */
export function asCalendar(text) {
  if (typeof text !== 'string') return null;
  if (/BEGIN:VCALENDAR/i.test(text)) return text;
  if (/BEGIN:VEVENT/i.test(text)) return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${text.trim()}\r\nEND:VCALENDAR`;
  return null;
}

/**
 * 캘린더 안 일정 하나하나의 주소: [{ raw: 서버가 준 href, abs: 절대 주소 }].
 * 캘린더 자신·하위 모음(collection)은 뺀다. 고친 시각(getlastmodified)이 있으면 최근 것부터.
 */
export function objectHrefsIn(xml, base, cal) {
  const self = String(cal).replace(/\/+$/, '');
  const out = [];
  const seen = new Set();
  for (const block of elements(xml, 'response')) {
    const raw = firstHref(block);
    if (!raw) continue;
    const types = elements(block, 'resourcetype').join(' ');
    if (new RegExp(`<${DAV}collection(?:\\s[^>]*)?\\/?>`, 'i').test(types)) continue;
    let abs;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      continue;
    }
    if (abs.replace(/\/+$/, '') === self || abs.endsWith('/') || seen.has(abs)) continue;
    seen.add(abs);
    const [mod] = elements(block, 'getlastmodified');
    out.push({ raw, abs, at: mod ? Date.parse(unescapeXml(mod).trim()) || 0 : 0 });
  }
  out.sort((a, b) => b.at - a.at);
  return out.map(({ raw, abs }) => ({ raw, abs }));
}

/** 여러 VCALENDAR에서 VTIMEZONE(TZID마다 하나)과 VEVENT를 모아 VCALENDAR 하나로 */
export function mergeCalendars(datas) {
  const zones = new Map();
  const events = [];
  for (const data of datas) {
    const text = data.replace(/\r\n|\r/g, '\n');
    for (const m of text.matchAll(/^BEGIN:VTIMEZONE\n[\s\S]*?^END:VTIMEZONE$/gm)) {
      const id = /^TZID[^:]*:(.*)$/m.exec(m[0]);
      const key = id ? id[1].trim() : m[0];
      if (!zones.has(key)) zones.set(key, m[0]);
    }
    for (const m of text.matchAll(/^BEGIN:VEVENT\n[\s\S]*?^END:VEVENT$/gm)) events.push(m[0]);
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tachyon//CalDAV//KO', ...zones.values(), ...events, 'END:VCALENDAR'];
  return `${lines.join('\n').replace(/\n/g, '\r\n')}\r\n`;
}

function base64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
