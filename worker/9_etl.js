// 9. eTL API (11-10 사람 지시 "eTL은 알아서 해봐"로 컨셉 세션이 만듦. 약속은 다른 번호 파일과 같다 — worker/index.js 머리말)
//
// 학생이 eTL(myetl.snu.ac.kr = Canvas)에서 직접 만든 '개인 액세스 토큰'으로 이번 학기 강의의 과제·공지·강의자료·과목 일정을 가져온다. 연결은 선택.
//
//   GET    /api/etl           연결 상태 { ok, connected, last_ok_at, last_error, dead, counts: {notice, file} }. 토큰은 돌려주지 않는다.
//   PUT    /api/etl           {"token": "…"} → 모양을 먼저 보고(비밀번호처럼 짧거나 띄어쓰기가 있으면 eTL에 보내지도 않음),
//                             eTL /users/self가 200일 때만 잠가 저장하고 바로 한 번 받는다.
//   DELETE /api/etl           연결 끊기: 토큰, 공지·강의자료 목록, eTL API로 넣은 과목 일정을 지운다(eTL ICS 주소가 없으면 과제도).
//                             공지에서 찾아 넣은 시험·휴강 일정(source 'notice')은 사용자 일정처럼 남긴다.
//   POST   /api/etl/collect   지금 다시 받기(1분 안에 받았으면 건너뜀, recent: true)
//   GET    /api/etl/items     공지·강의자료 목록(새 것 먼저) { notices: [...], files: [...] }
//   Cron   */10 * * * *       오래 안 받은 사람부터, 한 번에 eTL·AI 요청 ETL_REQUESTS_PER_RUN(기본 40)개 안에서(무료 요금제 한 번 50개)
//
// 넣는 곳(표는 schema.sql: etl, etl_items, tasks, events, log)
// - 과제 → tasks(source 'etl', ext_id 'event-assignment-<id>' = eTL 캘린더 피드(ICS)의 UID라 ICS와 한 줄로 합쳐진다). 제출했으면 done = 1(되돌리지 않음).
//   eTL ICS 주소도 연결돼 있으면 이름·마감은 ICS가 맡고 여기서는 done만, 없으면 이름·마감도 맞춘다. 마감 없는 과제도 넣는다(due NULL).
// - 공지 → etl_items(kind notice: 과목·제목·eTL 주소·올린 시각). 공지 글은 저장하지 않는다. 새 공지에 시험·휴강·보강 낱말이 있으면
//   AI(worker/prompts/etl_notice.js)가 날짜를 찾고, 찾은 것은 events(source 'notice' — 사용자가 고치거나 지울 수 있다. 한 번만 넣고 다시 덮지 않는다).
// - 강의자료 → etl_items(kind file: 과목·파일 이름·eTL 화면 주소(로그인해야 열림)·올린 시각). 내려받기 주소(검증값 붙음)는 어디에도 남기지 않고, 복사하지 않는다(11-10 정함).
// - 과목 일정(교수가 eTL 달력에 넣은 것) → events(source 'etl', ext_id 'api-calendar-<id>'). ICS 수집이 지우지 않게 2_collect_ics.js는 'api-'로 시작하는 줄을 건너뛴다.
// - 수업 시간표(AI 없이, 팀원 11-10 확인): 과목의 강의계획서 칸(syllabus_body) iframe 주소의 sbjtCd(교과목번호)·ltNo(분반)로
//   수강편람(data/offerings/<학기>.json, TT Wizard 자료 — 학사 과정만)에서 요일·시각·건물·호실을 찾아 오늘부터 종강까지 매주 일정으로
//   (source 'etl', ext_id 'api-class-…', 이름 = 과목 이름, 장소 = '39동 409호'). 시간표 사진으로 넣은 수업이 있으면 겹치지 않게 넣지 않는다.
//
// 지키는 것
// - 토큰은 APP_SECRET으로 잠가 etl.token에만. 응답·로그·오류 문장·이슈에 토큰·내려받기 주소·공지 글을 넣지 않는다.
// - 토큰은 https://myetl.snu.ac.kr 에만 보낸다(eTL이 준 '다음 쪽' 주소도 그 주소일 때만 따라간다).
// - 강의 목록(/courses)이 401이면 토큰이 틀렸거나 지워진 것: 두 번 이어지면 Cron이 멈추고 화면에 '다시 연결해 주세요'.
//   과목마다의 401·403·404(파일 탭을 닫은 과목 등)는 그 과목만 건너뛴다.
// - 학기는 eTL term 이름으로 고른다(term 날짜는 비어 있음): 3~8월 'YYYY년 1학기', 9~2월 'YYYY년 2학기'(1·2월은 앞해), 계절학기도. etl.term이 있으면 그것만.

