// 7. 할 일·일정 읽기·고치기 (담당: 서버 세션)
//
// 대시보드의 '할 일 3개'·주간 달력·눌러서 고치기가 쓴다. 모든 질의는 로그인한 사람의 것(user_id)만 본다.
//
//   GET    /api/tasks?limit=3     끝나지 않은 할 일을 여유 적은 순(4_night.js의 rankTasks)으로 → { tasks, warning }
//                                 warning = 몰린 주 경고 문장(없으면 null)
//   GET    /api/tasks?done=1      끝낸 할 일(끝낸 지 얼마 안 된 순, done_at = 끝낸 시각) · done=all 전부(안 끝낸 것 먼저)
//   POST   /api/tasks             { title, due?, minutes?, remind? } → { task } 할 일 바로 넣기(AI 앱 연결 13_mcp.js가 씀, source memo)
//   PATCH  /api/tasks/:id         { done, minutes, ready, title, due } 가운데 바꿀 것만 → { task }
//   DELETE /api/tasks/:id         → { ok }
//   GET    /api/events?from=2026-11-09&to=2026-11-16
//                                 그 기간과 겹치는 일정(to 날짜는 안 들어감, 최대 62일) → { events }. 없으면 오늘부터 7일
//                                 여러 캘린더가 따로 가져온 같은 일정은 하나로 합쳐 준다(lib/twins.js, DB는 그대로)
//   POST   /api/events            { title, start, end?, place? } → { event } 달력 빈 칸을 눌러 바로 넣기(11-14 피드백, 메모를 거치지 않음, source memo)
//   PATCH  /api/events/:id        { important, title, start, end, place } 가운데 바꿀 것만 → { event }
//                                 시각 일정의 끝이 없으면(안 보냄·null·옛 끝이 안 맞음) 시작 + 1시간
//   DELETE /api/events/:id        → { ok }
//   GET    /api/reminders?auto=1&morning=1&wake=7  앞으로 14일 안에 울릴 알림 → { reminders: [{ id, title, body, at, kind, ref, auto? }], mornings?: [{ date, title, body, large }] }
//                                 (11-16 사람 "하고 싶은 일정에만, 할 일·일정 모두" + 11-21 마감 임박(auto) · 아침 브리핑(morning))
//                                 remind = 시작·마감 몇 분 전(0~1440, null = 안 함). 고치기 PATCH의 remind로 켜고 끈다(캘린더에서 온 것도 사본 없이).
//                                 id = 폰 알림 번호(일정 10000 + 2·id, 할 일 10001 + 2·id), at = 울릴 시각. 종일 일정은 그날 9시 기준.
//                                 폰 앱(web/src/native.js planReminders)이 이 목록대로 알림을 잡는다. 브라우저는 알림을 띄우지 않는다
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
import { kstDate, kstIso, DAY_MS } from './lib/time.js';
import { logStatement } from './lib/log.js';
import { isLinked } from './12_gcal.js';
import { mergeTwins } from './lib/twins.js';

const FEED_SOURCES = new Set(['etl', 'google', 'apple', 'naver', 'device']);
const FEED_NAMES = { etl: 'eTL', google: '구글 캘린더', apple: '애플 캘린더', naver: '네이버 캘린더', device: '폰 캘린더' };
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
    if (id === null && method === 'POST') return createTask(request, env, user);
    if (id !== null && method === 'PATCH') return patchItem(request, env, user, 'tasks', id);
    if (id !== null && method === 'DELETE') return deleteItem(env, user, 'tasks', id);
  }
  if (table === 'reminders' && id === null && method === 'GET') return listReminders(url, env, user);
  if (table === 'events') {
    if (id === null && method === 'GET') return listEvents(url, env, user);
    if (id === null && method === 'POST') return createEvent(request, env, user);
    if (id !== null && method === 'PATCH') return patchItem(request, env, user, 'events', id);
    if (id !== null && method === 'DELETE') return deleteItem(env, user, 'events', id);
  }
  return fail(404, '없는 주소예요');
}

// ── 읽기 ─────────────────────────────────────────────────────────

const TASK_COLUMNS = 'id, title, due, minutes, ready, done, source, remind';
// 끝낸 시각: 이 사람의 task_done 줄을 한 번만 모아(할 일 id마다 마지막 시각) 붙인다. 할 일마다 log를 다시 훑으면
// D1 읽기가 '끝낸 할 일 수 × task_done 줄 수'로 커진다(11-12 무료 하루 읽기 한도).
const DONE_AT_JOIN = `LEFT JOIN (SELECT json_extract(detail, '$.id') AS task_id, MAX(at) AS done_at FROM log
     WHERE action = 'task_done' AND user_id = ?1 AND json_valid(detail) GROUP BY 1) d ON d.task_id = tasks.id`;
