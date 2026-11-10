// worker/3_memo_popup.js 테스트. 실제 API는 부르지 않는다(가짜 fetch), DB는 schema.sql로 만든 가짜 D1.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { handle, findWhen, mergePopup, suggestEvent, isoKst, nowLabel } from "../3_memo_popup.js";
import { CASES, NOW } from "./fixtures/memo_cases.js";
import { fakeD1, addUser, fakeCtx } from "./helpers/d1.js";

// ── 날짜·시각 읽기 ──

test("위험 확인 문장 10개: 정규식이 날짜·시각을 기대값대로 읽는다", () => {
  for (const c of CASES) {
    const w = findWhen(c.text, NOW);
    assert.ok(w, c.text);
    if (c.want.is_schedule) {
      assert.equal(w.date, c.want.date, c.text);
      assert.equal(w.time ?? "?", c.want.time, c.text);
    }
  }
  assert.equal(findWhen("다음주 월요일까지 유기화학 과제 제출", NOW).date, "2026-11-16");
  assert.equal(findWhen("오늘 점심 맛있었다", NOW).time, null);
});

test("여러 모양의 날짜·시각 (지금 = 11/9 월 17:00)", () => {
  const cases = [
    // [메모, 날짜, 시각, 끝 시각]
    ["담주 수욜 저녁 6시 반 회식", "2026-11-18", "18:30", null],
    ["2026-11-20 14:00 발표", "2026-11-20", "14:00", null],
    ["11월 20일(금) 2시~4시 세미나", "2026-11-20", "14:00", "16:00"],
    ["11.13(금) 7시 동아리", "2026-11-13", "19:00", null],
    ["3-5시 실험", "2026-11-10", "15:00", "17:00"],
    ["7시~9시 알바", "2026-11-09", "19:00", "21:00"],
    ["오후 2시부터 4시까지 봉사", "2026-11-10", "14:00", "16:00"],
    ["세 시 반 커피", "2026-11-10", "15:30", null],
    ["정오에 점심 약속", "2026-11-10", "12:00", null],
    ["밤 12시 마감", "2026-11-10", "00:00", null],
    ["오늘 밤 11시 통화", "2026-11-09", "23:00", null],
    ["새벽 2시 야간 실험", "2026-11-10", "02:00", null],
    ["이따 9시 반에 도서관", "2026-11-09", "21:30", null], // 오늘 9시는 지났으니 저녁
    ["06:30 기상", "2026-11-10", "06:30", null],
    ["3일 뒤 발표", "2026-11-12", null, null],
    ["13일 시험", "2026-11-13", null, null],
    ["1/5 신년회", "2027-01-05", null, null], // 한 달 넘게 지난 날은 내년
    ["이번주 일요일 3시 교회", "2026-11-15", "15:00", null],
    ["다다음주 월요일 10시 면접", "2026-11-23", "10:00", null],
    ["토 2시 영화", "2026-11-14", "14:00", null], // '요일' 없이 요일 한 글자 + 시각
    ["수 18:30 배드민턴", "2026-11-11", "18:30", null],
    ["담주 화 3시 팀플", "2026-11-17", "15:00", null],
    ["다음주 금 오전 10시 면접", "2026-11-20", "10:00", null],
    ["내일모레 4시 회의", "2026-11-11", "16:00", null],
    ["15일 7시 동기 모임", "2026-11-15", "19:00", null],
  ];
  for (const [text, date, time, end] of cases) {
    const w = findWhen(text, NOW);
    assert.ok(w, text);
    assert.deepEqual([w.date, w.time, w.end], [date, time, end], text);
  }
});

test("날짜·시각이 아닌 말은 읽지 않는다", () => {
  for (const text of ["3시간 공부", "3.5시간 걸림", "한시적으로 운영", "한 시점에서 보면", "메일 보낼 것", "저녁에 장보기", "과제 아이디어 정리", "다음 주 수업 자료 읽기", "토익 2시간 공부"]) {
    assert.equal(findWhen(text, NOW), null, text);
  }
});

