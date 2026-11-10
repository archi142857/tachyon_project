// 3. 메모(나와의 채팅) → 즉시 팝업
//
// 흐름: 메모를 저장한다 → 날짜·시각 말이 있으면(정규식) 빠른 모델에게 '일정인지·이름·장소'를 묻는다
//       → 팝업 후보(이름·날짜·시각·장소, 모르면 '?')를 돌려준다 → 사용자가 저장/고치기/취소 → events.
// 날짜·시각은 코드가 먼저 계산한다(위험 확인 '팝업 1초'의 대처). AI 답이 늦거나 실패하면 규칙만으로 팝업을 만든다.
// 일정이 아닌 메모(할 일·생각)는 팝업 없이 메모로 남고, 밤 정리(4_night.js)가 읽는다.
// 아는 일정으로 채우기(lib/known.js, AI 없이): '공수2 휴강 16일' → 내 '공학수학 2' 수업 시각·장소(popup.from),
//       '… 16일로 변경' → 옮길 일정(popup.change). 지금은 알려 주기만 한다(옛 일정을 가리는 것은 가지 '일정-옮기기': events.moved_to 칸이 필요).
//
// 주소 (worker/index.js가 /api/memo* 를 여기로 보낸다. 응답은 모두 JSON)
//   POST   /api/memo              { text }                    → { memo, popup }   popup은 일정이 아니면 null
//   GET    /api/memo?before=&limit=                           → { memos }         오래된 것부터, event_id·task_id = 이 메모로 만든 일정·할 일
//   POST   /api/memo/:id/save     { title, date, time, end_time, place, suggested } → { event }
//                                 suggested = 받았던 popup 그대로(고쳤는지 재려고). 모르는 칸은 '?'
//   POST   /api/memo/:id/cancel                               → { ok }            메모는 남아서 밤 정리가 읽는다
//   DELETE /api/memo/:id                                      → { ok }
//
// popup 모양: { title, date: "2026-11-10", time: "15:00", end_time: "?", place: "301동", by: "ai" | "rule",
//               from: "공학수학 2"(시각·장소를 가져온 내 일정, 없으면 없음), change: { id, title, start }(옮길 일정, 없으면 없음) }
// 표: memos(쓰기·읽기), events(source='memo', ext_id='memo:<메모 id>'), log(popup_save·popup_edit·popup_cancel·llm·llm_fail)

import { askJson, usageDetail } from "./llm.js";
import { SYSTEM, SCHEMA, userMessage } from "./prompts/memo_popup.js";
import { useKnown } from "./lib/known.js";

export async function handle(request, env, ctx, user) {
  if (!user) return json({ error: "로그인이 필요하다" }, 401);
  const url = new URL(request.url);
  const [, , idPart, action] = url.pathname.split("/").filter(Boolean); // api / memo / :id / :action
  const id = idPart ? Number(idPart) : null;
  if (idPart && !Number.isInteger(id)) return json({ error: "없는 주소" }, 404);

  if (!id && request.method === "POST") return addMemo(request, env, ctx, user);
  if (!id && request.method === "GET") return listMemos(url, env, user);
  if (id && action === "save" && request.method === "POST") return savePopup(request, env, ctx, user, id);
  if (id && action === "cancel" && request.method === "POST") return cancelPopup(env, ctx, user, id);
  if (id && !action && request.method === "DELETE") return deleteMemo(env, user, id);
  return json({ error: "없는 주소" }, 404);
}

// ── 주소별 처리 ──────────────────────────────────────────────

async function addMemo(request, env, ctx, user) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return json({ error: "메모가 비었다" }, 400);
  if (text.length > 1000) return json({ error: "메모는 1000자까지" }, 400);

  const now = new Date();
  // 저장과 팝업 만들기를 함께 돌려서 기다리는 시간을 줄인다.
  const [memo, popup] = await Promise.all([
    env.DB.prepare("INSERT INTO memos (user_id, text, created_at) VALUES (?, ?, ?) RETURNING id, text, created_at, handled")
      .bind(user.id, text, isoKst(now))
      .first(),
    suggestEvent(env, text, now, { ctx, userId: user.id }),
  ]);
  return json({ memo, popup });
}