const EVENT_COLUMNS = `id, title, start, "end", place, source, important, remind, (source = 'memo' AND ext_id LIKE 'edit:%') AS edited`; // edited = 캘린더 일정을 여기서 고친 사본

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
  return json({ ok: true, events: mergeTwins(results) });
}

// ── 고치기·지우기 ────────────────────────────────────────────────

const EDITABLE = {
  tasks: { always: ['done', 'minutes', 'ready', 'remind'], own: ['title', 'due'] },
  events: { always: ['important', 'remind'], own: ['title', 'start', 'end', 'place'] },
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
    if (table === 'events' && ('start' in values || 'end' in values)) {
      const merged = { ...row, ...values };
      const end = eventEnd(merged, values.end != null);
      if (end !== merged.end) {
        values.end = end;
        if (!fields.includes('end')) fields.push('end');
      }
    }
  } catch (err) {
    if (err instanceof BadValue) return fail(400, err.message);
    throw err;
  }

  if (FEED_SOURCES.has(row.source) && !(await gcalOwn(env, user, table, row))) {
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
  const pick = table === 'tasks' ? ['id', 'title', 'due', 'minutes', 'ready', 'done', 'source', 'remind'] : ['id', 'title', 'start', 'end', 'place', 'source', 'important', 'remind'];
  return json({ ok: true, [table === 'tasks' ? 'task' : 'event']: Object.fromEntries(pick.map((k) => [k, updated[k] ?? null])) });
}

// 달력 빈 칸을 눌러 넣기(11-14 피드백 '달력에서 클릭해서 일정 넣기'). 칸 검사는 고치기와 같은 clean · eventEnd(끝이 없으면 1시간)
async function createTask(request, env, user) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'JSON 본문이 필요해요');
  let t;
  try {
    t = { title: clean('tasks', 'title', body.title), due: clean('tasks', 'due', body.due ?? null), minutes: clean('tasks', 'minutes', body.minutes ?? null), remind: clean('tasks', 'remind', body.remind ?? null) };
  } catch (err) {
    if (err instanceof BadValue) return fail(400, err.message);
    throw err;
  }
  const [res] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO tasks (user_id, title, due, minutes, source, remind) VALUES (?, ?, ?, ?, 'memo', ?) RETURNING ${TASK_COLUMNS}`).bind(user.id, t.title, t.due, t.minutes, t.remind),
    logStatement(env, user.id, 'item_add', { table: 'tasks' }),
  ]);
  return json({ ok: true, task: res.results[0] }, 201);
}

async function createEvent(request, env, user) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'JSON 본문이 필요해요');
  let e;
  try {
    e = { title: clean('events', 'title', body.title), start: clean('events', 'start', body.start), end: clean('events', 'end', body.end ?? null), place: clean('events', 'place', body.place ?? null), remind: clean('events', 'remind', body.remind ?? null) };
    e.end = eventEnd(e, body.end != null);
  } catch (err) {
    if (err instanceof BadValue) return fail(400, err.message);
    throw err;
  }
  const [res] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO events (user_id, title, start, "end", place, source, remind) VALUES (?, ?, ?, ?, ?, 'memo', ?) RETURNING ${EVENT_COLUMNS}`).bind(user.id, e.title, e.start, e.end, e.place, e.remind),
    logStatement(env, user.id, 'item_add', { table: 'events' }),
  ]);
  return json({ ok: true, event: res.results[0] }, 201);
}