import { askJson } from './llm.js';
import { SCHEMA, SYSTEM, mightHaveDates, noticeText, userMessage } from './prompts/etl_notice.js';
import { seal, unseal } from './lib/secret.js';
import { fail, json, readJson } from './lib/http.js';
import { DAY_MS, KST_MS, kstDate, kstIso, kstMidnight } from './lib/time.js';
import { logStatement } from './lib/log.js';
import { semesterEnd } from './5_timetable_photo.js';

export const ORIGIN = 'https://myetl.snu.ac.kr';
const API = `${ORIGIN}/api/v1`;
const DEAD_AFTER = 2;
const STALE_MS = 55 * 60 * 1000; // 한 사람은 한 시간에 한 번쯤
const MANUAL_GAP_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const PAST_DAYS = 30; // 공지·과목 일정을 보는 기간: 지난 30일 ~ 앞으로 6개월
const FUTURE_DAYS = 183;
const AI_PER_USER = 3; // 한 번에 AI로 읽는 새 공지 수(나머지는 다음 차례)
const FILES_PER_COURSE = 30;
const NEED_PER_USER = 20; // 한 사람을 시작하려면 남아 있어야 하는 요청 수(강의 6개쯤)

// 학기마다 수강편람 하나(TT Wizard 자료, data/README.md). 새 학기 편람이 data/offerings/에 생기면 줄을 더한다.
// 처음 쓸 때만 읽는다(350KB JSON — 상태 조회 같은 요청에는 읽지 않게).
const OFFERINGS = {
  '2026년 2학기': () => import('../data/offerings/2026-2.json', { with: { type: 'json' } }),
};

const MSG = {
  auth: 'eTL이 이 토큰을 받지 않아요. 토큰을 지웠거나 만료됐을 수 있어요. eTL에서 새 토큰을 만들어 다시 연결해 주세요',
  down: 'eTL에서 받지 못했어요. 잠시 뒤 다시 해 볼게요',
  notReady: 'eTL 연결은 준비 중이에요',
};

// ── 길 나누기 ────────────────────────────────────────────────────

export async function handle(request, env, ctx, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const { pathname } = new URL(request.url);
  const method = request.method;
  try {
    if (pathname === '/api/etl' && method === 'GET') return json({ ok: true, ...(await status(env, user.id)) });
    if (pathname === '/api/etl' && method === 'PUT') return connect(request, env, user.id);
    if (pathname === '/api/etl' && method === 'DELETE') return disconnect(env, user.id);
    if (pathname === '/api/etl/collect' && method === 'POST') {
      const result = await collectUser(env, user.id, { minGapMs: MANUAL_GAP_MS });
      return json({ ok: true, result, ...(await status(env, user.id)) });
    }
    if (pathname === '/api/etl/items' && method === 'GET') return json({ ok: true, ...(await listItems(env, user.id)) });
    if (['/api/etl', '/api/etl/collect', '/api/etl/items'].includes(pathname)) return fail(405, '그 방법으로는 안 받아요');
    return fail(404, '없는 주소예요');
  } catch (err) {
    if (missingTable(err)) return fail(503, MSG.notReady); // 원격 D1에 표가 아직 없을 때(schema.sql 반영 전)
    throw err;
  }
}

export async function scheduled(event, env, ctx) {
  try {
    const summary = await collectDue(env);
    console.log('eTL 수집(Cron)', JSON.stringify(summary));
  } catch (err) {
    if (missingTable(err)) return console.log('eTL 수집(Cron): 표가 아직 없어 건너뜀');
    throw err;
  }
}

const missingTable = (err) => /no such table: etl/i.test(String(err && err.message));

// ── 토큰 ─────────────────────────────────────────────────────────

/**
 * 붙여 넣은 글이 eTL 액세스 토큰 모양인지. 비밀번호를 잘못 넣는 일이 있어(팀원 11-10) 모양이 아니면 eTL에 보내지도 않는다.
 * eTL 토큰은 '숫자~영문·숫자 64자' 모양의 긴 글이다. 앞뒤 공백·'Bearer '는 떼어 준다.
 */
export function checkToken(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(/^Bearer\s+/i, '');
  if (!t) return { error: 'eTL에서 만든 토큰을 붙여 넣어 주세요' };
  if (t.length < 40 || /\s/.test(t) || !/^[A-Za-z0-9~._-]+$/.test(t) || t.length > 300) {
    return { error: "eTL 비밀번호가 아니라, eTL → 계정 → 설정 → '승인된 통합'의 '+ 새 액세스 토큰'으로 만든 긴 글을 붙여 넣어 주세요" };
  }
  return { token: t };
}

