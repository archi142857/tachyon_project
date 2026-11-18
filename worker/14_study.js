// 14. 공부방 · 튜터 — AI 앱(MCP)에서 쓰는 시험 공부. 도구는 13_mcp.js가 그대로 내보낸다(이 파일은 주소가 없다).
//
// 11-19 사람: "tachyon mcp가 연결 되면, 사용자들이 각자의 ai 서비스 내에서 튜터를 이용할거야. alter 시스템을 가져가되, r은 빼줘도 될 것 같고,
//   Tuter를 핵심으로 해줘. L은 tachyon이 대신할거야. 연결을 하면 자동으로 공부방이 알아서 생기면 좋을 것 같고, 튜토리얼도. 문제를 내면서
//   이용자의 수준을 파악하고, 빈틈을 채워주는 식. 대신 etl 자료들의 내용을 하나라도 빼먹으면 안돼. 사용자가 시험범위가 아니라고 하면 하지 마.
//   시작할 때 시험범위를 물어보게 하면 좋겠고, 학습 구조를 잘 시각화해주면 좋을 것 같아."
//
// 누가 무엇을 (ALTER에서 룸메이트를 뺀 넷)
// - 🧑‍🏫 튜터(핵심) · 🧭 조언자 · ✍️ 편집자 = 사용자의 AI 앱. 규칙(PLAYBOOK)·튜토리얼은 study_rooms 답에 실려 간다.
// - 📚 Tachyon(사서) = 이 파일: 자료를 찾고, 쪽마다 빠짐없이 옮겨 적어 주고(prompts/study_read.js), 범위·지도·진도를 지킨다.
// - 방 = 이번 학기 eTL 과목 하나. 만드는 단계가 없다: eTL을 연결해 두면 study_rooms에 바로 보이고, 처음 열 때 study 표에 줄이 생긴다.
//
// 빠짐 없게 — 코드가 막는다
// 1. 범위: 과목의 강의자료 전부(eTL 파일 탭 + 모듈, 열 때마다 받음)를 사용자가 범위 안·밖으로 정한다. 시험을 안 정했거나 정하지 않은 자료가
//    하나라도 있으면 phase 'scope'(새로 올라온 자료도 '미정'으로 나타난다). 범위에서 빼는 길은 study_set_scope 하나(사용자가 말했을 때만).
// 2. 읽기: 범위 안 자료의 모든 쪽을 study_read로 읽어야 지도를 저장할 수 있다. 모델이 빠뜨린 쪽은 읽은 것으로 치지 않는다.
//    읽을 수 없는 형식(pptx·hwp·영상 …)은 '못 읽음'으로 지도에 남는다 → 사용자가 채팅에 올리면 AI 앱이 읽고 by_client로 지도를 낸다.
// 3. 지도: 모든 쪽이 개념 하나 이상이나 '건너뜀(이유)'에 들어가야 저장된다.
// 4. 확인: 범위 안 개념마다 문제를 하나 이상 내고 study_record에 적는다. 다 ✓여야 phase 'done'.
//    다음 개념(next): 다시 물을 때가 된 빈틈(✗·△, 3문제 뒤) → 아직 한 문제도 안 낸 절의 첫 개념(진단) → 약한 절부터 안 본 개념 → 남은 빈틈.
//
// 저장하는 것(study 표, 사람 × 과목 한 줄): 시험 이름·날짜·범위 말, 자료 목록(eTL 파일 번호·이름·주차), 쪽 수·읽은 쪽,
//   지도(절·개념 이름과 쪽 번호), 개념마다 결과, 오답 노트(문제·틀린 점 300자까지).
// 저장하지 않는 것: 파일, 내려받기 주소(검증값), 옮겨 적은 글 — 사용자의 AI 앱에 바로 넘기고 버린다(9_etl.js '복사하지 않음' 그대로).
//   읽을 때 Anthropic에는 파일 저장소의 짧게 사는 주소만 보낸다(eTL 주소의 리다이렉트를 Worker가 따라가 끝 주소를 넘김 — CPU 안 씀).
// 비용: study_read 한 번 = Claude API 한 번(빠른 모델, 문서 전체가 입력). 하루 STUDY_READS_PER_DAY번(기본 60 ≈ 720쪽)까지.
// log: study_read { model, ms, in, out, pages } · study_read_fail { status, msg } · 표(study)가 원격 D1에 아직 없으면 '준비 중'.

import { askJson } from './llm.js';
import { SYSTEM as READ_SYSTEM, SCHEMA as READ_SCHEMA, userText as readText } from './prompts/study_read.js';
import { unseal } from './lib/secret.js';
import { logAction } from './lib/log.js';
import { kstDate, kstIso, DAY_MS } from './lib/time.js';
import { EtlError, canvas, courseName, getAll, termNames } from './9_etl.js';
import { MAP_URI, MAP_HTML } from './14_study_map.js';

export class StudyError extends Error {}

