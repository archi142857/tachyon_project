// 7. 할 일·일정 읽기·고치기 (담당: 서버 세션)
//
// 대시보드의 '할 일 3개'·주간 달력·눌러서 고치기가 쓴다. 모든 질의는 로그인한 사람의 것(user_id)만 본다.
//
//   GET    /api/tasks?limit=3     끝나지 않은 할 일을 여유 적은 순(4_night.js의 rankTasks)으로 → { tasks, warning }
//                                 warning = 몰린 주 경고 문장(없으면 null)
//   GET    /api/tasks?done=1      끝낸 할 일(끝낸 지 얼마 안 된 순, done_at = 끝낸 시각) · done=all 전부(안 끝낸 것 먼저)
//   PATCH  /api/tasks/:id         { done, minutes, ready, title, due } 가운데 바꿀 것만 → { task }
//   DELETE /api/tasks/:id         → { ok }
//   GET    /api/events?from=2026-11-09&to=2026-11-16
//                                 그 기간과 겹치는 일정(to 날짜는 안 들어감, 최대 62일) → { events }. 없으면 오늘부터 7일
//   PATCH  /api/events/:id        { important, title, start, end, place } 가운데 바꿀 것만 → { event }
//   DELETE /api/events/:id        → { ok }
//
// 캘린더(eTL·구글·애플·폰)에서 온 것은 그 캘린더가 원본이다. 그 줄의 제목·시각·장소를 바꾸면 15분 수집 때 되돌아가고, 지우면 다시 생긴다.
//   일정을 고치면: 고친 사본(source memo, ext_id 'edit:<원본 id>')을 넣고 원본은 가린다(events.moved_to, 메모의 '일정 변경'과 같은 길).
//                  Tachyon 안에서만 바뀌고 그 캘린더는 그대로다. 사본을 지우면 원본이 다시 보인다. 사본은 응답에 edited: 1.
//   할 일의 제목·마감, 지우기: 막는다(409). 그런 것도 바꿀 수 있는 칸: 할 일 done·minutes·ready, 일정 important.
// 메모·시간표 등에서 온 것은 다 바꾸고 지울 수 있다.
// 시각은 schema.sql 머리말 모양: '2026-11-13T15:00:00+09:00', 종일은 날짜만 '2026-11-13'(end는 다음 날).
// log: task_done · task_undone(체크), item_edit(그 밖에 고침), item_delete

import { rankTasks, crowdedWarning } from './4_night.js';
import { json, fail, readJson } from './lib/http.js';
import { kstDate, DAY_MS } from './lib/time.js';
import { logStatement } from './lib/log.js';

const FEED_SOURCES = new Set(['etl', 'google', 'apple', 'device']);
const FEED_NAMES = { etl: 'eTL', google: '구글 캘린더', apple: '애플 캘린더', device: '폰 캘린더' };
const MAX_RANGE_DAYS = 62;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;

export async function handle(request, env, ctx, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const url = new URL(request.url);
  const [, , table, idPart, extra] = url.pathname.split('/'); // '' / api / tasks|events / :id
  const id = idPart === undefined ? null : Number(idPart);
  if (extra !== undefined || (idPart !== undefined && !(Number.isInteger(id) && id > 0))) return fail(404, '없는 주소예요');
  const method = request.method;

  if (table === 'tasks') {
    if (id === null && method === 'GET') return listTasks(url, env, user);
    if (id !== null && method === 'PATCH') return patchItem(request, env, user, 'tasks', id);
    if (id !== null && method === 'DELETE') return deleteItem(env, user, 'tasks', id);
  }
  if (table === 'events') {
    if (id === null && method === 'GET') return listEvents(url, env, user);
    if (id !== null && method === 'PATCH') return patchItem(request, env, user, 'events', id);
    if (id !== null && method === 'DELETE') return deleteItem(env, user, 'events', id);
  }
  return fail(404, '없는 주소예요');
}

// ── 읽기 ─────────────────────────────────────────────────────────

const TASK_COLUMNS = 'id, title, due, minutes, ready, done, source';
// 끝낸 시각: 이 사람의 task_done 줄을 한 번만 모아(할 일 id마다 마지막 시각) 붙인다. 할 일마다 log를 다시 훑으면
// D1 읽기가 '끝낸 할 일 수 × task_done 줄 수'로 커진다(11-12 무료 하루 읽기 한도).
const DONE_AT_JOIN = `LEFT JOIN (SELECT json_extract(detail, '$.id') AS task_id, MAX(at) AS done_at FROM log
     WHERE action = 'task_done' AND user_id = ?1 AND json_valid(detail) GROUP BY 1) d ON d.task_id = tasks.id`;