async function connect(request, env, userId) {
  const body = await readJson(request);
  const checked = checkToken(body && body.token);
  if (checked.error) return fail(400, checked.error);
  const get = canvas(checked.token, { left: 5 });
  try {
    await get('/users/self');
  } catch (err) {
    if (err instanceof EtlError && err.auth) return fail(400, 'eTL이 이 토큰을 받지 않아요. 토큰 전체를 다시 복사해 붙여 넣어 주세요');
    return fail(502, 'eTL에 닿지 못했어요. 잠시 뒤 다시 해 주세요');
  }
  const sealed = await seal(env, checked.token);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO etl (user_id, token, dead_count, last_error) VALUES (?, ?, 0, NULL)
       ON CONFLICT (user_id) DO UPDATE SET token = excluded.token, dead_count = 0, last_error = NULL, last_try_at = NULL`,
    ).bind(userId, sealed),
    logStatement(env, userId, 'etl_connect'),
  ]);
  const result = await collectUser(env, userId, { force: true });
  return json({ ok: true, result, ...(await status(env, userId)) });
}

async function disconnect(env, userId) {
  const ics = await env.DB.prepare("SELECT 1 FROM feeds WHERE user_id = ? AND kind = 'etl'").bind(userId).first();
  const list = [
    env.DB.prepare('DELETE FROM etl WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM etl_items WHERE user_id = ?').bind(userId),
    env.DB.prepare("DELETE FROM events WHERE user_id = ? AND source = 'etl' AND ext_id LIKE 'api-%'").bind(userId),
    logStatement(env, userId, 'etl_disconnect'),
  ];
  // eTL ICS 주소가 없으면 과제는 여기서 넣은 것뿐이라 같이 지운다(있으면 ICS가 계속 맡는다)
  if (!ics) list.push(env.DB.prepare("DELETE FROM tasks WHERE user_id = ? AND source = 'etl' AND ext_id LIKE 'event-assignment-%'").bind(userId));
  await env.DB.batch(list);
  return json({ ok: true, connected: false });
}

export async function status(env, userId, now = Date.now()) {
  const row = await env.DB.prepare('SELECT last_try_at, last_ok_at, last_error, dead_count FROM etl WHERE user_id = ?').bind(userId).first();
  if (!row) return { connected: false };
  const { results } = await env.DB.prepare('SELECT kind, count(*) AS n FROM etl_items WHERE user_id = ? GROUP BY kind').bind(userId).all();
  const counts = Object.fromEntries(results.map((r) => [r.kind, r.n]));
  return {
    connected: true,
    last_ok_at: row.last_ok_at,
    last_error: row.last_error,
    dead: row.dead_count >= DEAD_AFTER,
    counts: { notice: counts.notice || 0, file: counts.file || 0 },
  };
}

export async function listItems(env, userId) {
  const pick = async (kind) =>
    (
      await env.DB.prepare('SELECT id, course, title, url, posted_at, tag FROM etl_items WHERE user_id = ? AND kind = ? ORDER BY posted_at DESC, id DESC LIMIT 100')
        .bind(userId, kind)
        .all()
    ).results;
  return { notices: await pick('notice'), files: await pick('file') };
}

// ── eTL(Canvas) 부르기 ───────────────────────────────────────────

export class EtlError extends Error {
  constructor(message, { status = 0, auth = false, budget = false } = {}) {
    super(message);
    this.name = 'EtlError';
    this.status = status;
    this.auth = auth; // 401
    this.budget = budget; // 이번 차례 요청 한도를 다 씀
  }
}

/** budget = { left: n } — 이번 차례에 쓸 수 있는 외부 요청 수(AI 호출과 함께 센다) */
export function canvas(token, budget, doFetch = (...a) => fetch(...a)) {
  return async function get(pathOrUrl, params = null) {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${API}${pathOrUrl}${params ? `?${query(params)}` : ''}`;
    if (!url.startsWith(`${ORIGIN}/`)) throw new EtlError('eTL 밖 주소에는 토큰을 보내지 않는다');
    if (budget.left <= 0) throw new EtlError('이번 차례 요청 한도', { budget: true });
    budget.left -= 1;
    let res;
    try {
      res = await doFetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json+canvas-string-ids' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new EtlError('eTL에 닿지 못함');
    }
    if (res.status === 401) throw new EtlError('eTL 401', { status: 401, auth: true });
    if (!res.ok) throw new EtlError(`eTL ${res.status}`, { status: res.status });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new EtlError('eTL 답이 JSON이 아님', { status: res.status });
    }
    return { data, next: nextLink(res.headers.get('link')) };
  };
}

