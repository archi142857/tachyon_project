// 첫 설정의 캘린더(ICS) 주소: 찾는 법과 다듬기·모양 확인.
// 문구와 규칙은 docs/ngs/캘린더_주소_찾기.md(컨셉 세션)를 따른다. 서버도 같은 규칙으로 한 번 더 본다.
// 이 주소는 아는 사람 누구나 일정을 볼 수 있는 비밀값이라 화면 로그·오류 보고에 넣지 않는다.

export const FEEDS = [
  {
    key: 'etl',
    label: 'eTL',
    open: 'https://myetl.snu.ac.kr/calendar',
    how: 'eTL → 왼쪽 ‘캘린더’ → 오른쪽 아래 ‘캘린더 피드’ → 주소 복사 (PC 웹)',
    steps: [
      'PC에서 eTL에 로그인해요.',
      '왼쪽 메뉴에서 ‘캘린더’를 눌러요.',
      '오른쪽 아래(작은 달력 밑)에서 ‘캘린더 피드’를 눌러요.',
      '뜬 창의 주소를 복사해요. https로 시작하고 .ics로 끝나요.',
      '휴대폰 Canvas 학생 앱: 캘린더 → 오른쪽 위 ⋮ → 캘린더 피드.',
    ],
  },
  {
    key: 'google',
    label: '구글 캘린더',
    open: 'https://calendar.google.com/calendar/u/0/r/settings',
    how: '구글 캘린더 → 설정 → 내 캘린더 이름 → ‘캘린더 통합’ → ‘iCal 형식의 비공개 주소’ 복사 (PC 웹만)',
    steps: [
      'PC 브라우저로 calendar.google.com에 들어가요. 폰 앱에는 이 메뉴가 없어요.',
      '오른쪽 위 톱니바퀴 → 설정.',
      '왼쪽 ‘내 캘린더의 설정’에서 캘린더 이름을 눌러요.',
      '‘캘린더 통합’까지 내려가 ‘iCal 형식의 비공개 주소’를 복사해요. 공개 주소가 아니에요.',
      '노션 캘린더, 구글 계정에 저장하는 삼성 캘린더도 이 주소로 돼요.',
    ],
  },
  {
    key: 'apple',
    label: '애플 캘린더',
    open: null, // 아이폰 캘린더 앱 안이라 열어 줄 주소가 없다
    how: '아이폰 캘린더 → 아래 ‘캘린더’ → 캘린더 옆 ⓘ → ‘공개 캘린더’ 켜기 → ‘링크 공유’ → 복사',
    steps: [
      '아이폰 ‘캘린더’ 앱 아래쪽 ‘캘린더’를 눌러요.',
      'iCloud 아래에서 넣을 캘린더 옆 ⓘ를 눌러요.',
      '‘공개 캘린더’를 켜고 ‘링크 공유’ → ‘복사’.',
      'webcal://로 시작해도 그대로 붙이면 돼요.',
      '그만 쓰려면 ‘공개 캘린더’를 끄면 주소가 더는 열리지 않아요.',
    ],
  },
];

export const YEARS = [
  { value: 1, label: '1학년' },
  { value: 2, label: '2학년' },
  { value: 3, label: '3학년' },
  { value: 4, label: '4학년' },
  { value: 5, label: '5학년 이상' },
];

// ── 학번(11-11 사람 요청 "학번도 목록형 선택으로") ─────────────────────
// 서버 칸(users.year)은 지금 학년(1~8)이라, 고른 학번(입학 연도)을 이번 학년도 기준 학년으로 셈해 보낸다(26학번 = 1학년).
// 학년도는 3월에 바뀐다(1~2월은 앞 해). 학번 그대로 저장할지는 팀원과 정하는 중(소통판 11-11).
const MAX_GRADE = 8;

/** 이번 학년도(한국 시간, 3월부터 새 학년도) */
export function schoolYear(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCMonth() < 2 ? kst.getUTCFullYear() - 1 : kst.getUTCFullYear();
}

/** 학번 목록: 올해 학번부터 8개, 마지막은 '…학번 이전'(학년 8) → [{ value: 입학 연도, label: '26학번' }] */
export function entryYears(now = new Date()) {
  const y = schoolYear(now);
  return Array.from({ length: MAX_GRADE }, (_, i) => {
    const entry = y - i;
    const short = String(entry).slice(2);
    return { value: entry, label: i === MAX_GRADE - 1 ? `${short}학번 이전` : `${short}학번` };
  });
}

/** 학번(입학 연도) → 서버에 보낼 학년(1~8) */
export const gradeOf = (entry, now = new Date()) => Math.min(MAX_GRADE, Math.max(1, schoolYear(now) - entry + 1));

/** 서버의 학년 → 화면에 보일 학번(입학 연도). 없으면 null */
export const entryOf = (grade, now = new Date()) => (Number.isInteger(grade) && grade >= 1 ? schoolYear(now) - Math.min(grade, MAX_GRADE) + 1 : null);

// ── 학과 찾기 ────────────────────────────────────────────