/** 캘린더에서 온 일정을 고침: 고친 값으로 사본을 넣고(같은 원본을 또 고치면 그 사본을 덮는다) 원본은 가린다. e = 원본 줄에 고친 값을 덮은 것 */
// ponytail: 원본이 그 캘린더에서 지워지거나 바뀌어도 사본은 그대로 남는다. 따라가야 하면 수집(2_collect_ics.js)에서 맞춘다.
async function editCopy(env, user, e, fields) {
  const extId = `edit:${e.id}`;
  const [saved] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO events (user_id, title, start, "end", place, source, ext_id, important, remind) VALUES (?, ?, ?, ?, ?, 'memo', ?, ?, ?)
       ON CONFLICT (user_id, source, ext_id) DO UPDATE
         SET title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place, important = excluded.important, remind = excluded.remind
       RETURNING ${EVENT_COLUMNS}`,
    ).bind(user.id, e.title, e.start, e.end, e.place, extId, e.important, e.remind ?? null),
    env.DB.prepare(
      `UPDATE events SET moved_to = (SELECT id FROM events WHERE user_id = ?1 AND source = 'memo' AND ext_id = ?2) WHERE id = ?3 AND user_id = ?1`,
    ).bind(user.id, extId, e.id),
    logStatement(env, user.id, 'item_edit', { table: 'events', id: e.id, fields, copy: true }),
  ]);
  return json({ ok: true, event: saved.results[0] });
}

// 구글 캘린더를 API로 연동했으면(12_gcal.js) 구글 일정도 여기서 바로 고치고 지운다 → 구글에도 그대로 간다(사본을 만들지 않음)
async function gcalOwn(env, user, table, row) {
  return table === 'events' && row.source === 'google' && isLinked(env, user.id);
}

async function deleteItem(env, user, table, id) {
  const row = await env.DB.prepare(`SELECT source FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, user.id).first();
  if (!row) return fail(404, '없는 항목이에요');
  if (FEED_SOURCES.has(row.source) && !(await gcalOwn(env, user, table, row))) {
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

// ── 리마인드 · 마감 임박 · 아침 브리핑(앱이 폰 알림으로 잡는 목록) ─────────────────

const REMIND_DAYS = 14;
const AUTO_MAX = 2; // 자동(마감 임박) 알림은 하루 2번까지 — 넘으면 한 알림으로 묶는다(11-21 사람 "귀찮지 않으면서, 필요한 알림")
const QUIET_FROM = 23; // 조용한 시간: 23시 ~ 일어나는 시각
const ahead = (m) => (m === 1440 ? '하루' : m % 1440 === 0 ? `${m / 1440}일` : m % 60 === 0 ? `${m / 60}시간` : `${m}분`);
const took = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const clockOf = (ms) => kstIso(ms).slice(11, 16);
const dayWord = (fromMs, date) => {
  const gap = Math.round((Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${kstDate(fromMs)}T00:00:00+09:00`)) / DAY_MS);
  return gap <= 0 ? '오늘' : gap === 1 ? '내일' : `${gap}일 뒤`;
};

/**
 * 울릴 시각(ms)과 알림 글. 제목만 봐도 무엇이 · 언제인지 알게(11-21): '선형대수 · 30분 뒤' / '10:00–11:15 · 25동 207호'.
 * 종일 일정 · 날짜만 있는 마감은 그날 9시 기준이고 '1시간 뒤 마감'처럼 없는 시각을 말하지 않는다('오늘까지').
 * kind · ref = 알림을 누르면 열 것(화면 native.js → Dashboard.jsx)
 */
export function reminderOf(kind, row) {
  const base = kind === 'event' ? row.start : row.due;
  const allDay = DATE.test(base);
  const baseMs = Date.parse(allDay ? `${base}T09:00:00+09:00` : base);
  const at = baseMs - row.remind * 60000;
  const need = row.minutes ? `${took(row.minutes)}쯤 걸려요` : '';
  let title;
  let body;
  if (kind === 'event') {
    const end = !allDay && row.end && !DATE.test(row.end) ? `–${clockOf(Date.parse(row.end))}` : '';
    title = allDay ? row.title : `${row.title} · ${row.remind ? `${ahead(row.remind)} 뒤` : '지금 시작'}`;
    body = allDay ? `${dayWord(at, base)} 종일 일정` : `${clockOf(baseMs)}${end}${row.place ? ` · ${row.place}` : ''}`;
  } else {
    title = allDay ? `${row.title} · ${dayWord(at, base)}까지` : `${row.title} · ${row.remind ? `${ahead(row.remind)} 뒤 마감` : '지금 마감'}`;
    body = allDay ? need : `마감 ${clockOf(baseMs)}${need ? ` · ${need}` : ''}`;
  }
  return { id: (kind === 'event' ? 10000 : 10001) + 2 * row.id, title, body, at, kind, ref: row.id };
}

/**
 * 마감 임박(자동, 11-21): 리마인드를 따로 안 건 할 일을 마감 3시간 전에 한 번(걸리는 시간의 두 배가 더 길면 그만큼 일찍, 하루까지).
 * 조용한 시간(23시 ~ wake시)에 걸리면 그 전 저녁 21시로 당긴다. 날짜만 있는 마감은 그날 9시에 '오늘까지'.
 * 번호는 손으로 건 리마인드와 같아(10001 + 2·id) 둘이 겹쳐 울리지 않는다.
 */
export function dueSoonOf(row, wake = 7) {
  const dateOnly = DATE.test(row.due);
  const need = row.minutes ? `${took(row.minutes)}쯤 걸려요` : '';
  const one = { id: 10001 + 2 * row.id, kind: 'task', ref: row.id, auto: true };
  if (dateOnly) return { ...one, title: `오늘까지 · ${row.title}`, body: need, at: Date.parse(`${row.due}T09:00:00+09:00`) };
  const due = Date.parse(row.due);
  let at = due - Math.min(1440, Math.max(180, 2 * (row.minutes || 0))) * 60000;
  const hour = Number(clockOf(at).slice(0, 2));
  if (hour >= QUIET_FROM || hour < wake) at = Date.parse(`${kstDate(hour < wake ? at - DAY_MS : at)}T21:00:00+09:00`);
  const gap = Math.round((due - at) / 60000);
  const left = gap >= 180 ? Math.round(gap / 60) * 60 : gap; // 세 시간부터는 시간 단위로
  return { ...one, title: `${dayWord(at, row.due.slice(0, 10))} ${clockOf(due)} 마감 · ${row.title}`, body: `${took(left)} 남음${need ? ` · ${need}` : ''}`, at };
}

/** 자동 알림이 하루 AUTO_MAX개를 넘으면 앞의 것만 두고 나머지는 한 알림으로(번호 9001~: 날마다 하나) */
export function capAuto(list, now) {
  const days = new Map();
  for (const r of list) if (r.auto) days.set(kstDate(r.at), [...(days.get(kstDate(r.at)) || []), r]);
  const drop = new Set();
  const sums = [];
  for (const [date, rows] of days) {
    if (rows.length <= AUTO_MAX) continue;
    const rest = rows.slice(AUTO_MAX - 1);
    rest.forEach((r) => drop.add(r));
    const n = Math.round((Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${kstDate(now)}T00:00:00+09:00`)) / DAY_MS);
    sums.push({ id: 9001 + n, title: `마감이 가까운 할 일 ${rest.length}개`, body: rest.map((r) => r.title.split(' · ').pop()).join(' · '), at: rest[0].at, kind: 'tasks', ref: null, auto: true });
  }
  return [...list.filter((r) => !drop.has(r)), ...sums].sort((a, b) => a.at - b.at);
}