const READ_DEFAULT = 12; // study_read 한 번에 옮기는 쪽. 부를 때마다 문서 전체가 입력값이라 너무 잘게 나누지 않는다(Claude 앱 도구 제한 240초 안)
const READ_MAX = 20;
const GAP = 3; // 틀린 개념은 다른 문제 3개 뒤에 다시
const READABLE = new Set(['pdf', 'image', 'text']);
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'py', 'c', 'h', 'cpp', 'java', 'js', 'ts', 'r', 'm', 'sql', 'tex']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const NEW_DATA = '{"turn":0,"files":[],"wrong":[]}';
const MSG = {
  noEtl: 'eTL이 아직 연결되지 않았어요. Tachyon 앱 → 메뉴 → eTL 연결에서 eTL 액세스 토큰을 넣으면 과목마다 공부방이 생겨요.',
  auth: 'eTL 토큰이 더는 안 먹어요. Tachyon 앱 → 메뉴 → eTL 연결에서 다시 연결해 주세요.',
  table: '공부방은 아직 준비 중이에요(서버 표가 없어요).',
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const noTable = (err) => /no such table/i.test(String(err && err.message));

// ── 쪽 번호 ─────────────────────────────────────────────────────

/** '1-3,5' → [1, 2, 3, 5] (1..max 안). 모양이 틀리거나 비면 null */
export function parsePages(text, max = 0) {
  const out = new Set();
  for (const part of String(text ?? '').split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)(?:\s*[-~]\s*(\d+))?$/.exec(p);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b < a || b - a > 2000 || (max && b > max)) return null;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** [1, 2, 3, 5] → '1-3,5' */
export function pagesText(list) {
  const s = [...new Set(list)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(s[i] === s[j] ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j;
  }
  return out.join(',');
}

const allPages = (n) => Array.from({ length: n }, (_, i) => i + 1);
const unreadOf = (f) => {
  if (!f.pages) return null;
  const read = new Set(parsePages(f.read) || []);
  return allPages(f.pages).filter((p) => !read.has(p));
};

// ── eTL ─────────────────────────────────────────────────────────

async function etlOf(env, userId) {
  const row = await env.DB.prepare('SELECT token, term FROM etl WHERE user_id = ?').bind(userId).first();
  if (!row) throw new StudyError(MSG.noEtl);
  let token;
  try {
    token = await unseal(env, row.token);
  } catch {
    throw new StudyError(MSG.auth);
  }
  const get = canvas(token, { left: 40 });
  return {
    terms: row.term ? [row.term] : termNames(),
    get: async (...a) => {
      try {
        return await get(...a);
      } catch (err) {
        if (!(err instanceof EtlError)) throw err;
        if (err.auth) throw new StudyError(MSG.auth);
        if ([403, 404].includes(err.status)) throw err;
        throw new StudyError(`eTL에 지금 닿지 않아요(${err.message}). 잠시 뒤 다시 해 주세요.`);
      }
    },
  };
}

async function coursesOf(etl) {
  const all = await getAll(etl.get, '/courses', { enrollment_state: 'active', 'include[]': ['term'], per_page: 100 });
  return all.filter((c) => c && c.id && c.name && c.term && etl.terms.includes(c.term.name)).map((c) => ({ id: String(c.id), name: courseName(c.name) }));
}

/** 닫힌 탭(403·404)은 빈 목록 */
async function tab(etl, path, params) {
  try {
    return await getAll(etl.get, path, params, 5);
  } catch (err) {
    if (err instanceof EtlError && [403, 404].includes(err.status)) return [];
    throw err;
  }
}

function typeOf(name, mime) {
  const ext = (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1]?.toLowerCase() || '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^image\/(png|jpeg|gif|webp)$/.test(mime || '') || IMAGE_EXT.has(ext)) return 'image';
  if (/^text\//.test(mime || '') || TEXT_EXT.has(ext)) return 'text';
  return ext || 'file';
}

/**
 * 과목의 강의자료 전부: 파일 탭 + 모듈의 파일(파일 탭을 닫은 과목도 모듈로 올린 자료는 보인다).
 * 모듈 순서(주차)가 먼저, 모듈에 없는 파일은 올린 날 순서로 뒤에.
 * ponytail: 파일 탭 500개 · 모듈 250개까지(getAll 5쪽). 그보다 큰 과목이 나오면 쪽 수를 늘린다.
 */
export async function materials(etl, courseId) {
  const byId = new Map();
  for (const f of await tab(etl, `/courses/${courseId}/files`, { per_page: 100, sort: 'created_at' })) {
    if (!f || !f.id || f.hidden_for_user || f.locked_for_user) continue;
    const title = clean(f.display_name || f.filename || '파일');
    byId.set(String(f.id), { id: String(f.id), title, type: typeOf(title, f['content-type']), posted: (f.created_at || '').slice(0, 10) || null, module: null, at: null });
  }
  let n = 0;
  for (const m of await tab(etl, `/courses/${courseId}/modules`, { 'include[]': 'items', per_page: 50 })) {
    for (const it of (m && m.items) || []) {
      if (!it || it.type !== 'File' || !it.content_id) continue;
      const id = String(it.content_id);
      const f = byId.get(id) || { id, title: clean(it.title || '파일'), type: typeOf(it.title), posted: null, module: null, at: null };
      f.module ??= clean(m.name, 80) || null;
      f.at ??= n++;
      byId.set(id, f);
    }
  }
  return [...byId.values()].sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9) || String(a.posted).localeCompare(String(b.posted)) || a.title.localeCompare(b.title));
}

/** eTL 내려받기 주소 → 리다이렉트 끝(파일 저장소의 짧게 사는 주소). 본문은 받지 않는다 */
async function finalUrl(url) {
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    res.body?.cancel();
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      url = new URL(next, url).href;
      continue;
    }
    if (!res.ok) throw new StudyError(`eTL에서 파일을 못 받았어요(${res.status})`);
    return url;
  }
  return url;
}

// ── 방 ─────────────────────────────────────────────────────────

async function rowsOf(env, userId) {
  try {
    return (await env.DB.prepare('SELECT * FROM study WHERE user_id = ? ORDER BY updated_at DESC').bind(userId).all()).results;
  } catch (err) {
    if (noTable(err)) throw new StudyError(MSG.table);
    throw err;
  }
}

function pick(list, text, label) {
  const q = norm(text);
  if (!q) throw new StudyError(`course가 필요해요. ${label}: ${list.map((c) => c.name).join(', ') || '없음'}`);
  const exact = list.find((c) => c.id === String(text).trim() || norm(c.name) === q);
  if (exact) return exact;
  const hits = list.filter((c) => norm(c.name).includes(q));
  if (hits.length === 1) return hits[0];
  throw new StudyError(
    hits.length ? `여러 과목이 맞아요: ${hits.map((c) => c.name).join(', ')} — 하나를 골라 주세요` : `'${text}' 과목이 없어요. ${label}: ${list.map((c) => c.name).join(', ') || '없음'}`,
  );
}

/** 이미 연 방(eTL을 다시 부르지 않음) */
async function roomOf(env, userId, course) {
  const rows = await rowsOf(env, userId);
  const c = pick(rows.map((r) => ({ id: r.course_id, name: r.course })), course, '연 공부방(처음이면 study_room으로 먼저 여세요)');
  const row = rows.find((r) => r.course_id === c.id);
  return { row, data: JSON.parse(row.data || NEW_DATA) };
}

