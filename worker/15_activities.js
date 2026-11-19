// 활동 모아보기(11-19 사람 "서울대 비교과나 메일로 오는 다양한 활동 / 행사 안내들을 내가 신청할 수 있거나 관심사에 맞춰서
// 모아볼 수 있는 섹션", 12:50 "메일은 일단 보류하고, 나머지는 바로 진행"). 담당: 컨셉(사람이 컨셉 세션에 바로 시킴).
//
// 서울대 공개 페이지(로그인 없이 보이는 SNU 캘린더 · 일반공지)를 가끔 읽어 새 글만 본문을 한 번 읽고, AI(Haiku, prompts/activities.js)가
// 종류 · 관심 태그 · 한 줄 요약 · 신청 마감 · 행사 때 · 장소 · 대상(학부/대학원 · 학년 · 단과대)을 붙인다.
// 원문(본문 · 첨부)은 저장하지 않는다 — 카드 칸과 원문 링크만(eTL 공지 · 강의자료의 '복사 안 함'과 같게).
// SNU비교과(extra.snu.ac.kr)는 학교 통합 로그인 안쪽이라 읽지 않는다(학생 비밀번호를 받지 않는다).
//
// 모은 목록은 모두에게 같은 공개 자료라 R2(PHOTOS 묶음) 파일 하나(activities/list.json)에 둔다 — DB 표 바꿈 없음.
// 사람마다 다른 것(관심사 · 별표 · 숨기기)은 화면이 그 기기에 적는다(web/src/activities.js). 신청 마감 → 할 일, 행사 → 일정은
// 화면이 기존 주소(POST /api/tasks · /api/events)로 넣는다.
//
//   GET /api/activities → { items, kinds, updated_at, refreshing }
//     로그인 없이도 읽힌다(공개 자료). 오래됐으면(2시간, 못 읽은 글이 남았으면 20초) 답한 뒤 뒤에서 '한 걸음' 새로 받는다.
//
// 한 걸음 = 게시판 첫 쪽(처음엔 몇 쪽) + 새 글 본문 몇 개 + AI 한 번 — 무료 요금제 한도(외부 요청 50 · CPU 10ms) 안에서.
// 두 사람이 같이 열어도 한 걸음만 돌게 파일에 자물쇠 시각(lock_until)을 적는다.

import { askJson } from './llm.js';
import { KINDS, SCHEMA, SYSTEM, userMessage } from './prompts/activities.js';
import { logStatement } from './lib/log.js';
import { DAY_MS, kstDate, kstIso } from './lib/time.js';

const KEY = 'activities/list.json';
const ORIGIN = 'https://www.snu.ac.kr';
export const PER_STEP = 6; // 한 걸음에 본문을 읽고 AI에게 보내는 글 수
const LOCK_MS = 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const BACKLOG_MS = 20 * 1000;
const MAX_ITEMS = 400;
const MAX_SEEN = 800;
const TEXT_CHARS = 1200;

// 게시판: id 앞글자 + 글 번호(bbsidx)가 활동 id. first = 처음 모을 때 읽는 쪽 수(새 글 순)
export const SOURCES = [
  { id: 'e', name: 'SNU 캘린더', first: 3, list: (p) => `${ORIGIN}/snunow/events?page=${p}`, view: (n) => `${ORIGIN}/snunow/events?md=v&bbsidx=${n}`, parse: parseEventList },
  { id: 'n', name: '일반공지', first: 2, list: (p) => `${ORIGIN}/snunow/notice/genernal?page=${p}`, view: (n) => `${ORIGIN}/snunow/notice/genernal?md=v&bbsidx=${n}`, parse: parseNoticeList },
];

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
/** HTML 조각 → 한 줄 글(태그 · 문자 참조 · 여러 빈칸) */
export function plain(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY[name.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** '2026.11.14.(토) ~ 2026.11.20.(금)' · '2026. 11. 18.' → ['2026-11-14', '2026-11-20'] */
export function datesIn(text) {
  return [...String(text || '').matchAll(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/g)].map((m) => ymd(m[1], m[2], m[3]));
}

/** SNU 캘린더 목록 쪽 → [{ idx, title, from, to, desc }] (한 쪽 12개, 새 글 순) */
export function parseEventList(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a href="[^"]*?[?&]md=v&(?:amp;)?bbsidx=(\d+)"[^>]*class="item"[^>]*>([\s\S]*?)<\/a>/g)) {
    const body = m[2];
    const title = plain((/<span class="title">([\s\S]*?)<\/span>/.exec(body) || [])[1]);
    const point = (/<span class="point">([\s\S]*?)<\/span>/.exec(body) || [])[1] || '';
    const sub = (/<span class="sub[^"]*">([\s\S]*?)<\/span>\s*<\/span>/.exec(body) || [])[1] || '';
    const [from = null, to = from] = datesIn(point);
    const desc = plain(sub.replace(/<span class="point">[\s\S]*?<\/span>/, ''));
    if (title) out.push({ idx: m[1], title, from, to, desc: desc && desc !== title ? desc : null });
  }
  return out;
}