/**
 * 아침 브리핑(11-21): 앞으로 8일, 날마다 그날 일정 · 마감 · 밀린 일을 제목과 한 줄로. 아무것도 없는 날은 없다(알림도 안 감).
 * → [{ date, title: '오늘 · 일정 3 · 마감 2', body: '09:30 선형대수(25동 207호) · 마감 통계 과제 23:59 · 밀린 일 2개', large }]
 */
export function morningsOf(events, tasks, now) {
  const today = kstDate(now);
  const late = tasks.filter((t) => t.due.slice(0, 10) < today).length;
  const out = [];
  for (let d = 0; d < 8; d += 1) {
    const date = kstDate(now + d * DAY_MS);
    const evs = events.filter((e) => (DATE.test(e.start) ? e.start <= date && (date < (e.end || '') || e.start === date) : e.start.slice(0, 10) === date)); // 여러 날 종일 일정은 날마다
    const due = tasks.filter((t) => t.due.slice(0, 10) === date);
    if (!evs.length && !due.length && !late) continue;
    const timed = evs.filter((e) => !DATE.test(e.start));
    const evLine = (e) => (DATE.test(e.start) ? `종일 ${e.title}` : `${e.start.slice(11, 16)} ${e.title}`);
    const dueLine = (t) => `마감 ${t.title}${DATE.test(t.due) ? '' : ` ${t.due.slice(11, 16)}`}`;
    const lateLine = late ? `밀린 일 ${late}개` : '';
    const title = ['오늘', evs.length && `일정 ${evs.length}`, due.length && `마감 ${due.length}`, !evs.length && !due.length && lateLine].filter(Boolean).join(' · ');
    const first = timed[0] || evs[0];
    const body = [first && `${evLine(first)}${first.place ? `(${first.place})` : ''}`, due[0] && dueLine(due[0]), (evs.length || due.length) && lateLine].filter(Boolean).join(' · ');
    const lines = [...evs.map((e) => `${evLine(e)}${e.place ? ` · ${e.place}` : ''}`), ...due.map(dueLine)];
    out.push({ date, title, body, large: [...lines.slice(0, 8), lines.length > 8 && `그 밖에 ${lines.length - 8}개`, lateLine].filter(Boolean).join('\n') });
  }
  return out;
}