/** 방 열기: 없으면 만들고, eTL 자료 목록을 지금 것으로 맞춘다(새 자료 = 범위 미정) */
async function openRoom(env, userId, course) {
  const etl = await etlOf(env, userId);
  const c = pick(await coursesOf(etl), course, '이번 학기 eTL 과목');
  await rowsOf(env, userId); // 표가 없으면 여기서 '준비 중'
  await env.DB.prepare('INSERT OR IGNORE INTO study (user_id, course_id, course, data, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, c.id, c.name, NEW_DATA, kstIso())
    .run();
  const row = await env.DB.prepare('SELECT * FROM study WHERE user_id = ? AND course_id = ?').bind(userId, c.id).first();
  const data = JSON.parse(row.data || NEW_DATA);
  const list = await materials(etl, c.id);
  const old = new Map(data.files.map((f) => [f.id, f]));
  const files = list.map(({ at, ...m }) => {
    const o = old.get(m.id);
    return { in: null, ...o, ...m, type: m.type === 'file' && o ? o.type : m.type, gone: undefined }; // 'file' = 목록에선 형식을 모름 → 읽을 때 정한 것을 둔다
  });
  for (const f of data.files) if (!list.some((m) => m.id === f.id) && f.sections) files.push({ ...f, gone: true }); // eTL에서 내려간 자료도 진도는 남긴다
  data.files = files;
  row.course = c.name;
  await save(env, row, data);
  return { row, data, etl };
}

async function save(env, row, data) {
  row.data = JSON.stringify(data);
  row.updated_at = kstIso();
  await env.DB.prepare('UPDATE study SET course = ?, exam = ?, exam_date = ?, scope_note = ?, data = ?, updated_at = ? WHERE user_id = ? AND course_id = ?')
    .bind(row.course, row.exam ?? null, row.exam_date ?? null, row.scope_note ?? null, row.data, row.updated_at, row.user_id, row.course_id)
    .run();
}

// ── 지도 · 진도 ──────────────────────────────────────────────────

/** 범위 안 개념을 자료 → 절 → 개념 순서로 */
function conceptsIn(data) {
  const out = [];
  data.files.forEach((f) => {
    if (f.in !== true) return;
    (f.sections || []).forEach((s, si) => {
      if (s.out) return;
      s.concepts.forEach((c, ci) => {
        if (!c.out) out.push({ c, s, f, id: `${f.id}.${si + 1}.${ci + 1}` });
      });
    });
  });
  return out;
}

const SCORE = { ok: 1, part: 0.5, wrong: 0 };
function levelOf(s) {
  const tried = s.concepts.filter((c) => !c.out && c.s);
  return tried.length ? Math.round((100 * tried.reduce((a, c) => a + SCORE[c.s], 0)) / tried.length) : null;
}

/** 'file' = 아직 모르는 형식(모듈 자료 이름에 확장자가 없음) → 읽어 보며 정한다 */
const unreadable = (type) => !READABLE.has(type) && type !== 'file';
const cantRead = (f) =>
  `'${f.title}'(${f.type})은 Tachyon이 못 읽는 형식이에요. 사용자에게 PDF나 파일을 이 채팅에 올려 달라고 해서 직접 읽고 study_save_map(by_client: true, total_pages)으로 지도를 내거나, 범위 밖인지 물어 주세요`;

function stateOf(f) {
  if (f.in == null) return 'undecided';
  if (f.in === false) return 'out';
  if (f.sections) return 'mapped';
  if (unreadable(f.type)) return 'unreadable';
  return f.read ? 'reading' : 'unread';
}

export function nextConcept(data) {
  const all = conceptsIn(data);
  const turn = data.turn || 0;
  const gap = (x) => x.c.s === 'wrong' || x.c.s === 'part';
  let hit = all.find((x) => gap(x) && turn - (x.c.t ?? 0) >= GAP);
  let why = 'gap';
  if (!hit) {
    hit = all.find((x) => !x.s.concepts.some((c) => !c.out && c.s) && !x.c.s);
    why = 'diagnose';
  }
  if (!hit) {
    const fresh = all.filter((x) => !x.c.s).map((x, i) => ({ x, i, lv: levelOf(x.s) ?? 101 }));
    fresh.sort((a, b) => a.lv - b.lv || a.i - b.i);
    hit = fresh[0]?.x;
    why = 'new';
  }
  if (!hit) {
    hit = all.find(gap);
    why = 'gap';
  }
  if (!hit) return null;
  return { id: hit.id, name: hit.c.name, pages: hit.c.pages, section: hit.s.title, file: hit.f.id, file_title: hit.f.title, tried: hit.c.n || 0, last: hit.c.s || null, why };
}

export function statsOf(data) {
  const fin = data.files.filter((f) => f.in === true);
  const all = conceptsIn(data);
  const count = (s) => all.filter((x) => x.c.s === s).length;
  const ok = count('ok');
  return {
    files_in: fin.length,
    files_out: data.files.filter((f) => f.in === false).length,
    files_undecided: data.files.filter((f) => f.in == null).length,
    files_unmapped: fin.filter((f) => !f.sections).length,
    pages_total: fin.reduce((a, f) => a + (f.pages || 0), 0),
    pages_read: fin.reduce((a, f) => a + (f.sections ? f.pages || 0 : (parsePages(f.read) || []).length), 0),
    concepts: all.length,
    ok,
    part: count('part'),
    wrong: count('wrong'),
    unseen: all.filter((x) => !x.c.s).length,
    percent: all.length ? Math.round((100 * ok) / all.length) : 0,
  };
}

function phaseOf(row, data, stats) {
  if (!row.exam || stats.files_undecided) return 'scope';
  if (stats.files_unmapped || !stats.concepts) return 'read';
  return stats.ok === stats.concepts ? 'done' : 'tutor';
}

const dday = (date) => {
  if (!date) return null;
  const n = Math.round((Date.parse(date) - Date.parse(kstDate())) / DAY_MS);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`;
};

/** 지도 화면·글에 쓰는 모양 */
function viewOf(row, data) {
  const stats = statsOf(data);
  const files = data.files.map((f, i) => ({
    id: f.id,
    n: i + 1,
    title: f.title,
    module: f.module || null,
    type: f.type,
    state: stateOf(f),
    gone: !!f.gone,
    pages: f.pages || null,
    read: f.sections ? (f.pages ? `1-${f.pages}` : '') : f.read || '',
    skip: f.skip || [],
    sections: (f.sections || []).map((s, si) => ({
      id: `${f.id}.${si + 1}`,
      title: s.title,
      pages: s.pages,
      out: !!s.out,
      done: s.out ? null : `${s.concepts.filter((c) => !c.out && c.s === 'ok').length}/${s.concepts.filter((c) => !c.out).length}`, // 확인한 개념/개념
      concepts: s.concepts.map((c, ci) => ({ id: `${f.id}.${si + 1}.${ci + 1}`, name: c.name, pages: c.pages, s: s.out || c.out ? 'out' : c.s || null, n: c.n || 0 })),
    })),
  }));
  const next = nextConcept(data);
  return {
    course: row.course,
    course_id: row.course_id,
    exam: row.exam || null,
    exam_date: row.exam_date || null,
    d_day: dday(row.exam_date),
    scope_note: row.scope_note || null,
    phase: phaseOf(row, data, stats),
    stats,
    files,
    next,
    wrong_open: (data.wrong || []).filter((w) => !w.fixed).slice(-15),
  };
}

const MARK = { ok: '✓', part: '△', wrong: '✗', out: '–' };
const STATE_TEXT = { unread: '아직 안 읽음', reading: '읽는 중', unreadable: '못 읽는 형식 — 채팅에 PDF로 올리거나 범위 밖인지 말해 줘' };

/** 창(MCP Apps)이 안 뜨는 앱에서 그대로 보여 줄 글 지도 */
export function mapText(v) {
  const s = v.stats;
  const filled = Math.round(s.percent / 5);
  const L = [
    `${v.course} · ${v.exam || '시험 미정'}${v.exam_date ? ` ${v.exam_date.slice(5)} (${v.d_day})` : ''}`,
    `확인 ${s.ok}/${s.concepts} (${s.percent}%)  ✓${s.ok} △${s.part} ✗${s.wrong} ○${s.unseen}  · 읽은 쪽 ${s.pages_read}/${s.pages_total}`,
    `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}]`,
    '',
  ];
  for (const f of v.files.filter((x) => x.state !== 'out' && x.state !== 'undecided')) {
    const head = `${f.n}. ${f.module ? `${f.module} · ` : ''}${f.title}`;
    if (f.state !== 'mapped') {
      const done = (parsePages(f.read) || []).length;
      L.push(`${head} — ${STATE_TEXT[f.state]}${f.state === 'reading' && f.pages ? ` ${done}/${f.pages}쪽` : ''}`);
      continue;
    }
    L.push(`${head} (${f.pages}쪽)`);
    f.sections.forEach((sec, i) => {
      const marks = sec.concepts.map((c) => MARK[c.s] || '○').join('');
      L.push(`   ${i + 1}) ${sec.title}  ${sec.out ? '– 범위 밖' : marks}${sec.done ? `  ${sec.done}` : ''}`);
      for (const c of sec.concepts) if (c.s === 'wrong' || c.s === 'part') L.push(`      ${MARK[c.s]} ${c.name} (p.${c.pages})`);
    });
  }
  const undecided = v.files.filter((x) => x.state === 'undecided');
  const out = v.files.filter((x) => x.state === 'out');
  if (undecided.length) L.push('', `? 범위 미정: ${undecided.map((x) => `${x.n}. ${x.title}`).join(', ')}`);
  if (out.length) L.push(`– 범위 밖: ${out.map((x) => `${x.n}. ${x.title}`).join(', ')}`);
  if (v.next) L.push('', `다음: ${v.next.name} (${v.next.file_title} p.${v.next.pages})`);
  return L.join('\n');
}

// ── 사용자 AI에게 주는 규칙 ────────────────────────────────────────

export const PLAYBOOK = `Tachyon 공부방 규칙 — ALTER에서 룸메이트를 뺀 넷. 사회자는 너(AI 앱)다. 발언 앞에 멤버 머리표를 붙이고, 기본은 🧑‍🏫 튜터.
- 🧑‍🏫 튜터(핵심): 문제를 내며 수준을 재고 빈틈을 채운다.
- 📚 Tachyon(사서): eTL 강의자료를 찾고 쪽마다 빠짐없이 읽어 준다(study_room · study_read). 자료 이야기는 Tachyon 이름으로.
- 🧭 조언자: 시험까지 남은 날과 빈 시간으로 공부 순서·시간을 짠다(get_schedule · find_free_time → 사용자가 좋다고 하면 add_event로 Tachyon 달력에 공부 시간).
- ✍️ 편집자: 사용자가 쓴 풀이·증명·글의 논리 빈틈과 표현을 짚는다. 대신 써 주지 않는다.