/** {a: 1, 'b[]': ['x', 'y']} → a=1&b[]=x&b[]=y */
export function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const one of Array.isArray(v) ? v : [v]) q.append(k, String(one));
  return q.toString().replace(/%5B%5D=/g, '[]=');
}

/** Link 머리글에서 rel="next" 주소. eTL 주소가 아니면 null(토큰을 다른 곳에 보내지 않게) */
export function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
    if (m && m[1].startsWith(`${ORIGIN}/`)) return m[1];
  }
  return null;
}

async function getAll(get, path, params, maxPages = 3) {
  const out = [];
  let page = await get(path, params);
  for (let i = 0; ; i++) {
    if (Array.isArray(page.data)) out.push(...page.data);
    if (!page.next || i + 1 >= maxPages) break;
    page = await get(page.next);
  }
  return out;
}

/** 과목마다 부르는 것: 권한 없음·없는 탭(401·403·404)은 그 과목만 빈 목록 */
async function perCourse(get, path, params) {
  try {
    return (await get(path, params)).data || [];
  } catch (err) {
    if (err instanceof EtlError && [401, 403, 404].includes(err.status)) return [];
    throw err;
  }
}

// ── 학기 ─────────────────────────────────────────────────────────

/** 이 날 보는 eTL term 이름들: 정규학기 + 걸쳐 있는 계절학기 */
export function termNames(now = Date.now()) {
  const d = new Date(now + KST_MS);
  const y = d.getUTCFullYear();
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const out = [md >= 301 && md < 901 ? `${y}년 1학기` : md >= 901 ? `${y}년 2학기` : `${y - 1}년 2학기`];
  if (md >= 620 && md < 901) out.push(`${y}년 여름학기`);
  if (md >= 1215) out.push(`${y}년 겨울학기`);
  if (md < 301) out.push(`${y - 1}년 겨울학기`);
  return out;
}

// ── 시각 ─────────────────────────────────────────────────────────

/** eTL 마감(UTC) → tasks.due. 23:59 마감은 ICS와 같게 '…T23:59:00+09:00', 나머지는 분까지 */
export function toDue(dueAt) {
  const ms = Date.parse(dueAt || '');
  if (!Number.isFinite(ms)) return null;
  const iso = kstIso(ms);
  return iso.slice(11, 16) === '23:59' ? `${iso.slice(0, 10)}T23:59:00+09:00` : `${iso.slice(0, 16)}:00+09:00`;
}

const kstMinute = (ms) => `${kstIso(ms).slice(0, 16)}:00+09:00`;
/** eTL 시각 글(UTC) → '…+09:00'(분까지). 없거나 틀리면 null */
const minuteOf = (text) => (Number.isFinite(Date.parse(text || '')) ? kstMinute(Date.parse(text)) : null);
const nextDate = (date) => kstDate(Date.parse(`${date}T00:00:00+09:00`) + DAY_MS);

/** 공지에서 찾은 칸 → 일정 시작·끝. 날짜를 모르면 null, 시각을 모르면 하루 종일 */
export function noticeWhen({ date, time, end_time: endTime }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(`${date}T00:00:00+09:00`))) return null;
  if (!/^\d{2}:\d{2}$/.test(time || '')) return { start: date, end: nextDate(date) };
  const start = `${date}T${time}:00+09:00`;
  const end = /^\d{2}:\d{2}$/.test(endTime || '') && endTime > time ? `${date}T${endTime}:00+09:00` : null;
  return { start, end };
}

// ── 모으기 ───────────────────────────────────────────────────────

const done = (a) => {
  const s = a.submission || {};
  return s.excused || ['submitted', 'graded', 'pending_review'].includes(s.workflow_state) || !!s.submitted_at ? 1 : 0;
};

/** 오래 안 받은 사람부터 요청 한도 안에서(Cron) */
export async function collectDue(env, now = Date.now(), doFetch) {
  const budget = { left: Number(env.ETL_REQUESTS_PER_RUN) || 40 };
  const before = kstIso(now - STALE_MS);
  const { results } = await env.DB.prepare(
    'SELECT user_id FROM etl WHERE dead_count < ? AND (last_try_at IS NULL OR last_try_at < ?) ORDER BY last_try_at LIMIT 10',
  )
    .bind(DEAD_AFTER, before)
    .all();
  const summary = { users: 0, ok: 0, failed: 0, left: 0 };
  for (const { user_id: userId } of results) {
    if (budget.left < NEED_PER_USER) break;
    summary.users += 1;
    const r = await collectUser(env, userId, { force: true, now, budget, doFetch });
    if (r.ok) summary.ok += 1;
    else if (!r.budget) summary.failed += 1;
  }
  summary.left = budget.left;
  return summary;
}