// GET /api/reminders?auto=1&morning=1&wake=7 — auto = 마감 임박도, morning = 아침 브리핑도(이때 날짜만 있는 마감은 브리핑에 있으니 자동 알림에서 뺀다)
async function listReminders(url, env, user) {
  const q = url.searchParams;
  const [auto, morning] = [q.get('auto') === '1', q.get('morning') === '1'];
  const wake = Math.min(12, Math.max(4, Number(q.get('wake')) || 7));
  const now = Date.now();
  const [from, to] = [kstDate(now), kstDate(now + (REMIND_DAYS + 2) * DAY_MS)]; // 하루 전 알림까지 넉넉히 읽고 시각으로 거른다
  const [events, tasks, week] = await env.DB.batch([
    env.DB.prepare('SELECT id, title, start, "end", place, remind FROM events WHERE user_id = ?1 AND remind IS NOT NULL AND moved_to IS NULL AND start >= ?2 AND start < ?3').bind(user.id, from, to),
    auto || morning
      ? env.DB.prepare('SELECT id, title, due, minutes, remind FROM tasks WHERE user_id = ?1 AND done = 0 AND due IS NOT NULL AND due < ?2 ORDER BY due').bind(user.id, to)
      : env.DB.prepare('SELECT id, title, due, minutes, remind FROM tasks WHERE user_id = ?1 AND remind IS NOT NULL AND done = 0 AND due >= ?2 AND due < ?3').bind(user.id, from, to),
    morning
      ? env.DB.prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE user_id = ?1 AND moved_to IS NULL AND start < ?3 AND (COALESCE("end", start) > ?2 OR start >= ?2) ORDER BY start, id`).bind(user.id, from, kstDate(now + 8 * DAY_MS))
      : env.DB.prepare('SELECT 1 WHERE 0'),
  ]);
  const open = tasks.results.filter((t) => t.due >= from);
  const list = [
    ...events.results.map((r) => reminderOf('event', r)),
    ...open.filter((t) => t.remind != null).map((r) => reminderOf('task', r)),
    ...(auto ? open.filter((t) => t.remind == null && !(morning && DATE.test(t.due))).map((r) => dueSoonOf(r, wake)) : []),
  ]
    .filter((r) => r.at > now && r.at <= now + REMIND_DAYS * DAY_MS)
    .sort((a, b) => a.at - b.at);
  return json({
    ok: true,
    reminders: capAuto(list, now).map((r) => ({ ...r, at: kstIso(r.at) })),
    ...(morning ? { mornings: morningsOf(mergeTwins(week.results), tasks.results, now) } : {}),
  });
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
    case 'remind':
      if (value === null) return null;
      if (Number.isInteger(value) && value >= 0 && value <= 1440) return value;
      throw new BadValue('remind는 0~1440 사이 정수(몇 분 전)이거나 null이에요');
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

/**
 * 시각을 고친 뒤의 끝. 시각 일정에 끝이 없으면 시작 + 1시간(사람 11-13 "끝나는 시간을 따로 정하지 않았으면 1시간을 기본으로").
 * 이번에 보낸 끝(endGiven)이 모양이 다르거나 시작보다 앞이면 400. 시작만 보내서 옛 끝이 안 맞게 됐으면(종일 ↔ 시각, 옛 끝보다 뒤로) 옛 끝은 버린다.
 * 캘린더(구글·폰 등)에서 온 줄은 시각을 고칠 때만 여기를 지난다 — 끝 없는 원본은 그대로 두고 화면이 1시간으로 그린다.
 */
function eventEnd({ start, end }, endGiven) {
  if (end != null && DATE.test(start) !== DATE.test(end)) {
    if (endGiven) throw new BadValue('종일 일정은 start·end 둘 다 날짜만, 시각 일정은 둘 다 시각으로 넣어 주세요');
    end = null;
  }
  if (end != null && end <= start) {
    if (endGiven) throw new BadValue('end는 start보다 뒤여야 해요(종일 일정의 end는 다음 날)');
    end = null;
  }
  if (end == null && DATETIME.test(start)) return kstIso(Date.parse(start) + 60 * 60 * 1000);
  return end;
}