test("'어제'보다 앞으로 올 날을 먼저 고르고, 지난 날만 있으면 past", () => {
  assert.equal(findWhen("어제 못 간 스터디 내일 3시로", NOW).date, "2026-11-10");
  assert.equal(findWhen("어제 3시 회의", NOW).past, true);
  assert.equal(findWhen("지난주 금요일 7시 회식", NOW).past, true);
});

// ── 팝업 후보 합치기 ──

test("AI 없이(규칙만): 이름·장소를 쓴 말 그대로 뽑고, 시각 없는 메모·마감·지난 일은 팝업 없음", () => {
  for (const c of CASES) {
    const p = mergePopup(c.text, findWhen(c.text, NOW), null);
    if (!c.want.is_schedule || c.want.time === "?") {
      assert.equal(p, null, c.text);
      continue;
    }
    assert.equal(p.by, "rule");
    assert.deepEqual([p.title, p.place, p.date, p.time, p.end_time], [c.want.title, c.want.place, c.want.date, c.want.time, "?"], c.text);
  }
  assert.equal(mergePopup("오늘 4시", findWhen("오늘 4시", NOW), null).title, "?"); // 이름이 없으면 '?'
  const station = mergePopup("금 7시 회식 강남역", findWhen("금 7시 회식 강남역", NOW), null);
  assert.deepEqual([station.title, station.place], ["회식", "강남역"]);
  // 날짜 뒤 요일 꾸밈 "(금)"은 빼지만, '수업'·'토론'의 첫 글자는 요일로 먹지 않는다
  for (const [text, title] of [["11/13 수업 발표 3시", "수업 발표"], ["13일 토론 2시", "토론"], ["11/13(금) 7시 동아리", "동아리"], ["11월 20일 금요일 2시 세미나", "세미나"]]) {
    assert.equal(mergePopup(text, findWhen(text, NOW), null).title, title, text);
  }
});

test("AI 답과 합치기: 일정 아님 → null, 오전·오후 짐작은 AI, 날짜·끝 시각은 코드", () => {
  const w = (t) => findWhen(t, NOW);
  const ai = (title, time, place = "?") => ({ is_schedule: true, title, time, place }); // 11-10부터 답 칸은 4개
  assert.equal(mergePopup("내일 3시 스터디", w("내일 3시 스터디"), { is_schedule: false }, NOW), null);

  // 날짜를 안 쓴 "9시 영화": 규칙은 내일 09:00, AI가 21:00이라 하면 따르고 날짜는 코드가 다시 센다(지금 17:00 → 오늘)
  const movie = mergePopup("9시 영화", w("9시 영화"), ai("영화", "21:00"), NOW);
  assert.deepEqual([movie.date, movie.time, movie.by], ["2026-11-09", "21:00", "ai"]);
  // 끝 시각도 같이 12시간 옮긴다
  const range = mergePopup("9시~11시 영화", w("9시~11시 영화"), ai("영화", "21:00"), NOW);
  assert.deepEqual([range.date, range.time, range.end_time], ["2026-11-09", "21:00", "23:00"]);
  // 오후로 짐작한 "3시"를 AI가 03:00이라 하면 따르되, 날짜를 안 썼으니 다음에 오는 03:00(내일)
  const early = mergePopup("3시 택배", w("3시 택배"), ai("택배", "03:00"), NOW);
  assert.deepEqual([early.date, early.time], ["2026-11-10", "03:00"]);

  // 쓴 날짜·쓴 오후는 AI가 달리 말해도 정규식대로
  const fixed = mergePopup("다음주 화요일 오후 2시 면담", w("다음주 화요일 오후 2시 면담"), ai("면담", "02:00"), NOW);
  assert.deepEqual([fixed.date, fixed.time], ["2026-11-17", "14:00"]);

  // AI가 '?'로 둔 칸은 규칙으로 채우고, 규칙도 모르면 '?'
  const q = mergePopup("내일 3시 301동 스터디", w("내일 3시 301동 스터디"), ai("?", "?"), NOW);
  assert.deepEqual([q.title, q.place, q.time, q.end_time], ["스터디", "301동", "15:00", "?"]);

  // 시각 없는 날짜 메모는 AI가 일정이라 하면 시각 '?'로 팝업
  const exam = mergePopup("12월 3일 기말 발표", w("12월 3일 기말 발표"), ai("기말 발표", "?"), NOW);
  assert.deepEqual([exam.date, exam.time, exam.title], ["2026-12-03", "?", "기말 발표"]);
});