순서
1. study_room으로 방을 연다. phase가 'scope'면 다른 무엇보다 먼저 묻는다: 어떤 시험인지(이름·날짜), 자료 목록(files) 가운데 어디까지가 시험 범위인지. exam_hints와 주차(module)로 짐작한 범위를 번호로 보여 주고 확인받아 study_set_scope.
2. phase 'read': 📚 Tachyon이 범위 안 자료를 하나씩 처음부터 끝까지 study_read(unread가 빌 때까지). 다 읽은 자료마다 절·개념 지도를 study_save_map. 모든 쪽이 개념이나 skip(이유)에 들어가야 저장된다. 개념은 시험에 나올 단위(정의 · 정리 · 공식 · 방법 · 예제 유형)로 잘게.
3. study_map으로 학습 지도를 보여 준다(앱에 지도 창이 안 뜨면 map_text를 코드 블록으로). 방을 열 때 · 지도를 새로 만들었을 때 · 사용자가 원할 때.
4. phase 'tutor': next 개념으로 한 번에 한 문제. 처음엔 절마다 한 문제씩 진단(why 'diagnose'), 그다음 약한 절부터 안 본 개념을 하나도 빼지 않고(why 'new'), 틀린 개념은 몇 문제 뒤 다시(why 'gap'). 문제를 내기 전에 그 개념의 쪽을 study_read(pages)로 다시 읽어도 된다.
5. 답을 들으면 바로 study_record(ok · part · wrong, 문제, 틀린 점). 틀리면 자료 이름·쪽을 밝혀 짧게 고쳐 주고 다음 문제로.
6. phase 'done'이면 오답 노트(wrong_open)를 한 번 더 묻고, 남은 날이 있으면 조언자가 복습 일정을 제안한다.