/** 일반공지 목록 쪽 → [{ idx, title, posted }] */
export function parseNoticeList(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a href="[^"]*?[?&]md=v&(?:amp;)?bbsidx=(\d+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td class="col-date">([^<]*)<\/td>/g)) {
    const title = plain((/<span class="txt">([\s\S]*?)<\/span>/.exec(m[2]) || [])[1] || m[2]);
    if (title) out.push({ idx: m[1], title, posted: datesIn(m[3])[0] || null });
  }
  return out;
}

/** 글 보기 쪽 → 본문 글(앞 1200자). 본문 칸을 못 찾으면 빈 글 */
export function detailText(html) {
  const s = String(html || '');
  const start = s.indexOf('<div class="content">');
  if (start < 0) return '';
  const rest = s.slice(start + 21);
  const stops = ['<!-- 첨부자료 -->', '<div class="download">', '<footer class="footer">'].map((t) => rest.indexOf(t)).filter((i) => i >= 0);
  return plain(rest.slice(0, stops.length ? Math.min(...stops) : 20000)).slice(0, TEXT_CHARS);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const known = (v) => (typeof v === 'string' && v.trim() && v.trim() !== '?' ? v.trim() : null);
const dateOr = (v) => (DATE.test(known(v) || '') ? v.trim() : null);
const timeOr = (v) => (TIME.test(known(v) || '') ? v.trim() : null);
const words = (list, n) => (Array.isArray(list) ? list.map(known).filter(Boolean).slice(0, n) : []);

/** 큐의 글 + AI 답(없으면 null) → 저장할 활동 */
export function toItem(post, a, now = Date.now()) {
  const until = known(a?.apply_until);
  return {
    id: post.id,
    src: post.src,
    url: post.url,
    title: post.title,
    from: post.from ?? null,
    to: post.to ?? null,
    posted: post.posted ?? null,
    kind: a && KINDS.includes(a.kind) ? a.kind : null,
    tags: words(a?.tags, 5),
    summary: known(a?.summary) || post.desc || null,
    apply_until: until && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(until) ? until : null,
    date: dateOr(a?.date),
    time: timeOr(a?.time),
    end_time: timeOr(a?.end_time),
    end_date: dateOr(a?.end_date),
    place: known(a?.place),
    level: ['학부', '대학원', '전체'].includes(a?.level) ? a.level : null,
    years: Array.isArray(a?.years) ? [...new Set(a.years.filter((y) => Number.isInteger(y) && y >= 1 && y <= 6))].sort() : [],
    colleges: words(a?.colleges, 4),
    who: known(a?.who),
    seen: kstIso(now),
  };
}

/** 활동이 끝나는 날(신청 마감 · 행사 · 게시 기간 가운데 가장 늦은 것, 다 모르면 올린 날 + 30일) */
export function endOf(item) {
  const days = [item.apply_until && item.apply_until.slice(0, 10), item.end_date, item.date, item.to].filter(Boolean);
  if (days.length) return days.sort().at(-1);
  const base = item.posted || item.from || (item.seen || '').slice(0, 10);
  return base ? kstDate(Date.parse(`${base}T00:00:00+09:00`) + 30 * DAY_MS) : null;
}

/** 어제까지 끝난 것은 빼고, 마감이 가까운 순으로(마감을 모르면 뒤로), 많으면 앞 400개 */
export function prune(items, now = Date.now()) {
  const yesterday = kstDate(now - DAY_MS);
  const due = (i) => i.apply_until || i.date || i.to || '9999';
  return items
    .filter((i) => (endOf(i) || '9999') >= yesterday)
    .sort((a, b) => due(a).localeCompare(due(b)) || b.id.localeCompare(a.id))
    .slice(0, MAX_ITEMS);
}

export async function loadState(env) {
  const empty = { v: 1, updated_at: null, lock_until: 0, items: [], queue: [], seen: [] };
  const obj = await env.PHOTOS.get(KEY);
  if (!obj) return empty;
  try {
    return { ...empty, ...(await obj.json()) };
  } catch {
    return empty;
  }
}

const saveState = (env, state) => env.PHOTOS.put(KEY, JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });

async function getText(doFetch, url) {
  const res = await doFetch(url, { headers: { 'user-agent': 'TachyonBot/1.0 (+https://tachyon.tachyon-project.workers.dev; 서울대 학생 프로젝트, 공개 게시판만)' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

const hasKey = (env) => Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY_2);

/**
 * 한 걸음: 게시판 첫 쪽에서 새 글을 큐에 넣고, 큐 앞 PER_STEP개의 본문을 읽어 AI에게 한 번에 보낸 뒤 활동으로 옮긴다.
 * AI가 답하지 못한 글은 큐에 남겨 다음 걸음에 다시(세 번째엔 AI 칸 없이 제목 · 기간만으로 넣는다). 키가 없으면 AI 없이.
 */
export async function step(env, now = Date.now(), doFetch = fetch) {
  const state = await loadState(env);
  if (state.lock_until > now) return state;
  state.lock_until = now + LOCK_MS;
  await saveState(env, state);

  const today = kstDate(now);
  const seen = new Set([...state.seen, ...state.items.map((i) => i.id), ...state.queue.map((q) => q.id)]);
  const firstTime = !state.updated_at;
  for (const src of SOURCES) {
    for (let p = 1; p <= (firstTime ? src.first : 1); p++) {
      let posts;
      try {
        posts = src.parse(await getText(doFetch, src.list(p)));
      } catch (err) {
        console.error('활동 목록 읽기 실패', src.name, err && err.message);
        break;
      }
      let fresh = 0;
      for (const post of posts) {
        const id = `${src.id}${post.idx}`;
        if (seen.has(id)) continue;
        seen.add(id);
        state.seen.push(id);
        if (post.to && post.to < today) continue; // 이미 끝난 행사
        fresh += 1;
        state.queue.push({ id, src: src.name, url: src.view(post.idx), title: post.title, from: post.from ?? null, to: post.to ?? null, posted: post.posted ?? null, desc: post.desc ?? null, tries: 0 });
      }
      if (!fresh) break; // 이 쪽에 새 글이 없으면 뒤 쪽은 이미 봤다
    }
  }

  const batch = state.queue.slice(0, PER_STEP);
  const texts = new Map();
  for (const q of batch) {
    try {
      texts.set(q.id, detailText(await getText(doFetch, q.url)));
    } catch {
      texts.set(q.id, q.desc || '');
    }
  }
  const answers = new Map();
  if (batch.length && hasKey(env)) {
    try {
      const r = await askJson(env, {
        model: 'fast',
        system: SYSTEM,
        content: userMessage(batch.map((q) => ({ ...q, text: texts.get(q.id) }))),
        schema: SCHEMA,
        maxTokens: 1600,
        timeoutMs: 20000,
        fetch: doFetch,
      });
      for (const a of r.data?.items || []) if (a && typeof a.id === 'string') answers.set(a.id, a);
      try {
        await logStatement(env, null, 'llm', { use: 'activities', model: r.model, ms: r.ms, in: r.usage.input, out: r.usage.output }).run(); // 쓴 사람 없음(모두의 공개 자료)
      } catch {
        /* 기록이 실패해도 모으기는 그대로 */
      }
    } catch (err) {
      console.error('활동 AI 실패', err && err.message);
    }
  }
  const moved = new Set();
  for (const q of batch) {
    const a = answers.get(q.id) || null;
    if (a || !hasKey(env) || q.tries >= 2) {
      state.items.push(toItem(q, a, now));
      moved.add(q.id);
    } else q.tries += 1;
  }
  state.queue = state.queue.filter((q) => !moved.has(q.id));
  state.items = prune(state.items, now);
  state.seen = state.seen.slice(-MAX_SEEN);
  state.updated_at = kstIso(now);
  state.lock_until = 0;
  await saveState(env, state);
  return state;
}

export async function handle(request, env, ctx) {
  const { pathname } = new URL(request.url);
  if (pathname !== '/api/activities') return Response.json({ error: '없는 주소' }, { status: 404 });
  if (request.method !== 'GET') return Response.json({ error: 'GET만 된다' }, { status: 405 });
  if (!env.PHOTOS) return Response.json({ error: '활동을 둘 저장소(R2)가 아직 없어요' }, { status: 503 });
  const now = Date.now();
  const state = await loadState(env);
  const age = state.updated_at ? now - Date.parse(state.updated_at) : Infinity;
  const locked = state.lock_until > now;
  const due = age > (state.queue.length ? BACKLOG_MS : STALE_MS);
  if (due && !locked) ctx.waitUntil(step(env, now).catch((err) => console.error('활동 모으기 실패', err && err.stack)));
  const items = prune(state.items, now).filter((i) => i.kind !== '안내');
  return Response.json(
    { items, kinds: KINDS.filter((k) => k !== '안내'), updated_at: state.updated_at, refreshing: (due && !locked) || locked || state.queue.length > 0, waiting: state.queue.length },
    { headers: { 'cache-control': 'no-store' } },
  );
}
