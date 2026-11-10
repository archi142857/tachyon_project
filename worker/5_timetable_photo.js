// 5. 시간표 사진 → 학기 반복 일정
//
// 흐름: 사진을 올린다 → (R2에 잠깐 둔다) → 똑똑한 모델(Sonnet)이 사진을 바로 읽어 수업 칸 목록을 만든다
//       → 화면이 확인 팝업으로 보여 주고 사용자가 고친다 → 저장하면 학기 끝까지 주마다 events로 펼친다 → 사진은 지운다.
// 앱에 OCR을 넣지 않는다. 사진에 이름·학번이 있을 수 있어서 저장·취소하면 바로 지운다.
// 다시 올려 저장하면 그날부터의 시간표 일정을 새것으로 바꾼다(지난 수업은 그대로).
//
// 주소 (worker/index.js가 /api/timetable* 를 여기로 보낸다. 응답은 JSON)
//   POST /api/timetable          본문 = 사진 바이트 그대로(Content-Type: image/jpeg · png · webp · gif, 5MB까지.
//                                화면에서 긴 변 1600px 안팎으로 줄여 보내면 빠르다)
//                                → { photo, classes: [{title, day: "월", start: "09:30", end: "10:45", place, sure}], note, from, until }
//                                   photo = R2 열쇠(R2가 없으면 null), until = 학기 끝 기본값(짐작, 화면에서 고칠 수 있게)
//   POST /api/timetable/save     { photo, classes, from?, until } → { saved: 만든 일정 수 }
//   POST /api/timetable/cancel   { photo } → { ok }
// 바인딩(선택): R2 env.PHOTOS. 없으면 사진을 저장하지 않고 바로 읽기만 한다.

import { askJson, imageBlock, usageDetail } from "./llm.js";
import { SYSTEM, SCHEMA, USER_TEXT } from "./prompts/timetable_photo.js";
import { kst, ymd, addDays } from "./3_memo_popup.js"; // 한국 날짜 계산은 3번 파일에 한 번만 둔다

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DAYS = 140; // 한 번에 펼치는 기간(20주)
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export async function handle(request, env, ctx, user) {
  if (!user) return json({ error: "로그인이 필요하다" }, 401);
  const [, , action] = new URL(request.url).pathname.split("/").filter(Boolean); // api / timetable / :action
  if (request.method !== "POST") return json({ error: "없는 주소" }, 404);
  if (!action) return readPhoto(request, env, ctx, user);
  if (action === "save") return saveClasses(request, env, ctx, user);
  if (action === "cancel") return cancelPhoto(request, env, ctx, user);
  return json({ error: "없는 주소" }, 404);
}

// ── 주소별 처리 ──────────────────────────────────────────────

async function readPhoto(request, env, ctx, user) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES[type]) return json({ error: "사진(jpeg·png·webp·gif)만 받는다" }, 415);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return json({ error: "사진은 5MB까지" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return json({ error: "사진이 비었다" }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: "사진은 5MB까지" }, 413);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "AI 키가 아직 없다(관리자 설정 필요)" }, 503);

  let photo = null;
  if (env.PHOTOS) {
    const key = `timetable/${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${TYPES[type]}`;
    // R2가 잠깐 안 돼도 사진 읽기는 계속한다(사진 보관은 다시 읽기용일 뿐)
    photo = await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } }).then(() => key, () => null);
  }

  let r;
  try {
    r = await askJson(env, {
      model: "smart",
      system: SYSTEM,
      schema: SCHEMA,
      content: [imageBlock(bytes, type), { type: "text", text: USER_TEXT }],
      maxTokens: 6000, // 수업 15개면 약 1천 토큰. 앞 생각을 못 끄는 모델로 바꿔도 잘리지 않게 넉넉히(쓴 만큼만 값을 낸다)
      timeoutMs: 60000,
      retries: 1,
    });
  } catch (e) {
    background(ctx, writeLog(env, user.id, "llm_fail", JSON.stringify({ use: "timetable_photo", error: e.message.slice(0, 160) })));
    return json({ error: "사진을 읽지 못했다. 잠시 뒤 다시 해 보세요", photo }, 502);
  }
  background(ctx, writeLog(env, user.id, "llm", usageDetail("timetable_photo", r)));

  const classes = (r.data?.classes ?? []).map(cleanClass).filter(Boolean);
  const from = today();
  return json({ photo, classes, note: String(r.data?.note ?? ""), from, until: semesterEnd(from) });
}

