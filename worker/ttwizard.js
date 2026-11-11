// TT Wizard 시간표 링크 ↔ Tachyon 시간표(11-11 사람 "가능하면 TT Wizard랑 연동 되도록", 컨셉).
// TT Wizard(같은 사람이 만든 서울대 시간표·동선 서비스, https://github.com/archi142857/tt-wizard)의 '시간표 링크'를 그대로 읽고 만든다.
// 모양(TT Wizard web/js/app.js '시간표 링크', 11-11 확인): <주소>#t=<글>, 글 = 'z' + base64url(deflate-raw(JSON)) 또는 'j' + base64url(JSON).
// JSON = [판(1), 학기('2026-2'), 이름, 항목들]. 항목은
//   배열 [교과목번호, 강좌번호, 색, 과목명, 바꾼 수업?] — 수업은 받는 쪽 편람에서 채운다
//   객체 { course, no, name, base, own? } — 보낸 쪽 편람에 없던 강좌, { custom, title, meetings } — 직접 넣은 일정
// 수업 한 칸 = [요일(0=월 … 6=일), 시작 분, 끝 분, 건물, 호실]. 교수 이름은 읽지도 쓰지도 않는다.
// Tachyon 편람(data/offerings/<학기>.json)의 강좌 = [교과목번호, 과목명, 개설 학과, 학점, 이수구분, [[강좌번호, 상태, 수업들]]].

export const LINK_BASE = 'https://archi142857.github.io/tt-wizard/';
export const LINK_VERSION = 1;
const LINK_MAX = 64 * 1024; // 받은 글이 이보다 길면 읽지 않는다(TT Wizard와 같다)
const OUT_MAX = 256 * 1024; // 풀어 낸 JSON이 이보다 크면 멈춘다(압축 폭탄)
const ITEMS_MAX = 60;
const KO_DAYS = '월화수목금토일';

export const PROBLEM = {
  broken: 'TT Wizard 시간표 링크가 아니거나 깨졌어요. TT Wizard에서 공유 → 링크 복사로 다시 받아 주세요',
  newer: '더 새 TT Wizard에서 만든 링크예요. Tachyon을 새로 고친 뒤 다시 해 주세요',
  empty: '이 링크에는 넣을 수업이 없어요',
};

// 붙여 넣은 글(링크 전체, '#t=…', '#ttw=…', 글만) → 글. 없으면 null
export function codeOf(text) {
  const s = String(text || '').trim();
  const m = s.match(/#(?:t|ttw)=([zj][A-Za-z0-9_-]+)/) || s.match(/^([zj][A-Za-z0-9_-]+)$/);
  return m && m[1].length <= LINK_MAX ? m[1] : null;
}

const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

async function inflate(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > OUT_MAX) {
      reader.cancel().catch(() => null);
      throw new Error('too big');
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// 글 → { link: { sem, title, items } } 또는 { problem } (PROBLEM의 열쇠)
export async function readCode(code) {
  if (typeof code !== 'string' || code.length > LINK_MAX || !/^[zj][A-Za-z0-9_-]+$/.test(code)) return { problem: 'broken' };
  let data;
  try {
    let bytes = unb64url(code.slice(1));
    if (code[0] === 'z') bytes = await inflate(bytes);
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { problem: 'broken' };
  }
  if (!Array.isArray(data) || !Number.isInteger(data[0]) || data[0] < 1) return { problem: 'broken' };
  if (data[0] > LINK_VERSION) return { problem: 'newer' };
  const [, sem, title, items] = data;
  if (typeof sem !== 'string' || !/^\d{4}-[12SW]$/.test(sem) || !Array.isArray(items)) return { problem: 'broken' };
  return { link: { sem, title: typeof title === 'string' ? title.trim().slice(0, 60) : '', items: items.slice(0, ITEMS_MAX) } };
}

// 수업 칸 다듬기: 요일 0~6, 0 ≤ 시작 < 끝 ≤ 1440, 건물·호실은 글자만
function tuples(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => Array.isArray(m) && Number.isInteger(m[0]) && m[0] >= 0 && m[0] <= 6 && Number.isFinite(m[1]) && Number.isFinite(m[2]) && m[1] >= 0 && m[2] > m[1] && m[2] <= 1440)
    .slice(0, 14)
    .map(([d, s, e, b, r]) => [d, Math.round(s), Math.round(e), typeof b === 'string' ? b.trim().slice(0, 12) : '', typeof r === 'string' ? r.trim().slice(0, 24) : '']);
}

const clip = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : fallback);