/**
 * 한 사람의 eTL을 받아 넣는다. 돌려주는 것: { ok, courses, tasks, notices, files, calendar, ai } 또는 { ok: false, error }
 * minGapMs 안에 받았으면 { ok: true, recent: true }.
 */
export async function collectUser(env, userId, { force = false, minGapMs = 0, now = Date.now(), budget = { left: 45 }, doFetch } = {}) {
  const row = await env.DB.prepare('SELECT * FROM etl WHERE user_id = ?').bind(userId).first();
  if (!row) return { ok: false, error: 'eTL이 연결되지 않았어요' };
  if (!force && minGapMs && row.last_try_at && Date.parse(row.last_try_at) > now - minGapMs) return { ok: true, recent: true };
  await env.DB.prepare('UPDATE etl SET last_try_at = ? WHERE user_id = ?').bind(kstIso(now), userId).run();

  let token;
  try {
    token = await unseal(env, row.token);
  } catch {
    await saveFailure(env, userId, MSG.auth, { dead: true, now });
    return { ok: false, error: MSG.auth };
  }
  const get = canvas(token, budget, doFetch);
  const terms = row.term ? [row.term] : termNames(now);
  const from = new Date(kstMidnight(now) - PAST_DAYS * DAY_MS).toISOString();
  const to = new Date(kstMidnight(now) + FUTURE_DAYS * DAY_MS).toISOString();

  try {
    const all = await getAll(get, '/courses', { enrollment_state: 'active', 'include[]': ['term', 'syllabus_body'], per_page: 100 });
    const courses = all
      .filter((c) => c && c.id && c.name && c.term && terms.includes(c.term.name))
      .map((c) => ({ id: String(c.id), name: courseName(c.name), term: c.term.name, ...sugangKey(c) }));
    const nameOf = new Map(courses.map((c) => [`course_${c.id}`, c.name]));
    const contexts = courses.map((c) => `course_${c.id}`);

    const assignments = [];
    for (const c of courses) {
      for (const a of await perCourse(get, `/courses/${c.id}/assignments`, { 'include[]': 'submission', order_by: 'due_at', per_page: 100 })) {
        if (a && a.id && a.name && a.published !== false) assignments.push({ extId: `event-assignment-${a.id}`, title: String(a.name).trim(), due: toDue(a.due_at), done: done(a) });
      }
    }

    const notices = [];
    const noticeBody = new Map();
    for (let i = 0; i < contexts.length; i += 10) {
      const part = await perCourse(get, '/announcements', { 'context_codes[]': contexts.slice(i, i + 10), start_date: from, end_date: new Date(now + DAY_MS).toISOString(), per_page: 50 });
      for (const n of part) {
        if (!n || !n.id || !nameOf.has(n.context_code)) continue;
        const extId = `notice-${n.id}`;
        notices.push({ kind: 'notice', course: nameOf.get(n.context_code), title: String(n.title || '(제목 없음)').trim(), url: safeUrl(n.html_url), posted: minuteOf(n.posted_at), extId });
        noticeBody.set(extId, n.message || '');
      }
    }

    const files = [];
    for (const c of courses) {
      for (const f of await perCourse(get, `/courses/${c.id}/files`, { sort: 'created_at', order: 'desc', per_page: FILES_PER_COURSE })) {
        if (!f || !f.id || f.hidden_for_user || f.locked_for_user) continue;
        files.push({ kind: 'file', course: c.name, title: String(f.display_name || f.filename || '파일').trim(), url: `${ORIGIN}/courses/${c.id}/files/${f.id}`, posted: minuteOf(f.created_at || f.updated_at), extId: `file-${f.id}` });
      }
    }

    const calendar = [];
    let calendarOk = true;
    for (let i = 0; i < contexts.length; i += 10) {
      try {
        const part = await get('/calendar_events', { type: 'event', 'context_codes[]': contexts.slice(i, i + 10), start_date: from, end_date: to, per_page: 100 });
        for (const e of part.data || []) {
          const start = Date.parse(e.start_at || '');
          if (!e.id || !e.title || !Number.isFinite(start)) continue;
          const end = Date.parse(e.end_at || '');
          const allDay = !!e.all_day;
          const startText = allDay ? kstDate(start) : kstMinute(start);
          calendar.push({
            id: String(e.id),
            extId: `api-calendar-${e.id}`,
            title: String(e.title).trim(),
            start: startText,
            end: allDay ? nextDate(startText) : Number.isFinite(end) && end > start ? kstMinute(end) : null,
            place: e.location_name ? String(e.location_name).trim() : null,
          });
        }
      } catch (err) {
        if (err instanceof EtlError && err.budget) throw err;
        calendarOk = false; // 과목 일정은 덤: 못 받아도(401 포함 — 토큰은 /courses에서 이미 확인) 나머지는 넣는다
      }
    }

    const ics = await env.DB.prepare("SELECT 1 FROM feeds WHERE user_id = ? AND kind = 'etl' AND dead_count < 2").bind(userId).first();
    // eTL ICS에 이미 있는 과목 일정('event-calendar-event-<id>')은 두 번 넣지 않는다(있던 'api-' 줄은 아래 지우기에서 빠진다)
    const { results: icsCal } = await env.DB.prepare("SELECT ext_id FROM events WHERE user_id = ? AND source = 'etl' AND ext_id LIKE 'event-calendar-event-%'")
      .bind(userId)
      .all();
    const inIcs = new Set(icsCal.map((r) => r.ext_id.slice('event-calendar-event-'.length)));
    const calendarNew = calendar.filter((e) => !inIcs.has(e.id));

    // 수업 시간표: 시간표 사진으로 넣은 수업이 오늘 뒤로 있으면 건너뛴다(같은 수업이 두 번 보이지 않게)
    const today = kstDate(now);
    const photo = await env.DB.prepare("SELECT 1 FROM events WHERE user_id = ? AND source = 'timetable' AND start >= ? LIMIT 1").bind(userId, today).first();
    const timetable = photo ? null : await classEvents(courses, today, semesterEnd(today));
    const statements = [
      // 과제: ICS와 같은 ext_id. ICS가 있으면 done만 올리고, 없으면 이름·마감도 맞춘다
      env.DB.prepare(
        `INSERT INTO tasks (user_id, title, due, done, source, ext_id)
         SELECT ?1, j.value ->> 'title', j.value ->> 'due', j.value ->> 'done', 'etl', j.value ->> 'extId' FROM json_each(?2) AS j WHERE true
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET
           done = MAX(tasks.done, excluded.done),
           title = CASE WHEN ?3 THEN excluded.title ELSE tasks.title END,
           due = CASE WHEN ?3 THEN excluded.due ELSE tasks.due END
         WHERE tasks.done < excluded.done OR (?3 AND (tasks.title IS NOT excluded.title OR tasks.due IS NOT excluded.due))`,
      ).bind(userId, JSON.stringify(assignments), ics ? 0 : 1),
      env.DB.prepare(
        `INSERT INTO etl_items (user_id, kind, course, title, url, posted_at, ext_id)
         SELECT ?1, j.value ->> 'kind', j.value ->> 'course', j.value ->> 'title', j.value ->> 'url', j.value ->> 'posted', j.value ->> 'extId' FROM json_each(?2) AS j WHERE true
         ON CONFLICT (user_id, ext_id) DO UPDATE SET course = excluded.course, title = excluded.title, url = excluded.url, posted_at = excluded.posted_at
         WHERE etl_items.course IS NOT excluded.course OR etl_items.title IS NOT excluded.title OR etl_items.url IS NOT excluded.url OR etl_items.posted_at IS NOT excluded.posted_at`,
      ).bind(userId, JSON.stringify([...notices, ...files])),
      env.DB.prepare(
        `INSERT INTO events (user_id, title, start, "end", place, source, ext_id)
         SELECT ?1, j.value ->> 'title', j.value ->> 'start', j.value ->> 'end', j.value ->> 'place', 'etl', j.value ->> 'extId' FROM json_each(?2) AS j WHERE true
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place
         WHERE events.title IS NOT excluded.title OR events.start IS NOT excluded.start OR events."end" IS NOT excluded."end" OR events.place IS NOT excluded.place`,
      ).bind(userId, JSON.stringify(timetable ? [...calendarNew, ...timetable.events] : calendarNew)),
    ];
    if (timetable) {
      statements.push(
        env.DB.prepare(
          `DELETE FROM events WHERE user_id = ?1 AND source = 'etl' AND ext_id LIKE 'api-class-%' AND start >= ?2
             AND ext_id NOT IN (SELECT value FROM json_each(?3))`,
        ).bind(userId, today, JSON.stringify(timetable.events.map((e) => e.extId))),
      );
    }
    if (calendarOk) {
      statements.push(
        env.DB.prepare(
          `DELETE FROM events WHERE user_id = ?1 AND source = 'etl' AND ext_id LIKE 'api-calendar-%' AND start >= ?2 AND start < ?3
             AND ext_id NOT IN (SELECT value FROM json_each(?4))`,
        ).bind(userId, kstDate(Date.parse(from)), kstDate(Date.parse(to)), JSON.stringify(calendarNew.map((e) => e.extId))),
      );
    }
    await env.DB.batch(statements);

    const ai = await readNotices(env, userId, { noticeBody, budget, now, doFetch });
    const counts = {
      courses: courses.length,
      tasks: assignments.length,
      notices: notices.length,
      files: files.length,
      calendar: calendarNew.length,
      classes: timetable ? timetable.matched : 0, // 수강편람에서 찾은 과목 수(못 찾은 과목은 대학원 과목 등)
      ai,
    };
    await env.DB.batch([
      env.DB.prepare('UPDATE etl SET last_ok_at = ?, last_error = NULL, dead_count = 0 WHERE user_id = ?').bind(kstIso(now), userId),
      logStatement(env, userId, 'etl_sync', counts),
    ]);
    return { ok: true, ...counts };
  } catch (err) {
    if (err instanceof EtlError && err.budget) return { ok: false, budget: true, error: '다음 차례에 이어서 받아요' };
    if (err instanceof EtlError && err.auth) {
      await saveFailure(env, userId, MSG.auth, { dead: true, now, status: 401 });
      return { ok: false, error: MSG.auth };
    }
    if (!(err instanceof EtlError)) console.error('eTL 수집 오류', err && err.message);
    await saveFailure(env, userId, MSG.down, { now, status: err && err.status });
    return { ok: false, error: MSG.down };
  }
}