async function listMemos(url, env, user) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const before = Number(url.searchParams.get("before")) || null;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.text, m.created_at, m.handled, e.id AS event_id, t.id AS task_id
       FROM memos m
       LEFT JOIN events e ON e.user_id = m.user_id AND e.source = 'memo' AND e.ext_id = 'memo:' || m.id
       LEFT JOIN tasks t ON t.user_id = m.user_id AND t.source = 'memo' AND t.ext_id = 'memo:' || m.id
      WHERE m.user_id = ? AND (? IS NULL OR m.id < ?)
      ORDER BY m.id DESC LIMIT ?`,
  )
    .bind(user.id, before, before, limit)
    .all();
  return json({ memos: results.reverse() }); // 채팅처럼 아래가 최신
}

async function savePopup(request, env, ctx, user, memoId) {
  const body = await request.json().catch(() => ({}));
  const f = popupFields(body);
  if (!f.title || !f.date) return json({ error: "이름과 날짜는 있어야 한다" }, 400);

  const memo = await env.DB.prepare("SELECT id FROM memos WHERE id = ? AND user_id = ?").bind(memoId, user.id).first();
  if (!memo) return json({ error: "없는 메모" }, 404);

  const { start, end } = toStartEnd(f);
  const [saved] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO events (user_id, title, start, "end", place, source, ext_id) VALUES (?, ?, ?, ?, ?, 'memo', ?)
       ON CONFLICT (user_id, source, ext_id) DO UPDATE
         SET title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place
       RETURNING id, title, start, "end", place, source`,
    ).bind(user.id, f.title, start, end, f.place, `memo:${memoId}`),
    env.DB.prepare("UPDATE memos SET handled = 1 WHERE id = ? AND user_id = ?").bind(memoId, user.id),
  ]);

  // 측정: 고치지 않고 저장한 비율 = AI(또는 규칙) 정확도
  const edited = body.suggested ? !sameFields(f, popupFields(body.suggested)) : Boolean(body.edited);
  const detail = JSON.stringify({ memo_id: memoId, by: body.suggested?.by ?? null, known: Boolean(body.suggested?.from) });
  background(ctx, writeLog(env, user.id, edited ? "popup_edit" : "popup_save", detail));
  return json({ event: saved.results[0] });
}

async function cancelPopup(env, ctx, user, memoId) {
  const memo = await env.DB.prepare("SELECT id FROM memos WHERE id = ? AND user_id = ?").bind(memoId, user.id).first();
  if (!memo) return json({ error: "없는 메모" }, 404);
  background(ctx, writeLog(env, user.id, "popup_cancel", JSON.stringify({ memo_id: memoId })));
  return json({ ok: true });
}

async function deleteMemo(env, user, memoId) {
  const r = await env.DB.prepare("DELETE FROM memos WHERE id = ? AND user_id = ?").bind(memoId, user.id).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: "없는 메모" }, 404);
}

// ── 팝업 후보 만들기 ─────────────────────────────────────────

/**
 * 메모 한 줄 → 팝업 후보 또는 null(일정이 아님).
 * 날짜·시각 말이 없으면 AI를 부르지 않는다(비용·지연 0).
 */
export async function suggestEvent(env, text, now = new Date(), { ctx, userId, fetch } = {}) {
  const when = findWhen(text, now);
  if (!when) return null;

  const askAi = async () => {
    if (!env.ANTHROPIC_API_KEY) return null;
    try {
      const r = await askPopupAi(env, text, now, { fetch, timeoutMs: Number(env.POPUP_AI_MS) || 2500 });
      background(ctx, writeLog(env, userId, "llm", usageDetail("memo_popup", r)));
      return r.data;
    } catch (e) {
      background(ctx, writeLog(env, userId, "llm_fail", JSON.stringify({ use: "memo_popup", error: e.message.slice(0, 160) })));
      return null;
    }
  };
  // AI에게 묻는 동안 내 일정을 읽는다(기다리는 시간이 안 늘고, AI에게는 일정을 안 보낸다 = 토큰 그대로)
  const [ai, known] = await Promise.all([askAi(), loadKnown(env, userId, text, now)]);
  const popup = mergePopup(text, when, ai, now);
  return popup && useKnown(popup, text, known, isoKst(now).slice(0, 10));
}