/**
 * 링크 → 수업 목록. book = 그 학기 Tachyon 편람(없으면 null — 그러면 배열 항목은 '바꾼 수업'이 있을 때만 시각을 안다)
 * → [{ title, course, no, meetings: [[요일, 시작, 끝, 건물, 호실]], found: 편람에서 찾았나, custom: 직접 넣은 일정 }]
 */
export function linkClasses(link, book) {
  const byId = book ? new Map(book.courses.map((c) => [c[0], c])) : new Map();
  const sectionOf = (course, no) => {
    const c = byId.get(course);
    const sec = c && c[5].find((s) => s[0] === no);
    return sec ? { c, sec } : null;
  };
  const out = [];
  for (const x of link.items) {
    if (Array.isArray(x)) {
      const [course, no, , name, own] = x;
      if (typeof course !== 'string' || typeof no !== 'string') continue;
      const hit = sectionOf(course, no);
      out.push({ title: hit ? hit.c[1] : clip(name, course), course, no, meetings: Array.isArray(own) ? tuples(own) : hit ? tuples(hit.sec[2]) : [], found: !!hit, custom: false });
    } else if (x && typeof x === 'object') {
      if (typeof x.custom === 'string') {
        out.push({ title: clip(x.title, '일정'), course: null, no: null, meetings: tuples(x.meetings), found: true, custom: true });
      } else if (typeof x.course === 'string') {
        const no = typeof x.no === 'string' ? x.no : '';
        const hit = sectionOf(x.course, no);
        const meetings = Array.isArray(x.own) ? tuples(x.own) : hit ? tuples(hit.sec[2]) : tuples(x.base);
        out.push({ title: hit ? hit.c[1] : clip(x.name, x.course), course: x.course, no, meetings, found: !!hit || meetings.length > 0, custom: false });
      }
    }
  }
  return out;
}

const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// TT Wizard 건물·호실 → 장소 글('26동 101호', '301동', 모르면 null)
export function placeOf(building, room) {
  if (!building) return null;
  if (!room) return `${building}동`;
  return /^[A-Za-z]?\d/.test(room) ? `${building}동 ${room}호` : `${building}동 ${room}`;
}

// 수업 목록 → 시간표 사진과 같은 칸 모양(5_timetable_photo.js expandWeekly가 읽는 것): { title, day: '월', start: '10:00', end: '11:15', place }
export function weeklyRows(classes) {
  return classes.flatMap((c) => c.meetings.map(([d, s, e, b, r]) => ({ title: c.title, day: KO_DAYS[d], start: hm(s), end: hm(e === 1440 ? 1439 : e), place: placeOf(b, r) || '?' })));
}

/**
 * Tachyon의 매주 수업 → TT Wizard 시간표 링크(내보내기). 편람에서 이름과 수업 시각이 다 맞는 강좌를 찾으면 [교과목번호, 강좌번호, null, 과목명],
 * 못 찾으면 직접 넣은 일정 { custom, title, meetings }로 보낸다. weekly = [{ title, meetings: [[요일, 시작, 끝, 건물, 호실]] }]
 */
export function toLinkItems(weekly, book) {
  const byName = new Map();
  if (book) for (const c of book.courses) byName.set(c[1], [...(byName.get(c[1]) || []), c]);
  const sig = (ms) =>
    ms
      .map(([d, s, e]) => `${d}-${s}-${e}`)
      .sort()
      .join('|');
  let n = 0;
  return weekly.map((w) => {
    const want = sig(w.meetings);
    for (const c of byName.get(w.title) || []) {
      const sec = c[5].find((s) => sig(tuples(s[2])) === want);
      if (sec) return [c[0], sec[0], null, c[1]];
    }
    n += 1;
    return { custom: `c${n}`, title: w.title, meetings: w.meetings };
  });
}

// 링크 만들기(압축 없이 'j' — 받는 TT Wizard가 둘 다 읽는다)
export function linkOf(sem, title, items) {
  const bytes = new TextEncoder().encode(JSON.stringify([LINK_VERSION, sem, title, items]));
  return `${LINK_BASE}#t=j${b64url(bytes)}`;
}