/**
 * eTL 과목 → 수강편람 열쇠 { sbjtCd, ltNo }. 강의계획서 칸(syllabus_body)의 iframe 주소에 'sbjtCd=…&ltNo=…'가 있다(팀원 11-10).
 * 없으면 분반만 과목 코드 '2026-2 과목명 (001)'에서.
 */
export function sugangKey(course) {
  const body = String(course.syllabus_body || '');
  const code = /sbjtCd=([A-Za-z0-9.]+)/.exec(body);
  const no = /ltNo=(\d{1,3})/.exec(body) || /\((\d{3})\)\s*$/.exec(String(course.course_code || course.name || ''));
  return { sbjtCd: code ? code[1] : null, ltNo: no ? no[1].padStart(3, '0') : null };
}

/** TT Wizard roomLabel: '39동 409호', 호실이 글자면 '301동 강당', 건물만 알면 '301동', 모르면 null */
export function roomLabel(building, room) {
  if (!building) return null;
  if (!room) return `${building}동`;
  return /^[A-Za-z]?\d/.test(room) ? `${building}동 ${room}호` : `${building}동 ${room}`;
}

const hm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * 과목들 → 수강편람에서 찾은 매주 수업 → from~until 날마다 일정. 그 학기 편람이 없으면 null.
 * 돌려주는 것: { events: [{ extId, title, start, end, place }], matched: 찾은 과목 수 }
 */