/** 메모의 낱말과 첫 글자가 같은 내 일정(2주 전 ~ 6달 뒤). 줄임말은 첫 글자가 같다(lib/known.js) */
async function loadKnown(env, userId, text, now) {
  if (!env.DB || !userId) return [];
  const today = isoKst(now).slice(0, 10);
  const firsts = [...new Set(text.split(/\s+/).filter(Boolean).map((w) => w[0]))];
  return env.DB.prepare(
    `SELECT id, title, start, "end", place FROM events
      WHERE user_id = ? AND start >= ? AND start < ?
        AND substr(title, 1, 1) IN (SELECT value FROM json_each(?))
      ORDER BY start LIMIT 400`,
  )
    .bind(userId, addDays(today, -14), addDays(today, 180), JSON.stringify(firsts))
    .all()
    .then((r) => r.results)
    .catch(() => []); // 일정을 못 읽어도 팝업은 뜬다
}

/** 빠른 모델에게 묻기 (위험 확인 스크립트 worker/check/haiku_latency.js도 이걸 쓴다) */
export function askPopupAi(env, text, now, { fetch, timeoutMs = 2500 } = {}) {
  return askJson(env, {
    model: "fast",
    system: SYSTEM,
    content: userMessage(text, nowLabel(now)),
    schema: SCHEMA,
    maxTokens: 200,
    timeoutMs,
    fetch,
  });
}

/**
 * 정규식 결과(when)와 AI 답(ai, 없으면 null)을 합친다.
 * - 일정인지·이름·장소는 AI가 먼저, 없으면 규칙.
 * - 날짜·시각은 정규식이 먼저. 오전·오후를 짐작한 경우에만 AI의 같은 시각(3시 ↔ 15시)을 따른다.
 */
export function mergePopup(text, when, ai, now = new Date()) {
  if (ai ? ai.is_schedule !== true : !looksLikeSchedule(text, when)) return null;

  let date = when.date;
  let time = when.time;
  let end = when.end;
  const aiTime = cleanTime(ai?.time);
  if (time && when.guessed && aiTime && aiTime !== time && sameClock(aiTime, time)) {
    // 오전·오후를 짐작한 시각은 AI를 따른다(3시 ↔ 15시). 끝 시각도 같이 12시간 옮긴다
    const shift = toMin(aiTime) - toMin(time);
    time = aiTime;
    if (end) end = hhmm((toMin(end) + shift + 1440) % 1440);
    if (!when.dateExplicit) date = nextDayAt(aiTime, now); // "9시 영화"처럼 날짜를 안 썼으면 그 시각이 다음에 오는 날
  }
  if (!time && aiTime) time = aiTime;

  const guess = guessTitlePlace(text, when);
  return {
    title: clean(ai?.title) ?? guess.title,
    date,
    time: time ?? "?",
    end_time: end ?? "?",
    place: clean(ai?.place) ?? guess.place ?? "?",
    by: ai ? "ai" : "rule",
  };
}

/** AI 없이 판단할 때: 시각이 있고, 마감·지난 일이 아니면 일정 ("2시부터 4시까지"의 까지는 시각 말이라 뺀다) */
function looksLikeSchedule(text, when) {
  if (!when.time || when.past) return false;
  const rest = cutSpans(text, when.spans);
  if (/까지|마감|제출/.test(rest)) return false;
  if (/(었|았|였|했)(다|음|어)/.test(rest)) return false;
  return true;
}

// ── 날짜·시각 읽기 (정규식) ──────────────────────────────────

const PERIOD = "(오전|오후|아침|점심|저녁|밤|새벽|낮)?\\s*";
const KO_HOUR = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };
const WEEKDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const WEEK_OFFSET = { 이번: 0, 금: 0, 다음: 1, 담: 1, 차: 1, 다다음: 2, 저번: -1, 지난: -1 };
const REL_DAYS = { 오늘: 0, 금일: 0, 이따: 0, 이따가: 0, 내일: 1, 낼: 1, 명일: 1, 내일모레: 2, 모레: 2, 글피: 3, 어제: -1, 그제: -2, 그저께: -2 };