const EVENT_COLUMNS = `id, title, start, "end", place, source, important, (source = 'memo' AND ext_id LIKE 'edit:%') AS edited`; // edited = 캘린더 일정을 여기서 고친 사본

async function listTasks(url, env, user) {
  const done = url.searchParams.get('done') || '0';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 500);
  if (done === '0') {
    const { results } = await env.DB.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND done = 0`).bind(user.id).all();
    const now = new Date(Date.now()); // Date.now를 거쳐야 시험의 고정 시각을 따른다(new Date()는 시스템 시계)
    const daily = Number(env.DAILY_TASK_MIN) || undefined;
    const ranked = rankTasks(results, now, daily);
    return json({ ok: true, tasks: ranked.slice(0, limit), warning: crowdedWarning(ranked, now, daily) });
  }
  if (done !== '1' && done !== 'all') return fail(400, 'done은 0·1·all 가운데 하나예요');
  const where = done === '1' ? 'AND done = 1' : '';
  const order = done === '1' ? 'done_at DESC, due DESC' : 'done, due IS NULL, due';
  // 끝낸 시각은 tasks 표에 칸이 없어서 log의 마지막 task_done 줄에서 읽는다(기록이 없으면 null → 맨 뒤)
  const sql =
    done === '1'
      ? `SELECT ${TASK_COLUMNS}, done_at FROM tasks ${DONE_AT_JOIN} WHERE tasks.user_id = ?1 ${where} ORDER BY ${order}, id LIMIT ?2`
      : `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ?1 ${where} ORDER BY ${order}, id LIMIT ?2`;
  const { results } = await env.DB.prepare(sql).bind(user.id, limit).all();
  return json({ ok: true, tasks: results });
}

async function listEvents(url, env, user) {
  const from = url.searchParams.get('from') || kstDate();
  const to = url.searchParams.get('to') || kstDate(Date.parse(`${from}T00:00:00+09:00`) + 7 * DAY_MS);
  if (!DATE.test(from) || !DATE.test(to)) return fail(400, 'from·to는 2026-11-09 모양의 날짜예요');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (!(days > 0 && days <= MAX_RANGE_DAYS)) return fail(400, `기간은 1~${MAX_RANGE_DAYS}일이에요(to는 from보다 뒤)`);
  // 글자 비교: '2026-11-12' < '2026-11-12T…' 이라 종일·시각 일정이 섞여도 순서·겹침이 맞다(lib/time.js)
  const { results } = await env.DB.prepare(
    `SELECT ${EVENT_COLUMNS} FROM events
      WHERE user_id = ?1 AND moved_to IS NULL AND start < ?3 AND (COALESCE("end", start) > ?2 OR start >= ?2)
      ORDER BY start, id`,
  )
    .bind(user.id, from, to)
    .all();
  return json({ ok: true, events: results });
}

// ── 고치기·지우기 ────────────────────────────────────────────────

const EDITABLE = {
  tasks: { always: ['done', 'minutes', 'ready'], own: ['title', 'due'] },
  events: { always: ['important'], own: ['title', 'start', 'end', 'place'] },
};

async function patchItem(request, env, user, table, id) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'JSON 본문이 필요해요');
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  if (!row) return fail(404, '없는 항목이에요');

  const { always, own } = EDITABLE[table];
  let fields = Object.keys(body).filter((k) => always.includes(k) || own.includes(k));
  if (!fields.length) return fail(400, `바꿀 칸이 없어요(${[...always, ...own].join('·')})`);

  let values;
  try {
    values = Object.fromEntries(fields.map((k) => [k, clean(table, k, body[k])]));
    if (table === 'events') checkEventTimes({ ...row, ...values });
  } catch (err) {
    if (err instanceof BadValue) return fail(400, err.message);
    throw err;
  }

  if (FEED_SOURCES.has(row.source)) {
    const changed = fields.filter((k) => own.includes(k) && values[k] !== row[k]);
    if (changed.length && table === 'tasks') return fail(409, `${FEED_NAMES[row.source]}에서 온 할 일이라 제목·마감은 ${FEED_NAMES[row.source]}에서 고쳐 주세요(15분 안에 바뀌어요)`);
    if (changed.length) return editCopy(env, user, { ...row, ...values }, changed);
    fields = fields.filter((k) => always.includes(k)); // 같은 값으로 온 제목·시각은 건드리지 않는다
    if (!fields.length) return fail(400, '바뀐 것이 없어요');
  }

  const set = fields.map((k) => `${k === 'end' ? '"end"' : k} = ?`).join(', ');
  const update = env.DB.prepare(`UPDATE ${table} SET ${set} WHERE id = ? AND user_id = ? RETURNING *`).bind(...fields.map((k) => values[k]), id, user.id);
  let action = 'item_edit';
  if (table === 'tasks' && 'done' in values && values.done !== row.done) action = values.done ? 'task_done' : 'task_undone';
  const [res] = await env.DB.batch([update, logStatement(env, user.id, action, { table, id, fields })]);
  const updated = res.results[0];
  const pick = table === 'tasks' ? ['id', 'title', 'due', 'minutes', 'ready', 'done', 'source'] : ['id', 'title', 'start', 'end', 'place', 'source', 'important'];
  return json({ ok: true, [table === 'tasks' ? 'task' : 'event']: Object.fromEntries(pick.map((k) => [k, updated[k] ?? null])) });
}

/** 캘린더에서 온 일정을 고침: 고친 값으로 사본을 넣고(같은 원본을 또 고치면 그 사본을 덮는다) 원본은 가린다. e = 원본 줄에 고친 값을 덮은 것 */
// ponytail: 원본이 그 캘린더에서 지워지거나 바뀌어도 사본은 그대로 남는다. 따라가야 하면 수집(2_collect_ics.js)에서 맞춘다.
async function editCopy(env, user, e, fields) {
  const extId = `edit:${e.id}`;
  const [saved] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO events (user_id, title, start, "end", place, source, ext_id, important) VALUES (?, ?, ?, ?, ?, 'memo', ?, ?)
       ON CONFLICT (user_id, source, ext_id) DO UPDATE
         SET title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place, important = excluded.important
       RETURNING ${EVENT_COLUMNS}`,
    ).bind(user.id, e.title, e.start, e.end, e.place, extId, e.important),
    env.DB.prepare(
      `UPDATE events SET moved_to = (SELECT id FROM events WHERE user_id = ?1 AND source = 'memo' AND ext_id = ?2) WHERE id = ?3 AND user_id = ?1`,
    ).bind(user.id, extId, e.id),
    logStatement(env, user.id, 'item_edit', { table: 'events', id: e.id, fields, copy: true }),
  ]);
  return json({ ok: true, event: saved.results[0] });
}