/** 찾기용으로 줄인 글: 띄어쓰기·가운뎃점·줄표를 빼고 영어는 소문자 */
export const searchKey = (s) => (s || '').toLowerCase().replace(/[\s·⋅∙•\-－–—.,()]/g, '');

/**
 * 학과 목록([[이름, 단과대], …])에서 쓴 글에 맞는 것: 이름이 그 글로 시작하는 것 → 이름에 든 것 → 단과대 이름에 든 것.
 * 빈 글이면 목록 그대로.
 */
export function matchDepartments(list, query) {
  const q = searchKey(query);
  if (!q) return list;
  const starts = [];
  const inName = [];
  const inCollege = [];
  for (const row of list) {
    const name = searchKey(row[0]);
    if (name.startsWith(q)) starts.push(row);
    else if (name.includes(q)) inName.push(row);
    else if (searchKey(row[1]).includes(q)) inCollege.push(row);
  }
  return [...starts, ...inName, ...inCollege];
}

// 빈칸이면 { url: null }, 고칠 점이 있으면 { error }, 좋으면 { url } (webcal:// 은 https:// 로 바꾼다)
export function normalizeIcs(key, raw) {
  const s = (raw || '').trim();
  if (!s) return { url: null };
  let u;
  try {
    u = new URL(s.replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return { error: '주소 모양이 아니에요' };
  }
  if (u.protocol !== 'https:') return { error: 'https:// 로 시작하는 주소를 넣어 주세요' };
  const error = checkFeed(key, u);
  return error ? { error } : { url: u.toString() };
}

// 붙여 넣은 글이 어느 캘린더의 주소인지('복사한 주소 붙여넣기' 한 번으로 칸을 고르지 않게) → 'etl' | 'google' | 'apple' | null
export function detectFeed(raw) {
  const hit = FEEDS.find((f) => normalizeIcs(f.key, raw).url);
  return hit ? hit.key : null;
}

// 1단계는 아는 곳의 주소만 받는다(서버가 아무 주소나 대신 받아 오는 구멍을 막으려고).
function checkFeed(key, u) {
  if (key === 'etl') {
    return u.hostname === 'myetl.snu.ac.kr' && u.pathname.endsWith('.ics') ? null : 'eTL 캘린더 피드 주소(myetl.snu.ac.kr, .ics로 끝남)를 넣어 주세요';
  }
  if (key === 'google') {
    if (u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/ical/')) return '구글 캘린더의 iCal 주소를 넣어 주세요';
    if (u.pathname.includes('/public/')) return '비공개 주소(‘iCal 형식의 비공개 주소’)를 넣어 주세요';
    return null;
  }
  if (key === 'apple') {
    return /^p\d+-caldav\.icloud\.com$/.test(u.hostname) && u.pathname.startsWith('/published/') ? null : '애플 캘린더의 공개 캘린더 링크를 넣어 주세요';
  }
  return null;
}

// 저장된 주소의 지금 상태 한 줄(메뉴에서 다시 열었을 때). feed = GET /api/feeds의 한 칸
// 서버 문장(error)은 사람에게 보일 말이라 그대로 보인다. 멈춘 주소(stopped)도 error에 '다시 붙여 주세요'가 들어 있다.
export function feedResult(feed) {
  if (!feed || !feed.set) return null;
  if (feed.error) return { ok: false, text: feed.error };
  if (feed.count == null) return { ok: true, text: '받는 중이에요' };
  return { ok: true, text: `${feed.kind === 'etl' ? '항목' : '일정'} ${feed.count}개를 받았어요` };
}

// 저장·다시 받기 바로 뒤 칸 아래 한 줄. r = PUT /api/feeds·POST /api/feeds/collect의 results 한 칸
//   { kind, ok, saved, tasks, events, count, same, error, removed }
// saved: false(저장 안 됨)는 칸의 오류로 따로 보이니 여기서는 null.
export function resultLine(r) {
  if (!r || r.removed || r.saved === false) return null;
  if (r.example) return { ok: true, text: '예시라 주소를 저장하거나 받아 보지 않았어요' };
  if (!r.ok) return { ok: false, text: r.error || '이 주소로 읽지 못했어요' };
  if (r.tasks == null && r.events == null) {
    // 지난번과 같은 내용(same)이면 개수만 온다
    return { ok: true, text: r.count == null ? '바뀐 것 없어요' : `${r.kind === 'etl' ? '항목' : '일정'} ${r.count}개, 바뀐 것 없어요` };
  }
  if (r.kind === 'etl') {
    const extra = r.events ? `, 일정 ${r.events}개` : '';
    return { ok: true, text: `과제 ${r.tasks || 0}개${extra}를 찾았어요` };
  }
  return { ok: true, text: `일정 ${r.events || 0}개를 찾았어요` };
}

// saved: false인 칸 → { kind: 서버 문장 } (그 칸의 주소는 지우지 않고 남겨서 고치게 한다)
export function unsavedErrors(results) {
  const out = {};
  for (const r of results || []) if (r.saved === false && !r.removed && !r.example) out[r.kind] = r.error || '이 주소는 저장하지 못했어요';
  return out;
}