export async function classEvents(courses, from, until, offerings = OFFERINGS) {
  const term = courses[0] && courses[0].term;
  if (!term || !offerings[term]) return null;
  const book = (await offerings[term]()).default;
  const byId = new Map(book.courses.map((c) => [c[0], c]));
  const byName = new Map();
  for (const c of book.courses) byName.set(c[1], byName.has(c[1]) ? null : c); // 같은 이름 과목이 둘이면 이름으로는 안 찾는다
  const weekly = [];
  let matched = 0;
  for (const c of courses) {
    if (c.term !== term || !c.ltNo) continue;
    const entry = (c.sbjtCd && byId.get(c.sbjtCd)) || byName.get(c.name);
    const section = entry && entry[5].find((sec) => sec[0] === c.ltNo);
    if (!section) continue;
    matched += 1;
    for (const [day, start, end, building, room] of section[2]) {
      if (!(day >= 0 && day <= 6) || !(end > start)) continue;
      weekly.push({ courseId: c.id, title: c.name, day, start, end, place: roomLabel(building, room) });
    }
  }
  const events = [];
  for (let d = from; d <= until; d = nextDate(d)) {
    const wd = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = 월
    for (const w of weekly) {
      if (w.day !== wd) continue;
      events.push({
        extId: `api-class-${w.courseId}-${d}-${hm(w.start).replace(':', '')}`,
        title: w.title,
        start: `${d}T${hm(w.start)}:00+09:00`,
        end: `${d}T${hm(w.end)}:00+09:00`,
        place: w.place,
      });
    }
  }
  return { events, matched };
}

/** eTL 과목 이름 '2026-2 생명과학 (001)' → '생명과학'(앞의 학기·뒤의 분반을 뗀다, 팀원 11-10) */
export const courseName = (name) =>
  String(name || '')
    .trim()
    .replace(/^\d{4}-[12SW]\s+/, '')
    .replace(/\s*\(\d{3}\)$/, '') || String(name || '').trim();

const safeUrl = (u) => (typeof u === 'string' && u.startsWith(`${ORIGIN}/`) && !/[?&]verifier=/.test(u) ? u : null);