async function deleteItem(env, user, table, id) {
  const row = await env.DB.prepare(`SELECT source FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  if (!row) return fail(404, '없는 항목이에요');
  if (FEED_SOURCES.has(row.source)) {
    const name = FEED_NAMES[row.source];
    return fail(409, table === 'tasks' ? `${name}에서 온 할 일은 지울 수 없어요. 끝냈으면 체크해 주세요` : `${name}에서 온 일정은 ${name}에서 지워 주세요`);
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, user.id),
    // 메모로 '일정 변경'한 새 일정을 지우면 가려 둔 옛 일정이 다시 보인다(3_memo_popup.js)
    ...(table === 'events' ? [env.DB.prepare('UPDATE events SET moved_to = NULL WHERE moved_to = ? AND user_id = ?').bind(id, user.id)] : []),
    logStatement(env, user.id, 'item_delete', { table, id }),
  ]);
  return json({ ok: true });
}

class BadValue extends Error {}

function clean(table, key, value) {
  switch (key) {
    case 'done':
    case 'ready':
    case 'important':
      if (value === true || value === 1) return 1;
      if (value === false || value === 0) return 0;
      throw new BadValue(`${key}는 true·false예요`);
    case 'minutes':
      if (value === null) return null;
      if (Number.isInteger(value) && value >= 1 && value <= 1440) return value;
      throw new BadValue('minutes는 1~1440 사이 정수(분)예요');
    case 'title': {
      const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
      if (!s || s.length > 200) throw new BadValue('제목은 1~200자예요');
      return s;
    }
    case 'place':
      if (value === null || value === '') return null;
      if (typeof value === 'string' && value.length <= 200) return value.trim();
      throw new BadValue('장소는 200자까지예요');
    case 'due':
    case 'start':
    case 'end':
      if (value === null && key !== 'start') return null;
      if (typeof value === 'string' && (DATE.test(value) || DATETIME.test(value))) return value;
      throw new BadValue(`${key}는 '2026-11-13T15:00:00+09:00' 또는 종일이면 '2026-11-13' 모양이에요`);
    default:
      throw new BadValue(`${key}는 바꿀 수 없어요`);
  }
}

function checkEventTimes({ start, end }) {
  if (end == null) return;
  if (DATE.test(start) !== DATE.test(end)) throw new BadValue('종일 일정은 start·end 둘 다 날짜만, 시각 일정은 둘 다 시각으로 넣어 주세요');
  if (end <= start) throw new BadValue('end는 start보다 뒤여야 해요(종일 일정의 end는 다음 날)');
}