async function saveClasses(request, env, ctx, user) {
  const body = await request.json().catch(() => ({}));
  const classes = (Array.isArray(body.classes) ? body.classes : []).map(cleanClass).filter((c) => c && c.title !== "?");
  if (!classes.length) return json({ error: "저장할 수업이 없다" }, 400);
  const from = isDate(body.from) ? body.from : today();
  const until = isDate(body.until) ? body.until : semesterEnd(from);
  if (until < from) return json({ error: "학기 끝 날짜가 시작보다 빠르다" }, 400);
  if (dayDiff(from, until) > MAX_DAYS) return json({ error: `한 번에 ${MAX_DAYS}일까지만 펼친다` }, 400);

  const rows = expandWeekly(classes, from, until);
  // 그날부터의 시간표 일정을 지우고 새로 넣는다(다시 올린 시간표가 이긴다). 한 문장에 12줄씩.
  const statements = [env.DB.prepare("DELETE FROM events WHERE user_id = ? AND source = 'timetable' AND start >= ?").bind(user.id, from)];
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12);
    statements.push(
      env.DB.prepare(
        `INSERT INTO events (user_id, title, start, "end", place, source, ext_id) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, 'timetable', ?)").join(", ")}
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place`,
      ).bind(...chunk.flatMap((e) => [user.id, e.title, e.start, e.end, e.place, e.ext_id])),
    );
  }
  await env.DB.batch(statements);
  await removePhoto(env, user, body.photo);
  background(ctx, writeLog(env, user.id, "timetable_save", JSON.stringify({ classes: classes.length, events: rows.length })));
  return json({ saved: rows.length });
}

async function cancelPhoto(request, env, ctx, user) {
  const body = await request.json().catch(() => ({}));
  await removePhoto(env, user, body.photo);
  background(ctx, writeLog(env, user.id, "timetable_cancel", null));
  return json({ ok: true });
}

// ── 펼치기와 정리 ────────────────────────────────────────────

/** 수업 목록 → from~until 사이 그 요일마다 일정 한 줄 */
export function expandWeekly(classes, from, until) {
  const rows = [];
  for (let d = from; d <= until; d = addDays(d, 1)) {
    const day = DAYS[weekday(d)];
    for (const c of classes) {
      if (c.day !== day) continue;
      rows.push({
        title: c.title,
        start: `${d}T${c.start}:00+09:00`,
        end: `${d}T${c.end}:00+09:00`,
        place: c.place === "?" ? null : c.place,
        ext_id: `tt:${c.title}|${c.day}|${c.start}|${d}`,
      });
    }
  }
  return rows;
}

/** AI 답이나 화면에서 온 수업 칸 하나를 다듬는다. 요일·시각이 이상하면 버린다(null). */
function cleanClass(c) {
  if (!c || typeof c !== "object") return null;
  const start = hhmm(c.start);
  const end = hhmm(c.end);
  if (!DAYS.includes(c.day) || !start || !end || end <= start) return null;
  const text = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : "?");
  return { title: text(c.title), day: c.day, start, end, place: text(c.place), sure: c.sure !== false };
}

function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * 학기 끝 기본값: 정규 수업 마지막 날(종강)까지 매주 펼친다. 보강기간은 매주 수업이 아니라 넣지 않는다.
 * 서울대 2026학년도 학사일정: 2학기 종강 12/14(월, 보강 12/15~21), 1학기 종강 6/15(월).
 * 다른 해도 같은 날을 기본값으로 두고, 화면에서 고칠 수 있게 한다. 그 밖(계절학기·방학)은 6주 뒤.
 */
export function semesterEnd(from) {
  const [y, m] = from.split("-").map(Number);
  if (m >= 8 && m <= 12) return `${y}-12-14`;
  if (m >= 2 && m <= 6) return `${y}-06-15`;
  return addDays(from, 42);
}

async function removePhoto(env, user, key) {
  if (!env.PHOTOS || typeof key !== "string" || !key.startsWith(`timetable/${user.id}/`)) return;
  await env.PHOTOS.delete(key).catch(() => {});
}

// ── 작은 도구들 ──────────────────────────────────────────────

function today() {
  const k = kst(new Date());
  return ymd(k.y, k.m, k.d);
}
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function writeLog(env, userId, action, detail) {
  if (!env.DB) return Promise.resolve();
  return env.DB.prepare("INSERT INTO log (user_id, action, detail) VALUES (?, ?, ?)")
    .bind(userId ?? null, action, detail ?? null)
    .run()
    .catch(() => {});
}

function background(ctx, promise) {
  if (ctx?.waitUntil) ctx.waitUntil(promise);
}

function json(data, status = 200) {
  return Response.json(data, { status });
}