async function saveFailure(env, userId, message, { dead = false, now = Date.now(), status = 0 } = {}) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE etl SET last_error = ?, dead_count = ${dead ? 'dead_count + 1' : 'dead_count'} WHERE user_id = ?`).bind(message, userId),
    logStatement(env, userId, 'etl_fail', { status, dead }),
  ]);
}

// ── 공지 → 시험·휴강·보강 ────────────────────────────────────────

/**
 * 아직 안 읽은 공지(tag NULL)를 읽는다. 낱말이 없으면 AI 없이 'none'. 있으면 AI가 날짜를 찾고 일정(source 'notice')을 넣는다.
 * 한 번에 AI_PER_USER개까지, AI가 실패하면 tag를 그대로 둬 다음 차례에 다시. 돌려주는 것: AI로 읽은 공지 수
 */
async function readNotices(env, userId, { noticeBody, budget, now, doFetch }) {
  const { results } = await env.DB.prepare(
    "SELECT id, course, title, posted_at, ext_id FROM etl_items WHERE user_id = ? AND kind = 'notice' AND tag IS NULL ORDER BY posted_at DESC LIMIT 20",
  )
    .bind(userId)
    .all();
  const writes = [];
  let asked = 0;
  for (const n of results) {
    const text = noticeText(noticeBody.get(n.ext_id));
    if (!noticeBody.has(n.ext_id) || !mightHaveDates(n.title, text)) {
      writes.push(env.DB.prepare("UPDATE etl_items SET tag = 'none' WHERE id = ?").bind(n.id));
      continue;
    }
    if (asked >= AI_PER_USER || budget.left < 1 || !(env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY_2)) continue;
    asked += 1;
    budget.left -= 1;
    let r;
    try {
      r = await askJson(env, {
        model: 'fast',
        system: SYSTEM,
        content: userMessage({ course: n.course, title: n.title, postedLabel: postedLabel(n.posted_at || kstIso(now)), text }),
        schema: SCHEMA,
        maxTokens: 400,
        timeoutMs: 15000,
        fetch: doFetch,
      });
    } catch (err) {
      console.error('eTL 공지 AI 실패', err && err.message);
      continue;
    }
    writes.push(logStatement(env, userId, 'llm', { use: 'etl_notice', model: r.model, ms: r.ms, in: r.usage.input, out: r.usage.output }));
    const events = noticeEvents(n, (r.data && r.data.items) || [], now);
    const tag = tagOf((r.data && r.data.items) || []);
    writes.push(env.DB.prepare('UPDATE etl_items SET tag = ? WHERE id = ?').bind(tag, n.id));
    if (events.length) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO events (user_id, title, start, "end", place, source, ext_id)
           SELECT ?1, j.value ->> 'title', j.value ->> 'start', j.value ->> 'end', j.value ->> 'place', 'notice', j.value ->> 'extId' FROM json_each(?2) AS j WHERE true
           ON CONFLICT (user_id, source, ext_id) DO NOTHING`,
        ).bind(userId, JSON.stringify(events)),
      );
    }
  }
  if (writes.length) await env.DB.batch(writes);
  return asked;
}

/** '2026-04-01 (수)' */
function postedLabel(iso) {
  const ms = Date.parse(iso);
  const d = new Date(ms + KST_MS);
  return `${kstDate(ms)} (${'일월화수목금토'[d.getUTCDay()]})`;
}

const KIND_ORDER = ['exam', 'cancel', 'makeup'];
export const tagOf = (items) => KIND_ORDER.find((k) => items.some((it) => it && it.kind === k)) || 'none';

/** AI가 찾은 칸 → 일정. 제목은 '과목 + 공지에 쓴 말'(예: '생명과학 중간고사', '생명과학 휴강'). 날짜 모름·기간 밖은 뺀다 */
export function noticeEvents(notice, items, now = Date.now()) {
  const first = kstDate(kstMidnight(now) - PAST_DAYS * DAY_MS);
  const last = kstDate(kstMidnight(now) + FUTURE_DAYS * DAY_MS);
  const out = [];
  items.forEach((it, i) => {
    if (!it || !KIND_ORDER.includes(it.kind)) return;
    const when = noticeWhen(it);
    if (!when || when.start.slice(0, 10) < first || when.start.slice(0, 10) >= last) return;
    const words = String(it.title || '').trim();
    const title = `${notice.course} ${words && words !== '?' ? words : it.kind === 'exam' ? '시험' : it.kind === 'cancel' ? '휴강' : '보강'}`;
    out.push({ extId: `${notice.ext_id}-${i}`, title, start: when.start, end: when.end, place: it.place && it.place !== '?' ? String(it.place).trim() : null });
  });
  return out;
}