// 날짜: 위에 있는 것이 먼저다.
const DATE_RULES = [
  { kind: "ymd", re: /(?<!\d)(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/g }, // 2026-11-13, 2026년 11월 13일
  { kind: "md", re: /(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g }, // 11월 13일
  { kind: "md", re: /(?<![\d./])(\d{1,2})\s*[/.]\s*(\d{1,2})(?![\d./%]|\s*(?:시|배|점|퍼))/g }, // 11/13, 11.13 (3.5시간 아님)
  { kind: "rel", re: /(?<![가-힣])(오늘|금일|이따가?|내일모레|내일|낼|명일|모레|글피|어제|그저께|그제)/g }, // '보낼'의 낼은 아님
  { kind: "later", re: /(?<!\d)(\d{1,2})\s*일\s*(?:뒤|후)(?![가-힣])/g }, // 3일 뒤
  { kind: "wd", re: /(?:(다다음|이번|다음|저번|지난|금|담|차)\s*주\s*)?([월화수목금토일])\s*(?:요일|욜)/g }, // (다음주) 금요일
  { kind: "wd", re: /(다다음|이번|다음|저번|지난|금|담|차)\s*주\s*([월화수목금토일])(?![가-힣])/g }, // 담주 화 3시 ('다음 주 수업'은 아님)
  { kind: "wd", re: /(?<![가-힣\d])()([월화수목금토일])(?=\s*(?:\d{1,2}\s*시|\d{1,2}:\d{2}|오전|오후|아침|점심|저녁|밤|새벽))/g }, // 금 7시, 수 18:30
  { kind: "day", re: /(?<!\d)(\d{1,2})\s*일(?!\s*(?:간|동안|째|차|정도|마다|뒤|후|전|에\s*한))/g }, // 13일 (3일간 아님)
];
const AFTER_DATE_WEEKDAY = /^\s*\(?\s*[월화수목금토일](?:요일|욜)?(?![가-힣])\s*\)?/; // 11/13(금) 의 (금). '11/13 수업'의 수는 아님

const HOUR_RANGE = new RegExp(PERIOD + "(?<!\\d)(\\d{1,2})\\s*[~\\-–]\\s*(\\d{1,2})\\s*시(?![간작험])", "g"); // 3~5시
const TIME_RULES = [
  new RegExp(PERIOD + "(?<!\\d)(\\d{1,2}):(\\d{2})", "g"), // 18:30
  new RegExp(PERIOD + "(?<!\\d)(\\d{1,2})\\s*시(?![간작험])(?:\\s*(반|\\d{1,2}\\s*분))?", "g"), // 3시, 3시 반, 3시 20분 (3시간·시험 아님)
  // 세 시 반, 네시에 ('한시적', '한 시점', '세 시간'은 아님: 시 뒤에 다른 글자가 붙으면 버린다)
  new RegExp(PERIOD + "(?<![가-힣])(열두|열한|열|한|두|세|네|다섯|여섯|일곱|여덟|아홉)\\s*시(?=$|[^가-힣]|반|에|까지|부터|쯤|경|정각|전|후)(?:\\s*(반|\\d{1,2}\\s*분))?", "g"),
  new RegExp(PERIOD + "(정오|자정)", "g"),
];
const RANGE_GLUE = /^\s*(?:~|-|–|부터)\s*/;

/**
 * 메모에서 날짜·시각을 읽는다. 둘 다 없으면 null.
 * @returns {{date: string, time: string|null, end: string|null, guessed: boolean, dateExplicit: boolean, past: boolean, spans: number[][]}|null}
 *   guessed = 오전·오후를 짐작함, dateExplicit = 날짜를 썼음(아니면 시각만 보고 오늘·내일로 정함), spans = 읽은 글자 범위(이름을 뽑을 때 뺀다)
 */
export function findWhen(text, now = new Date()) {
  const k = kst(now);
  const today = ymd(k.y, k.m, k.d);
  const nowMin = k.hh * 60 + k.mi;
  const spans = [];

  const d = findDate(text, k, today);
  if (d) spans.push(d.span);
  const t = findTime(text);
  if (t) spans.push(...t.spans);
  if (!d && !t) return null;

  let date = d?.date ?? null;
  let time = null;
  let end = null;
  let guessed = false;
  if (t) {
    const isToday = date === today;
    const s = to24(t.start, isToday ? nowMin : null);
    if (!date) {
      // 날짜 없이 시각만: 아직 안 지났으면 오늘, 지났으면 내일
      date = s.min + s.addDays * 1440 > nowMin ? today : addDays(today, 1);
    }
    if (s.addDays) date = addDays(date, s.addDays);
    time = hhmm(s.min);
    guessed = s.guessed;
    if (t.end) {
      const e = to24({ ...t.end, period: t.end.period ?? t.start.period }, null);
      let endMin = e.min;
      if (e.guessed && endMin <= s.min && endMin + 720 > s.min && endMin + 720 < 1440) endMin += 720; // 11시~1시
      if (endMin > s.min) end = hhmm(endMin);
    }
  }
  return { date, time, end, guessed, dateExplicit: Boolean(d), past: Boolean(d?.past), spans };
}

function findDate(text, k, today) {
  for (const rule of DATE_RULES) {
    let pastHit = null;
    for (const m of text.matchAll(rule.re)) {
      const r = readDate(rule.kind, m, k, today);
      if (!r) continue;
      let endAt = m.index + m[0].length;
      if (rule.kind === "ymd" || rule.kind === "md" || rule.kind === "day") {
        const wd = text.slice(endAt).match(AFTER_DATE_WEEKDAY);
        if (wd) endAt += wd[0].length;
      }
      const hit = { ...r, span: [m.index, endAt] };
      if (!hit.past) return hit; // 지난 날("어제")보다 앞으로 올 날을 먼저 고른다
      pastHit ??= hit;
    }
    if (pastHit) return pastHit;
  }
  return null;
}

function readDate(kind, m, k, today) {
  if (kind === "ymd") return validDate(+m[1], +m[2], +m[3]);
  if (kind === "md") {
    // 한 달 넘게 지난 날이면 내년으로 본다 (12월에 쓴 "1/5")
    const r = validDate(k.y, +m[1], +m[2]);
    if (r && r.date < addDays(today, -30)) return validDate(k.y + 1, +m[1], +m[2]);
    return r;
  }
  if (kind === "day") {
    const day = +m[1];
    if (day < 1 || day > 31) return null;
    return day >= k.d ? validDate(k.y, k.m, day) : validDate(k.y, k.m + 1, day);
  }
  if (kind === "rel") {
    const n = REL_DAYS[m[1]];
    return { date: addDays(today, n), past: n < 0 };
  }
  if (kind === "later") return { date: addDays(today, +m[1]), past: false };
  if (kind === "wd") {
    const target = WEEKDAY[m[2]];
    if (!m[1]) {
      return { date: addDays(today, (target - k.wd + 7) % 7), past: false }; // 오늘을 포함해 가장 가까운 그 요일
    }
    const offset = WEEK_OFFSET[m[1]];
    const monday = addDays(today, -((k.wd + 6) % 7));
    const date = addDays(monday, offset * 7 + ((target + 6) % 7));
    return { date, past: offset < 0 };
  }
  return null;
}

function validDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = ymd(y, mo, d);
  return date.endsWith(`-${pad(d)}`) ? { date, past: false } : null; // 2월 30일 같은 날 거르기
}

function findTime(text) {
  let best = null;
  for (const m of text.matchAll(HOUR_RANGE)) {
    best = {
      start: { period: m[1], h: +m[2], min: 0 },
      end: { period: undefined, h: +m[3], min: 0 },
      spans: [[m.index, m.index + m[0].length]],
    };
    break;
  }
  for (const rule of TIME_RULES) {
    for (const m of text.matchAll(rule)) {
      if (best && best.spans[0][0] <= m.index) break;
      const t = readTime(m);
      if (!t) continue;
      const startSpan = [m.index, m.index + m[0].length];
      best = { start: t, end: null, spans: [startSpan] };
      // 범위: "2시부터 4시까지", "14:00~16:00"
      const rest = text.slice(startSpan[1]);
      const glue = rest.match(RANGE_GLUE);
      if (glue) {
        const after = startSpan[1] + glue[0].length;
        for (const r2 of TIME_RULES) {
          const m2 = new RegExp(r2.source, "y");
          m2.lastIndex = after;
          const hit = m2.exec(text);
          const t2 = hit && readTime(hit);
          if (t2) {
            best.end = t2;
            let endAt = after + hit[0].length;
            if (text.slice(endAt).startsWith("까지")) endAt += 2;
            best.spans = [[startSpan[0], endAt]];
            break;
          }
        }
      }
      break;
    }
  }
  return best;
}

function readTime(m) {
  const period = m[1];
  if (m[2] === "정오") return { period: undefined, h: 12, min: 0, fixed: true };
  if (m[2] === "자정") return { period: "자정", h: 0, min: 0, fixed: true };
  const h = KO_HOUR[m[2]] ?? Number(m[2]);
  let min = 0;
  if (m[3] === "반") min = 30;
  else if (m[3]) min = Number(m[3].replace(/\D/g, ""));
  if (!(h >= 0 && h <= 24 && min >= 0 && min < 60)) return null;
  // "06:30", "10:30"처럼 두 자리 시는 24시간제로 본다. "6:30"은 짐작한다.
  return { period, h, min, fixed: m[0].includes(":") && /\d{2}:/.test(m[0]) };
}

/**
 * 시·분 → 0시부터 분. 오전·오후가 없으면 짐작한다(guessed):
 * 1~8시는 오후, 9~11시는 오전, 12시는 낮 12시. 오늘인데 짐작한 시각이 지났고 반대쪽이 남았으면 반대쪽.
 */
function to24({ period, h, min, fixed }, nowMinIfToday) {
  let hh = h;
  let addDays = 0;
  let guessed = false;
  if (period === "자정") return { min: 0, addDays: 1, guessed: false };
  if (h === 0 || h >= 13) hh = h % 24;
  else if (!period && fixed) hh = h;
  else if (period === "오전" || period === "아침" || period === "새벽") hh = h === 12 ? 0 : h;
  else if (period === "오후") hh = h === 12 ? 12 : h + 12;
  else if (period === "낮") hh = h === 12 || h >= 7 ? h : h + 12;
  else if (period === "점심") hh = h >= 10 ? h : h + 12;
  else if (period === "저녁") {
    if (h === 12) [hh, addDays] = [0, 1];
    else hh = h + 12;
  } else if (period === "밤") {
    if (h === 12 || h <= 4) [hh, addDays] = [h % 12, 1]; // 밤 12시·밤 1시 = 다음 날 새벽
    else hh = h + 12;
  } else {
    guessed = true;
    hh = h === 12 ? 12 : h <= 8 ? h + 12 : h;
    if (nowMinIfToday != null && h !== 12) {
      const other = hh >= 12 ? hh - 12 : hh + 12;
      if (hh * 60 + min <= nowMinIfToday && other * 60 + min > nowMinIfToday) hh = other;
    }
  }
  return { min: hh * 60 + min, addDays, guessed };
}

// ── AI 없이 이름·장소 짐작 ───────────────────────────────────

const PLACE_RULES = [
  /(\S+(?:\s+(?:앞|뒤|옆|안|입구|\d+층))?)\s*에서(?=\s|$)/, // 학관에서, 자하연 앞에서
  /((?<!\d)\d{2,3}(?:-\d)?\s*동(?:\s*\d{1,4}\s*호)?(?:\s*\d+층)?)/, // 301동, 220동 302호
  /((?<![\d:])\d{2,3}-\d{3,4}(?:호)?)(?![\d:]|\s*시)/, // 301-118
  /((?:학관|학생회관|중도|중앙도서관|관정도서관|도서관|자하연|버들골|체육관|기숙사|관악사|행정관|아크로|동방|과방|강의실|실험실|카페)(?:\s+(?:앞|뒤|옆|입구|\d+층))?)/,
  /(\S+\s+(?:입구|앞|정문|후문))(?=\s|$)/, // 관악산 입구
  /(\S+역)(?=\s|$)/, // 강남역, 낙성대역
];
const PARTICLE = "(?:에서|에는|에|까지|부터|쯤|경|으로|로)";

/** 이름 = 메모에서 날짜·시각·장소 말을 뺀 나머지 그대로. 남는 게 없으면 장소, 그것도 없으면 '?' */
export function guessTitlePlace(text, when) {
  let rest = cutSpans(text, when.spans);
  let place = null;
  for (const re of PLACE_RULES) {
    const m = rest.match(re);
    if (m) {
      place = m[1].trim();
      rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
      break;
    }
  }
  return { title: tidy(rest) || place || "?", place };
}

/** 읽은 글자 범위를 빈칸으로 바꾼다 (자리는 그대로 둬서 다른 범위가 안 흐트러지게) */
function cutSpans(text, spans) {
  let rest = text;
  for (const [s, e] of [...spans].sort((a, b) => b[0] - a[0])) rest = rest.slice(0, s) + " ".repeat(e - s) + rest.slice(e);
  return rest;
}

function tidy(s) {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(new RegExp(`^(?:${PARTICLE}|[,.:~\\-])(?=\\s|$)\\s*`), "")
    .replace(new RegExp(`(?:^|\\s)${PARTICLE}$`), "")
    .replace(/[\s,.:~\-]+$/, "")
    .trim();
}

// ── 작은 도구들 ──────────────────────────────────────────────

const KST_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_NAMES = "일월화수목금토";
const pad = (n) => String(n).padStart(2, "0");

/** Date → 한국 시각의 년·월·일·시·분·요일(0=일) */
export function kst(date) {
  const t = new Date(date.getTime() + KST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mi: t.getUTCMinutes(), wd: t.getUTCDay() };
}
/** 년·월·일 → "YYYY-MM-DD" (넘치는 날은 다음 달로) */
export function ymd(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(y, m, d + n);
}
/** Date → "2026-11-09T17:02:33+09:00" (schema.sql의 시각 모양) */
export function isoKst(date) {
  const t = new Date(date.getTime() + KST_MS);
  return t.toISOString().slice(0, 19) + "+09:00";
}
/** Date → "2026-11-09 (월) 17:02" (AI에게 지금 시각을 알려 줄 때) */
export function nowLabel(date) {
  const k = kst(date);
  return `${ymd(k.y, k.m, k.d)} (${WEEKDAY_NAMES[k.wd]}) ${pad(k.hh)}:${pad(k.mi)}`;
}
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 그 시각이 아직 안 지났으면 오늘, 지났으면 내일 (한국 날짜) */
function nextDayAt(time, now) {
  const k = kst(now);
  const today = ymd(k.y, k.m, k.d);
  return toMin(time) > k.hh * 60 + k.mi ? today : addDays(today, 1);
}

const clean = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s !== "?" ? s : null;
};
const cleanTime = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(clean(v) ?? "") ? v.trim() : null);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v) ?? "") ? v.trim() : null);
const sameClock = (a, b) => Number(a.slice(0, 2)) % 12 === Number(b.slice(0, 2)) % 12 && a.slice(3) === b.slice(3);