// ── AI 부르기 ──

function aiReply(input) {
  return new Response(
    JSON.stringify({ model: "claude-haiku-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name: "answer", input }], usage: { input_tokens: 500, output_tokens: 40 } }),
    { status: 200 },
  );
}

test("날짜·시각 말이 없으면 AI를 부르지 않는다", async () => {
  let calls = 0;
  const p = await suggestEvent({ ANTHROPIC_API_KEY: "k" }, "과제 아이디어 정리", NOW, { fetch: async () => (calls++, aiReply({})) });
  assert.equal(p, null);
  assert.equal(calls, 0);
});

test("AI에게 지금 시각과 메모를 보내고, 답으로 팝업을 만들고, 사용량을 log에 남긴다", async () => {
  const DB = fakeD1();
  const user = addUser(DB);
  const ctx = fakeCtx();
  let sent;
  const fetch = async (_u, init) => {
    sent = JSON.parse(init.body);
    return aiReply({ is_schedule: true, title: "스터디", time: "15:00", place: "301동" });
  };
  const p = await suggestEvent({ ANTHROPIC_API_KEY: "k", DB }, "내일 3시 301동 스터디", NOW, { ctx, userId: user.id, fetch });
  await ctx.settle();

  assert.equal(sent.messages[0].content, "지금: 2026-11-09 (월) 17:00\n메모: 내일 3시 301동 스터디");
  assert.equal(sent.model, "claude-haiku-5-5");
  assert.deepEqual(p, { title: "스터디", date: "2026-11-10", time: "15:00", end_time: "?", place: "301동", by: "ai" });
  const log = DB.sqlite.prepare("SELECT action, detail FROM log").all();
  assert.equal(log.length, 1);
  assert.equal(log[0].action, "llm");
  assert.equal(JSON.parse(log[0].detail).use, "memo_popup");
  assert.ok(!log[0].detail.includes("스터디"), "메모 글은 log에 안 남긴다");
});

test("AI가 실패하면 규칙만으로 팝업을 만들고 llm_fail을 남긴다", async () => {
  const DB = fakeD1();
  const user = addUser(DB);
  const ctx = fakeCtx();
  const fetch = async () => new Response("overloaded", { status: 529 });
  const p = await suggestEvent({ ANTHROPIC_API_KEY: "k", DB }, "내일 3시 301동 스터디", NOW, { ctx, userId: user.id, fetch });
  await ctx.settle();
  assert.deepEqual([p.by, p.title, p.time], ["rule", "스터디", "15:00"]);
  assert.equal(DB.sqlite.prepare("SELECT action FROM log").get().action, "llm_fail");
});

// ── 주소 (/api/memo*) ──

const call = (env, user, method, path, body, ctx = fakeCtx()) =>
  handle(new Request(`https://x.test${path}`, { method, body: body && JSON.stringify(body) }), env, ctx, user).then(async (r) => ({
    status: r.status,
    body: await r.json(),
    ctx,
  }));

test("로그인 안 하면 401", async () => {
  const r = await call({ DB: fakeD1() }, null, "GET", "/api/memo");
  assert.equal(r.status, 401);
});

test("메모 쓰기 → 목록 → 팝업 저장 → 일정 생김 → 고쳐 저장 → 지우기", async () => {
  const DB = fakeD1();
  const env = { DB }; // 키 없음 → 규칙 팝업 (예시 메모는 날짜·시각을 다 써서 오늘 날짜와 상관없다)
  const user = addUser(DB);

  const added = await call(env, user, "POST", "/api/memo", { text: "2026-11-20 14:00 301동 발표 연습" });
  assert.equal(added.status, 200);
  const { memo, popup } = added.body;
  assert.match(memo.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/);
  assert.deepEqual(popup, { title: "발표 연습", date: "2026-11-20", time: "14:00", end_time: "?", place: "301동", by: "rule" });

  await call(env, user, "POST", "/api/memo", { text: "장보기 목록 정리" });
  const list = await call(env, user, "GET", "/api/memo");
  assert.deepEqual(list.body.memos.map((m) => [m.text, m.event_id, m.task_id]), [["2026-11-20 14:00 301동 발표 연습", null, null], ["장보기 목록 정리", null, null]]);

  // 그대로 저장 → popup_save
  const saved = await call(env, user, "POST", `/api/memo/${memo.id}/save`, { ...popup, suggested: popup });
  await saved.ctx.settle();
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.event, { id: saved.body.event.id, title: "발표 연습", start: "2026-11-20T14:00:00+09:00", end: null, place: "301동", source: "memo" });
  assert.equal(DB.sqlite.prepare("SELECT handled FROM memos WHERE id = ?").get(memo.id).handled, 1);
  assert.equal(DB.sqlite.prepare("SELECT ext_id FROM events").get().ext_id, `memo:${memo.id}`);

  // 고쳐서 다시 저장 → 같은 일정이 바뀜(중복 없음), popup_edit
  const edited = await call(env, user, "POST", `/api/memo/${memo.id}/save`, { ...popup, title: "발표 리허설", end_time: "15:30", suggested: popup });
  await edited.ctx.settle();
  assert.equal(edited.body.event.id, saved.body.event.id);
  assert.equal(edited.body.event.end, "2026-11-20T15:30:00+09:00");
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM events").get().n, 1);
  assert.deepEqual(DB.sqlite.prepare("SELECT action FROM log ORDER BY id").all().map((r) => r.action), ["popup_save", "popup_edit"]);

  // 밤 정리가 이 메모로 할 일을 만들었다면 task_id가 붙는다
  const shopping = list.body.memos[1];
  DB.sqlite.prepare("INSERT INTO tasks (user_id, title, source, ext_id) VALUES (?, '장보기 목록 정리', 'memo', ?)").run(user.id, `memo:${shopping.id}`);
  const list2 = await call(env, user, "GET", "/api/memo?limit=1");
  assert.deepEqual(list2.body.memos.map((m) => m.text), ["장보기 목록 정리"]); // 가장 최근 1개
  assert.ok(list2.body.memos[0].task_id);
  const older = await call(env, user, "GET", `/api/memo?before=${list2.body.memos[0].id}`);
  assert.equal(older.body.memos[0].event_id, saved.body.event.id);

  assert.equal((await call(env, user, "DELETE", `/api/memo/${memo.id}`)).status, 200);
  assert.equal((await call(env, user, "DELETE", `/api/memo/${memo.id}`)).status, 404);
});

test("시각 없이 저장하면 종일 일정(날짜만), 취소는 log만 남기고 메모는 그대로", async () => {
  const DB = fakeD1();
  const env = { DB };
  const user = addUser(DB);
  const { body } = await call(env, user, "POST", "/api/memo", { text: "12월 3일 기말 발표" });
  assert.equal(body.popup, null); // 키 없음 + 시각 없음 → 팝업 없음 (AI가 있으면 시각 '?' 팝업)

  const saved = await call(env, user, "POST", `/api/memo/${body.memo.id}/save`, { title: "기말 발표", date: "2026-12-03", time: "?", end_time: "?", place: "?" });
  assert.deepEqual([saved.body.event.start, saved.body.event.end, saved.body.event.place], ["2026-12-03", "2026-12-04", null]); // 종일 일정 end = 다음 날(schema.sql)

  const other = await call(env, user, "POST", "/api/memo", { text: "내일 3시 스터디" });
  const cancel = await call(env, user, "POST", `/api/memo/${other.body.memo.id}/cancel`);
  await cancel.ctx.settle();
  assert.equal(cancel.status, 200);
  assert.equal(DB.sqlite.prepare("SELECT handled FROM memos WHERE id = ?").get(other.body.memo.id).handled, 0);
  assert.equal(DB.sqlite.prepare("SELECT action FROM log WHERE action = 'popup_cancel'").all().length, 1);
});

test("잘못된 요청과 남의 메모", async () => {
  const DB = fakeD1();
  const env = { DB };
  const me = addUser(DB);
  const other = addUser(DB, { email: "other@example.com", googleSub: "sub-other" });
  assert.equal((await call(env, me, "POST", "/api/memo", { text: "   " })).status, 400);
  assert.equal((await call(env, me, "POST", "/api/memo", { text: "가".repeat(1001) })).status, 400);

  const { body } = await call(env, me, "POST", "/api/memo", { text: "내일 3시 스터디" });
  assert.equal((await call(env, me, "POST", `/api/memo/${body.memo.id}/save`, { title: "스터디", date: "?" })).status, 400);
  assert.equal((await call(env, other, "POST", `/api/memo/${body.memo.id}/save`, { title: "x", date: "2026-11-10" })).status, 404);
  assert.equal((await call(env, other, "POST", `/api/memo/${body.memo.id}/cancel`)).status, 404);
  assert.equal((await call(env, other, "DELETE", `/api/memo/${body.memo.id}`)).status, 404);
  assert.equal((await call(env, me, "GET", "/api/memo/abc")).status, 404);
  assert.equal((await call(env, other, "GET", "/api/memo")).body.memos.length, 0);
});

test("시각 글자 모양", () => {
  assert.equal(isoKst(new Date("2026-11-09T08:02:03Z")), "2026-11-09T17:02:03+09:00");
  assert.equal(nowLabel(new Date("2026-11-09T15:30:00Z")), "2026-11-10 (화) 00:30");
});

// ── 아는 일정으로 채우기 (lib/known.js): AI에게는 일정을 안 보낸다 ──

import { abbreviates, likeness, useKnown } from "../lib/known.js";

// 지어낸 일정: 월·수 09:30 수업, 수요일 시험, 금요일 기말
const weekly = (title, firstDate, n, time, end, place = null) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${firstDate}T00:00:00Z`) + i * 7 * 86400000).toISOString().slice(0, 10);
    return { title, start: `${d}T${time}:00+09:00`, end: `${d}T${end}:00+09:00`, place };
  });
const KNOWN = [
  ...weekly("공학수학 2", "2026-11-02", 6, "09:30", "10:45", "43-1동 201호"), // 월
  ...weekly("공학수학 2", "2026-11-04", 6, "09:30", "10:45", "43-1동 201호"), // 수
  { title: "공학수학 2 중간 2", start: "2026-11-11T09:30:00+09:00", end: "2026-11-11T10:45:00+09:00", place: null },
  { title: "공학수학 2 기말", start: "2026-12-18T18:00:00+09:00", end: null, place: null },
  { title: "공부방 · 공학수학 중간2 · 모의시험", start: "2026-11-10T20:30:00+09:00", end: null, place: null },
].map((e, i) => ({ id: i + 1, ...e }));
const base = (o) => ({ title: "?", date: "2026-11-16", time: "?", end_time: "?", place: "?", by: "ai", ...o });

test("줄임말: 글자를 순서대로 고른 말, 첫 글자는 같아야 한다", () => {
  assert.ok(abbreviates("공수2", "공학수학2"));
  assert.ok(abbreviates("공수", "공학수학2"));
  assert.ok(!abbreviates("수학", "공학수학2")); // 첫 글자가 다름
  assert.ok(!abbreviates("공", "공학수학2")); // 한 글자는 안 봄
  assert.ok(!abbreviates("데이터", "데이트"));
  assert.equal(likeness(["과제"], "공학수학 2"), null);
});

test("시각을 모르면 내 수업의 그 요일 시각·장소로 채운다 (줄임말도)", () => {
  for (const title of ["공학수학 2 휴강", "공수2 휴강", "공수 휴강"]) {
    const p = useKnown(base({ title }), `${title} 16일`, KNOWN, "2026-11-10");
    assert.deepEqual([p.title, p.time, p.end_time, p.place, p.from], [title, "09:30", "10:45", "43-1동 201호", "공학수학 2"], title);
    assert.equal(p.change, undefined);
  }
  // 수업이 없는 요일(화)이면 그대로 '?'
  assert.equal(useKnown(base({ title: "공수 보강", date: "2026-11-17" }), "공수 보강 17일", KNOWN, "2026-11-10").time, "?");
  // 메모에 시각이 있으면 건드리지 않는다
  const own = useKnown(base({ title: "공수 스터디", time: "19:00" }), "16일 7시 공수 스터디", KNOWN, "2026-11-10");
  assert.deepEqual([own.time, own.place, own.from], ["19:00", "?", undefined]);
  // 닮은 이름이 둘이면(1등이 비김) 채우지 않는다
  const two = [...KNOWN, ...weekly("공학수학 1", "2026-11-02", 6, "13:00", "14:15").map((e, i) => ({ id: 100 + i, ...e }))];
  assert.equal(useKnown(base({ title: "공수 휴강" }), "공수 휴강 16일", two, "2026-11-10").time, "?");
  assert.equal(useKnown(base({ title: "공수2 휴강" }), "공수2 휴강 16일", two, "2026-11-10").time, "09:30");
});

test("일정 변경: 옮길 일정을 찾고, 이름에서 '변경' 말을 뺀다", () => {
  const p = useKnown(base({ title: "공학수학 2 중간고사" }), "공학수학 2 중간고사 11월 16일로 변경", KNOWN, "2026-11-10");
  assert.equal(p.change.title, "공학수학 2 중간 2"); // 기말·공부방 일정이 아니라
  assert.deepEqual([p.title, p.time, p.end_time, p.from], ["공학수학 2 중간고사", "09:30", "10:45", "공학수학 2"]);
  // 수업 없는 날로 옮기면 옛 시각 그대로
  const fri = useKnown(base({ title: "공수2 기말 로 변경", date: "2026-12-19" }), "공수2 기말 12월 19일로 변경", KNOWN, "2026-11-10");
  assert.deepEqual([fri.title, fri.change.title, fri.time, fri.end_time], ["공수2 기말", "공학수학 2 기말", "18:00", "?"]);
  // '변경' 말이 없으면 옮기지 않는다 · 지난 일정은 옮길 것이 아니다
  assert.equal(useKnown(base({ title: "공학수학 2 중간고사" }), "공학수학 2 중간고사 11월 16일", KNOWN, "2026-11-10").change, undefined);
  assert.equal(useKnown(base({ title: "공학수학 2 중간고사" }), "공학수학 2 중간고사 16일로 변경", KNOWN, "2026-11-12").change.title, "공학수학 2 기말");
});

test("메모 → 팝업: 내 일정의 시각·장소와 옮길 일정이 담기고, AI에게는 내 일정을 안 보낸다", async () => {
  const DB = fakeD1();
  const user = addUser(DB);
  const add = DB.sqlite.prepare(`INSERT INTO events (user_id, title, start, "end", place, source, ext_id) VALUES (?, ?, ?, ?, ?, 'google', ?) RETURNING id`);
  const ids = KNOWN.map((e, i) => add.get(user.id, e.title, e.start, e.end, e.place, `g${i}`).id);
  const oldId = ids[KNOWN.findIndex((e) => e.title === "공학수학 2 중간 2")];

  let sent;
  const fetch = async (_u, init) => {
    sent = init.body;
    return aiReply({ is_schedule: true, title: "공학수학 2 중간고사", date: "2026-11-16", time: "?", end_time: "?", place: "?" });
  };
  const text = "공학수학 2 중간고사 11월 16일로 변경";
  const popup = await suggestEvent({ ANTHROPIC_API_KEY: "k", DB }, text, new Date("2026-11-10T15:42:00+09:00"), { userId: user.id, fetch });
  assert.ok(!sent.includes("43-1동") && !sent.includes("중간 2"), "내 일정은 AI에게 보내지 않는다");
  assert.deepEqual(popup, {
    title: "공학수학 2 중간고사", date: "2026-11-16", time: "09:30", end_time: "10:45", place: "43-1동 201호", by: "ai",
    from: "공학수학 2", change: { id: oldId, title: "공학수학 2 중간 2", start: "2026-11-11T09:30:00+09:00" },
  });

});