반드시
- 자료를 하나도 빼지 않는다. 범위에서 빼는 것은 사용자가 '범위 아님'이라고 말했을 때만(study_set_scope exclude — 자료 · 절 · 개념 단위). 네 판단으로 건너뛰거나 '중요하지 않다'며 줄이지 않는다. 시간이 모자라면 조언자가 순서를 바꾸자고 하되 빼지는 않는다.
- 새로 올라온 자료(state 'undecided')가 보이면 범위인지 먼저 묻는다.
- 못 읽는 자료(state 'unreadable': pptx · hwp · 영상 …)는 사용자에게 PDF나 파일을 이 채팅에 올려 달라고 하거나 범위 밖인지 묻는다. 채팅에 올라온 파일은 네가 직접 읽고 study_save_map(by_client: true, total_pages).
- 문제는 자료에 있는 내용으로 내고, 채점 때 근거(자료 이름 · 쪽)를 밝힌다. 자료에 지난 시험 · 퀴즈가 있으면 그 형식에 맞춘다. 자료의 오타는 그대로 쓰지 말고 짚어 준다.
- 질문 먼저: 설명을 늘어놓기 전에 묻는다. 한 번에 한 문제. 힌트는 사용자가 원할 때만. 정답을 먼저 말하지 않는다.
- 말투는 사용자를 따른다(처음엔 친근한 반말). 수식은 LaTeX.
- 일정 · 할 일을 Tachyon에 넣기 전엔 항상 확인받는다.`;

export const TUTORIAL = `처음 쓰는 사람에게 짧게, 한 단계씩(단계마다 사용자가 답하거나 넘어가게):
1. 공부방이 무엇인지 한 줄: "eTL 과목마다 공부방이 벌써 있어. 시험 범위의 강의자료를 Tachyon이 처음부터 끝까지 읽어 지도를 만들고, 튜터가 문제로 네 수준을 재서 빈틈을 채워 줘."
2. 멤버 넷을 머리표와 한 줄씩: 🧑‍🏫 튜터 · 📚 Tachyon(사서) · 🧭 조언자 · ✍️ 편집자.
3. 흐름: 시험 범위 정하기 → 자료 읽기 · 학습 지도 → 진단 문제 → 빈틈 채우기 → 지도에서 진도 보기.
4. 이렇게 말하면 돼: "○○ 공부방 열어줘" · "시험 범위는 1~7주차야" · "이 자료는 범위 아니야" · "지도 보여줘" · "힌트 줘" · "틀린 것만 다시" · "시험까지 공부 계획 짜 줘" · "내 풀이 봐 줘".
5. rooms를 보여 주고 어느 과목부터 할지 묻는다.`;

const TODO = {
  scope:
    '시험 범위를 먼저 묻는다(다른 일보다 먼저): 어떤 시험인지(이름·날짜)와 files 가운데 범위인 자료. exam_hints와 module(주차)로 짐작한 범위를 번호로 보여 주고 확인받아 study_set_scope. state가 undecided인 자료는 하나도 남기지 않는다(나머지를 한꺼번에 정하려면 others).',
  read: '📚 Tachyon이 범위 안 자료를 차례로 study_read(unread가 빌 때까지) → 자료마다 study_save_map. state가 unreadable인 자료는 사용자에게 채팅에 올려 달라고 하거나 범위 밖인지 묻는다. 사용자가 바로 문제를 원하면 지도가 있는 자료의 next로 시작하고 읽기는 사이사이 잇는다.',
  tutor: '🧑‍🏫 튜터: next 개념으로 한 문제(힌트 없이). 답을 들으면 바로 study_record.',
  done: '범위 안 개념을 모두 확인했다. 오답 노트(wrong_open)를 한 번 더 묻고, 시험까지 날이 남았으면 🧭 조언자가 복습 일정을 제안한다.',
};

// ── 도구 ─────────────────────────────────────────────────────────

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const COURSE = { type: 'string', minLength: 1, description: 'Course name (part of it is fine) or eTL course id, from study_rooms' };
const PAGES = (what) => ({ type: 'string', pattern: '^\\s*\\d+(\\s*[-~]\\s*\\d+)?(\\s*,\\s*\\d+(\\s*[-~]\\s*\\d+)?)*\\s*$', description: `${what}: PDF page numbers like '3-7' or '1,4-6'` });
const input = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const UI = { ui: { resourceUri: MAP_URI }, 'ui/resourceUri': MAP_URI, 'openai/outputTemplate': MAP_URI };

/** 자료 · 절 · 개념 번호('<파일>' · '<파일>.<절>' · '<파일>.<절>.<개념>') → 그것 */
function target(data, id) {
  const [fid, si, ci] = String(id).trim().split('.');
  const f = data.files.find((x) => x.id === fid);
  const s = si && f?.sections?.[Number(si) - 1];
  const c = ci && s?.concepts?.[Number(ci) - 1];
  if (!f || (si && !s) || (ci && !c)) return null;
  return { f, s: s || null, c: c || null };
}

export const STUDY_TOOLS = [
  {
    name: 'study_rooms',
    title: '공부방 목록',
    description:
      "Start here for studying / exam prep. Lists the user's study rooms — one per eTL course this semester, made automatically — with exam, D-day and progress, plus the PLAYBOOK you must follow as the study-room host (tutor-centred, Tachyon as librarian) and, for first-time users, a TUTORIAL to run first.",
    inputSchema: input({ tutorial: { type: 'boolean', description: 'true to include the tutorial again' } }),
    annotations: READ,
    run: async (args, x) => {
      const rows = await rowsOf(x.env, x.user.id);
      const first = rows.length === 0;
      const extra = { playbook: PLAYBOOK, ...(first || args.tutorial ? { first_time: first, tutorial: TUTORIAL } : {}) };
      let courses;
      try {
        courses = await coursesOf(await etlOf(x.env, x.user.id));
      } catch (err) {
        if (err instanceof StudyError && err.message === MSG.noEtl) return { etl_connected: false, rooms: [], todo: MSG.noEtl, ...extra };
        throw err;
      }
      const rooms = courses.map((c) => {
        const row = rows.find((r) => r.course_id === c.id);
        if (!row) return { course: c.name, course_id: c.id, opened: false };
        const v = viewOf(row, JSON.parse(row.data || NEW_DATA));
        return { course: c.name, course_id: c.id, opened: true, exam: v.exam, exam_date: v.exam_date, d_day: v.d_day, phase: v.phase, percent: v.stats.percent, gaps: v.stats.wrong + v.stats.part, last: row.updated_at };
      });
      return { today: kstDate(), etl_connected: true, rooms, ...extra };
    },
  },
  {
    name: 'study_room',
    title: '공부방 열기',
    description:
      "Open one course's study room (creates it on first open) and sync its eTL materials. Returns phase ('scope' → ask the exam and its scope first; 'read' → read every in-scope file with study_read and map it with study_save_map; 'tutor' → quiz `next`; 'done'), todo (what to do now), files with state, stats, next concept, open wrong-answer notes and map_text. Follow `todo`.",
    inputSchema: input({ course: COURSE }, ['course']),
    annotations: WRITE,
    run: async (args, x) => {
      const { row, data } = await openRoom(x.env, x.user.id, args.course);
      const v = viewOf(row, data);
      const hints = v.phase === 'scope' ? await examHints(x.env, x.user.id, row.course) : undefined;
      return { today: kstDate(), ...v, todo: TODO[v.phase], ...(hints ? { exam_hints: hints } : {}), map_text: mapText(v) };
    },
  },
  {
    name: 'study_set_scope',
    title: '시험 범위 정하기',
    description:
      "Set the exam and what is in scope — only with what the user said. ids: file id ('123'), section ('123.2') or concept ('123.2.4') from study_room, or 'all'. include = in scope, exclude = user said it's not on the exam. others: decide every still-undecided file at once. exam is required the first time.",
    inputSchema: input(
      {
        course: COURSE,
        exam: { type: 'string', maxLength: 80, description: "Exam name as the user said it, e.g. '중간고사'" },
        exam_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Exam day (YYYY-MM-DD, KST) if known' },
        note: { type: 'string', maxLength: 300, description: "The user's own words about the scope, e.g. '1~7주차, 3강 빼고'" },
        include: { type: 'array', items: { type: 'string' }, maxItems: 300 },
        exclude: { type: 'array', items: { type: 'string' }, maxItems: 300 },
        others: { type: 'string', enum: ['in', 'out'], description: 'Put every still-undecided file in or out of scope' },
      },
      ['course'],
    ),
    annotations: WRITE,
    run: async (args, x) => {
      const { row, data } = await roomOf(x.env, x.user.id, args.course);
      if (!row.exam && !args.exam) throw new StudyError('먼저 어떤 시험인지(예: 중간고사) 사용자에게 묻고 exam에 넣어 주세요');
      if (args.exam) row.exam = clean(args.exam, 80);
      if (args.exam_date) row.exam_date = args.exam_date;
      if (args.note) row.scope_note = clean(args.note, 300);
      const bad = [];
      for (const [ids, on] of [
        [args.include || [], true],
        [args.exclude || [], false],
      ]) {
        for (const id of ids) {
          if (String(id).trim() === 'all') {
            for (const f of data.files) f.in = on;
            continue;
          }
          const t = target(data, id);
          if (!t) bad.push(id);
          else if (t.c) {
            t.c.out = !on;
            if (on) (t.f.in = true), (t.s.out = false);
          } else if (t.s) {
            t.s.out = !on;
            if (on) t.f.in = true;
          } else t.f.in = on;
        }
      }
      if (bad.length) throw new StudyError(`없는 번호: ${bad.join(', ')} — study_room의 files·sections·concepts id를 쓰세요(아무것도 바꾸지 않았어요)`);
      if (args.others) for (const f of data.files) if (f.in == null) f.in = args.others === 'in';
      await save(x.env, row, data);
      const v = viewOf(row, data);
      return {
        saved: true,
        exam: v.exam,
        exam_date: v.exam_date,
        d_day: v.d_day,
        phase: v.phase,
        todo: TODO[v.phase],
        in_scope: v.files.filter((f) => f.state !== 'out' && f.state !== 'undecided').map((f) => `${f.id} ${f.title}`),
        undecided: v.files.filter((f) => f.state === 'undecided').map((f) => `${f.id} ${f.title}`),
        stats: v.stats,
      };
    },
  },
  {
    name: 'study_read',
    title: '자료 읽기',
    description: `Tachyon reads an in-scope eTL file for you, page by page, word for word (every bullet, formula in LaTeX, table, code, a line per figure) — up to ${READ_MAX} pages per call (default: the next ${READ_DEFAULT} unread). Call again until unread is empty, then study_save_map. PDF, images and text files only; others come back unreadable. Nothing is stored except which pages were read.`,
    inputSchema: input({ course: COURSE, file: { type: 'string', description: 'File id from study_room' }, pages: PAGES('Pages to read') }, ['course', 'file']),
    annotations: { ...READ, openWorldHint: true },
    run: async (args, x) => readFile(args, x),
  },
  {
    name: 'study_save_map',
    title: '학습 지도 저장',
    description:
      "Save the structure of one in-scope file after reading all of it: sections → concepts (each concept = one thing a test could ask: a definition, theorem, formula, method or problem type), each with its PDF pages. Every page must be in some concept or in skip (with why: cover, table of contents, references, blank, or '사용자: 범위 밖'), otherwise it is rejected with the missing pages. Re-saving keeps results of concepts with the same name. by_client + total_pages: a file the user uploaded to this chat that you read yourself.",
    inputSchema: input(
      {
        course: COURSE,
        file: { type: 'string' },
        sections: {
          type: 'array',
          minItems: 1,
          maxItems: 80,
          items: input(
            {
              title: { type: 'string', minLength: 1, maxLength: 120 },
              pages: PAGES('Section pages'),
              concepts: {
                type: 'array',
                minItems: 1,
                maxItems: 40,
                items: input({ name: { type: 'string', minLength: 1, maxLength: 120 }, pages: PAGES('Concept pages') }, ['name', 'pages']),
              },
            },
            ['title', 'pages', 'concepts'],
          ),
        },
        skip: { type: 'array', maxItems: 100, items: input({ pages: PAGES('Skipped pages'), why: { type: 'string', minLength: 1, maxLength: 80 } }, ['pages', 'why']) },
        by_client: { type: 'boolean' },
        total_pages: { type: 'integer', minimum: 1, maximum: 2000 },
      },
      ['course', 'file', 'sections'],
    ),
    annotations: WRITE,
    run: async (args, x) => saveMap(args, x),
  },
  {
    name: 'study_record',
    title: '채점 기록',
    description:
      "Record the user's answers right after grading: concept id (from next / the map), result ok · part · wrong, the question and what was wrong (short). Wrong/partial ones come back as `next` a few questions later; an ok later closes their wrong-answer notes. Returns stats and the next concept.",
    inputSchema: input(
      {
        course: COURSE,
        results: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: input(
            {
              id: { type: 'string' },
              result: { type: 'string', enum: ['ok', 'part', 'wrong'] },
              question: { type: 'string', maxLength: 300 },
              note: { type: 'string', maxLength: 300, description: 'What was wrong or missing' },
            },
            ['id', 'result'],
          ),
        },
      },
      ['course', 'results'],
    ),
    annotations: WRITE,
    run: async (args, x) => record(args, x),
  },
  {
    name: 'study_map',
    title: '학습 지도',
    description:
      "Show the learning map of a study room: exam scope → files (by week) → sections → concepts, coloured by result (✓ ok, △ partial, ✗ gap, ○ not yet), with coverage and the next concept. Renders as an interactive map in apps that support MCP Apps; otherwise show map_text in a code block.",
    inputSchema: input({ course: COURSE }, ['course']),
    annotations: READ,
    _meta: UI,
    run: async (args, x) => {
      const { row, data } = await roomOf(x.env, x.user.id, args.course);
      const v = viewOf(row, data);
      return { ...v, map_text: mapText(v) };
    },
  },
];

/** 지도 창(MCP Apps). 13_mcp.js의 resources/list · resources/read가 내보낸다 */
export const STUDY_RESOURCES = [
  {
    uri: MAP_URI,
    name: 'study-map',
    title: 'Tachyon 학습 지도',
    description: '공부방의 시험 범위 · 자료 · 절 · 개념과 진도를 그리는 창',
    mimeType: 'text/html;profile=mcp-app',
    text: MAP_HTML,
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  },
];

async function examHints(env, userId, course) {
  const { results } = await env.DB.prepare(
    `SELECT title, substr(start, 1, 10) AS date FROM events
     WHERE user_id = ? AND start >= ? AND moved_to IS NULL AND instr(title, ?) > 0
       AND (title LIKE '%시험%' OR title LIKE '%고사%' OR title LIKE '%퀴즈%' OR lower(title) LIKE '%exam%' OR lower(title) LIKE '%quiz%')
     ORDER BY start LIMIT 10`,
  )
    .bind(userId, kstDate(), course)
    .all();
  const notices = (
    await env.DB.prepare("SELECT title, substr(posted_at, 1, 10) AS posted FROM etl_items WHERE user_id = ? AND kind = 'notice' AND course = ? AND tag = 'exam' ORDER BY posted_at DESC LIMIT 5")
      .bind(userId, course)
      .all()
  ).results;
  return { events: results, notices };
}

async function readFile(args, x) {
  const { env, user, ctx } = x;
  const { row, data } = await roomOf(env, user.id, args.course);
  const f = data.files.find((it) => it.id === String(args.file).trim());
  if (!f) throw new StudyError('없는 자료 번호예요. study_room의 files에서 id를 보세요');
  if (f.in !== true) throw new StudyError(`'${f.title}'은(는) 범위가 정해지지 않았거나 범위 밖이에요. 사용자가 범위라고 하면 study_set_scope include로 먼저 넣어 주세요`);
  if (unreadable(f.type)) throw new StudyError(cantRead(f));

  let want;
  if (args.pages) {
    want = parsePages(args.pages, f.pages || 0);
    if (!want) throw new StudyError(`pages가 틀렸어요${f.pages ? `(이 자료는 1~${f.pages}쪽)` : ''}`);
    if (want.length > READ_MAX) throw new StudyError(`한 번에 ${READ_MAX}쪽까지예요`);
  } else {
    const unread = unreadOf(f); // 쪽 수를 아직 모르면 null
    if (unread && !unread.length) throw new StudyError('이 자료는 다 읽었어요. 다시 볼 쪽은 pages로 주세요');
    const from = unread ? unread[0] : 1;
    want = [];
    for (let p = from; want.length < READ_DEFAULT && (!f.pages || p <= f.pages) && (!unread || unread.includes(p)); p++) want.push(p);
  }
  const from = want[0];
  const to = want[want.length - 1];

  const limit = Number(env.STUDY_READS_PER_DAY || 60);
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM log WHERE user_id = ? AND action = 'study_read' AND at >= ?").bind(user.id, `${kstDate()}T00:00:00`).first('n');
  if (used >= limit) throw new StudyError(`오늘 자료 읽기 한도(${limit}번)를 다 썼어요. 내일 이어서 읽거나, 이미 읽은 쪽으로 공부해요`);

  const etl = await etlOf(env, user.id);
  let meta;
  try {
    meta = (await etl.get(`/files/${f.id}`)).data;
  } catch (err) {
    if (err instanceof EtlError) throw new StudyError(`eTL에서 이 자료를 열 수 없어요(${err.status}). 교수님이 내렸거나 잠갔을 수 있어요 — 사용자에게 물어 주세요`);
    throw err;
  }
  if (!meta || !meta.url || meta.locked_for_user) throw new StudyError('eTL이 이 자료의 내려받기를 막았어요(잠김). 사용자에게 채팅에 올려 달라고 해 주세요');
  f.type = typeOf(meta.display_name || f.title, meta['content-type']); // 모듈에만 있는 자료는 이름에 확장자가 없을 수 있다
  if (unreadable(f.type)) {
    await save(env, row, data);
    throw new StudyError(cantRead(f));
  }
  const url = await finalUrl(meta.url);

  let total;
  let pages;
  if (f.type === 'text') {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new StudyError(`eTL에서 파일을 못 받았어요(${res.status})`);
    total = 1;
    pages = [{ page: 1, label: '', text: (await res.text()).slice(0, 100000) }];
  } else {
    // ponytail: 프롬프트 캐시를 안 건다 — 끝 주소가 부를 때마다 새로 서명돼 캐시가 맞지 않는다. 같은 자료를 여러 번 읽는 값이 문제가 되면
    //   Files API(한 번 올리고 file_id로, 만료 지정)로 바꾸고 cache_control을 붙인다.
    const block = f.type === 'pdf' ? { type: 'document', source: { type: 'url', url } } : { type: 'image', source: { type: 'url', url } };
    let out;
    try {
      out = await askJson(env, { model: 'fast', system: READ_SYSTEM, content: [block, { type: 'text', text: readText(from, to) }], schema: READ_SCHEMA, maxTokens: 16000, timeoutMs: 150000 });
    } catch (err) {
      ctx.waitUntil(logAction(env, user.id, 'study_read_fail', { status: err && err.status, msg: String(err && err.message).replace(/https?:\/\/\S+/g, '[주소]').slice(0, 200) })); // 서명된 파일 주소는 기록에 남기지 않는다
      if (err && err.status === 400) throw new StudyError(`Tachyon이 '${f.title}'을(를) 읽지 못했어요(너무 크거나 잠긴 파일일 수 있어요). 사용자에게 이 채팅에 올려 달라고 해서 직접 읽고 study_save_map(by_client: true, total_pages)으로 지도를 내 주세요`);
      throw new StudyError('자료를 읽다가 실패했어요. 잠시 뒤 다시 해 주세요(pages로 쪽 수를 줄이면 나을 수 있어요)');
    }
    total = Number(out.data.total_pages) || null;
    pages = (out.data.pages || []).filter((p) => p && p.page >= from && p.page <= to && (!total || p.page <= total));
    ctx.waitUntil(logAction(env, user.id, 'study_read', { model: out.model, ms: out.ms, in: out.usage.input, out: out.usage.output, pages: pages.length }));
  }
  if (total) f.pages = total;
  const got = pages.map((p) => p.page);
  f.read = pagesText([...(parsePages(f.read) || []), ...got].filter((p) => !f.pages || p <= f.pages));
  await save(env, row, data);
  const missing = want.filter((p) => (!f.pages || p <= f.pages) && !got.includes(p));
  const unread = unreadOf(f) || [];
  return {
    file: f.id,
    title: f.title,
    total_pages: f.pages,
    pages,
    ...(missing.length ? { missing: pagesText(missing), warning: `${pagesText(missing)}쪽이 비어 왔어요. pages로 다시 읽어 주세요` } : {}),
    read: f.read,
    unread: pagesText(unread),
    todo: unread.length ? `study_read를 이어서(다음 ${pagesText(unread.slice(0, READ_DEFAULT))}쪽)` : '다 읽었다 → 이 자료의 절·개념 지도를 study_save_map',
  };
}

async function saveMap(args, x) {
  const { row, data } = await roomOf(x.env, x.user.id, args.course);
  const f = data.files.find((it) => it.id === String(args.file).trim());
  if (!f) throw new StudyError('없는 자료 번호예요');
  if (f.in !== true) throw new StudyError(`'${f.title}'은(는) 범위 안이 아니에요`);
  if (args.by_client) {
    if (!args.total_pages) throw new StudyError('by_client면 total_pages(그 파일의 전체 쪽 수)가 필요해요');
    f.pages = args.total_pages;
    f.by_client = true;
  } else {
    if (!f.pages) throw new StudyError('아직 안 읽은 자료예요. study_read로 먼저 끝까지 읽어 주세요');
    const unread = unreadOf(f);
    if (unread.length) throw new StudyError(`아직 안 읽은 쪽: ${pagesText(unread)} — study_read로 먼저 읽어 주세요`);
  }
  const total = f.pages;
  const covered = new Set();
  const range = (text, where) => {
    const list = parsePages(text, total);
    if (!list) throw new StudyError(`${where}의 pages '${text}'가 틀렸어요(이 자료는 1~${total}쪽)`);
    return list;
  };
  const oldC = new Map();
  const oldS = new Map();
  for (const s of f.sections || []) {
    oldS.set(norm(s.title), s);
    for (const c of s.concepts) oldC.set(norm(c.name), c);
  }
  const sections = args.sections.map((s, si) => {
    range(s.pages, `${si + 1}번 절`);
    const concepts = s.concepts.map((c) => {
      range(c.pages, `'${c.name}'`).forEach((p) => covered.add(p));
      const was = oldC.get(norm(c.name)) || {};
      return { name: clean(c.name, 120), pages: c.pages.replace(/\s+/g, ''), ...(was.s ? { s: was.s, n: was.n, t: was.t, at: was.at } : {}), ...(was.out ? { out: true } : {}) };
    });
    return { title: clean(s.title, 120), pages: s.pages.replace(/\s+/g, ''), concepts, ...(oldS.get(norm(s.title))?.out ? { out: true } : {}) };
  });
  const skip = (args.skip || []).map((k) => {
    range(k.pages, 'skip').forEach((p) => covered.add(p));
    return { pages: k.pages.replace(/\s+/g, ''), why: clean(k.why, 80) };
  });
  const missing = allPages(total).filter((p) => !covered.has(p));
  if (missing.length) {
    throw new StudyError(
      `지도에 빠진 쪽: ${pagesText(missing)} (저장 안 함). 그 쪽의 내용을 개념으로 넣거나, 표지·목차·참고문헌·빈 쪽이면 skip에 이유와 함께, 사용자가 범위 밖이라고 한 쪽이면 skip(why: '사용자: 범위 밖')으로 넣어 주세요`,
    );
  }
  f.sections = sections;
  f.skip = skip;
  await save(x.env, row, data);
  const v = viewOf(row, data);
  return {
    saved: true,
    file: f.id,
    title: f.title,
    sections: sections.length,
    concepts: sections.reduce((a, s) => a + s.concepts.length, 0),
    phase: v.phase,
    todo: v.phase === 'read' ? `${TODO.read} 남은 자료: ${v.files.filter((it) => it.state !== 'mapped' && it.state !== 'out' && it.state !== 'undecided').map((it) => `${it.id} ${it.title}`).join(', ')}` : `지도를 다 만들었다 → study_map으로 보여 주고 진단 문제부터. ${TODO.tutor}`,
    stats: v.stats,
    next: v.next,
  };
}

async function record(args, x) {
  const { row, data } = await roomOf(x.env, x.user.id, args.course);
  const today = kstDate();
  const bad = [];
  data.wrong ||= [];
  for (const r of args.results) {
    const t = target(data, r.id);
    if (!t || !t.c || t.f.in !== true || t.s.out || t.c.out) {
      bad.push(r.id);
      continue;
    }
    data.turn = (data.turn || 0) + 1;
    Object.assign(t.c, { s: r.result, n: (t.c.n || 0) + 1, t: data.turn, at: today });
    if (r.result === 'ok') {
      for (const w of data.wrong) if (!w.fixed && norm(w.name) === norm(t.c.name)) w.fixed = today;
    } else {
      data.wrong.push({ id: r.id, name: t.c.name, at: today, q: clean(r.question, 300), why: clean(r.note, 300) });
    }
  }
  if (bad.length === args.results.length) throw new StudyError(`범위 안 개념이 아니에요: ${bad.join(', ')} — next나 study_map의 concept id를 쓰세요`);
  while (data.wrong.length > 200) {
    const i = data.wrong.findIndex((w) => w.fixed); // 고친 것 가운데 오래된 것부터
    data.wrong.splice(i >= 0 ? i : 0, 1);
  }
  await save(x.env, row, data);
  const v = viewOf(row, data);
  return { recorded: args.results.length - bad.length, ...(bad.length ? { skipped: bad } : {}), phase: v.phase, stats: v.stats, next: v.next, todo: TODO[v.phase] };
}