/** 팝업 칸 정리: '?'·빈칸 → null */
function popupFields(o = {}) {
  return {
    title: clean(o.title),
    date: cleanDate(o.date),
    time: cleanTime(o.time),
    end_time: cleanTime(o.end_time),
    place: clean(o.place),
  };
}
const sameFields = (a, b) => ["title", "date", "time", "end_time", "place"].every((key) => a[key] === b[key]);

/** 팝업 칸 → events.start/end. 시각이 없으면 종일 일정: schema.sql대로 start = 그날, end = 다음 날(ICS 방식) */
function toStartEnd(f) {
  if (!f.time) return { start: f.date, end: addDays(f.date, 1) };
  const start = `${f.date}T${f.time}:00+09:00`;
  const end = f.end_time && f.end_time > f.time ? `${f.date}T${f.end_time}:00+09:00` : null;
  return { start, end };
}

function writeLog(env, userId, action, detail) {
  if (!env.DB) return Promise.resolve();
  return env.DB.prepare("INSERT INTO log (user_id, action, detail) VALUES (?, ?, ?)")
    .bind(userId ?? null, action, detail ?? null)
    .run()
    .catch(() => {}); // 기록 실패가 사용자 요청을 막지 않게
}

/** 응답을 보낸 뒤에 마저 할 일 (Cloudflare ctx.waitUntil) */
function background(ctx, promise) {
  if (ctx?.waitUntil) ctx.waitUntil(promise);
}

function json(data, status = 200) {
  return Response.json(data, { status });
}
