// worker/5_timetable_photo.js 테스트. 실제 API는 부르지 않는다(전역 fetch를 잠깐 가짜로), DB는 schema.sql로 만든 가짜 D1,
// R2는 메모리 Map. 사진은 진짜 시간표가 아니라 아무 바이트다. 수업 이름은 지어낸 예시.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { handle, expandWeekly, semesterEnd } from "../5_timetable_photo.js";
import { fakeD1, addUser, fakeCtx } from "./helpers/d1.js";

const CLASSES = [
  { title: "[예시] 유기화학", day: "화", start: "9:30", end: "10:45", place: "301-118", sure: true },
  { title: "[예시] 생명과학실험", day: "목", start: "14:00", end: "17:00", place: "?", sure: false },
];

function fakeR2() {
  const files = new Map();
  return { files, put: async (k, v, o) => void files.set(k, { v, o }), delete: async (k) => void files.delete(k) };
}

/** 전역 fetch를 이 함수 동안만 가짜로 바꾼다 */
async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

function aiReply(input) {
  return new Response(
    JSON.stringify({ model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name: "answer", input }], usage: { input_tokens: 1600, output_tokens: 200 } }),
    { status: 200 },
  );
}

const post = (env, user, path, { body, type = "application/json", headers = {} } = {}, ctx = fakeCtx()) =>
  handle(new Request(`https://x.test${path}`, { method: "POST", body, headers: { "content-type": type, ...headers } }), env, ctx, user).then(
    async (r) => ({ status: r.status, body: await r.json(), ctx }),
  );

test("주마다 펼치기: 요일이 맞는 날마다 한 줄, 장소 '?'는 비움", () => {
  const rows = expandWeekly(
    [
      { title: "유기화학", day: "화", start: "09:30", end: "10:45", place: "301-118" },
      { title: "실험", day: "목", start: "14:00", end: "17:00", place: "?" },
    ],
    "2026-11-09",
    "2026-11-22",
  );
  assert.deepEqual(
    rows.map((r) => [r.title, r.start, r.end, r.place]),
    [
      ["유기화학", "2026-11-10T09:30:00+09:00", "2026-11-10T10:45:00+09:00", "301-118"],
      ["실험", "2026-11-12T14:00:00+09:00", "2026-11-12T17:00:00+09:00", null],
      ["유기화학", "2026-11-17T09:30:00+09:00", "2026-11-17T10:45:00+09:00", "301-118"],
      ["실험", "2026-11-19T14:00:00+09:00", "2026-11-19T17:00:00+09:00", null],
    ],
  );
  assert.equal(rows[0].ext_id, "tt:유기화학|화|09:30|2026-11-10");
});

test("학기 끝 기본값: 종강일(서울대 2026학년도 2학기 12/14, 1학기 6/15)", () => {
  assert.equal(semesterEnd("2026-11-09"), "2026-12-14");
  assert.equal(semesterEnd("2027-03-02"), "2027-06-15");
  assert.equal(semesterEnd("2027-01-04"), "2027-02-15"); // 계절학기는 6주 뒤
});

test("사진 읽기: R2에 두고 Sonnet에게 사진을 보내 수업 칸을 받는다(이상한 칸은 버림)", async () => {
  const DB = fakeD1();
  const PHOTOS = fakeR2();
  const user = addUser(DB);
  const env = { DB, PHOTOS, ANTHROPIC_API_KEY: "k" };
  let sent;
  const fake = async (_u, init) => {
    sent = JSON.parse(init.body);
    return aiReply({
      classes: [
        ...CLASSES,
        { title: "이상한 칸", day: "월", start: "15:00", end: "14:00", place: "?", sure: true },
        { title: "[예시] 요일을 길게", day: "금요일", start: "9:00", end: "10:15", place: "?", sure: true }, // 강제 못 하는 Sonnet이 enum을 어겨도 받음
        { title: "[예시] 영어 요일", day: "(Wed)", start: "13:00", end: "14:15", place: "?", sure: true },
        { title: "두 요일 한 칸", day: "월수", start: "11:00", end: "12:15", place: "?", sure: true }, // 이건 버림
      ],
      note: "",
    });
  };
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const r = await withFetch(fake, () => post(env, user, "/api/timetable", { body: png, type: "image/png" }));
  await r.ctx.settle();

  assert.equal(r.status, 200);
  assert.match(r.body.photo, new RegExp(`^timetable/${user.id}/\\d+-[0-9a-f]{8}\\.png$`));
  assert.ok(PHOTOS.files.has(r.body.photo));
  assert.equal(sent.model, "claude-sonnet-5-5");
  assert.deepEqual(sent.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } });
  assert.deepEqual(r.body.classes, [
    { title: "[예시] 유기화학", day: "화", start: "09:30", end: "10:45", place: "301-118", sure: true },
    { title: "[예시] 생명과학실험", day: "목", start: "14:00", end: "17:00", place: "?", sure: false },
    { title: "[예시] 요일을 길게", day: "금", start: "09:00", end: "10:15", place: "?", sure: true },
    { title: "[예시] 영어 요일", day: "수", start: "13:00", end: "14:15", place: "?", sure: true },
  ]);
  assert.match(r.body.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.body.until, semesterEnd(r.body.from));
  assert.equal(DB.sqlite.prepare("SELECT action FROM log").get().action, "llm");
});

test("사진 읽기를 막는 경우: 사진 아님 415, 5MB 넘음 413, 키 없음 503, AI 실패 502", async () => {
  const DB = fakeD1();
  const user = addUser(DB);
  const env = { DB, ANTHROPIC_API_KEY: "k" };
  assert.equal((await post(env, user, "/api/timetable", { body: "hello", type: "text/plain" })).status, 415);
  assert.equal((await post(env, user, "/api/timetable", { body: new Uint8Array(5 * 1024 * 1024 + 1), type: "image/jpeg" })).status, 413);
  assert.equal((await post({ DB }, user, "/api/timetable", { body: new Uint8Array([1]), type: "image/jpeg" })).status, 503);
  const failed = await withFetch(
    async () => new Response("overloaded", { status: 529 }),
    () => post({ ...env, PHOTOS: fakeR2() }, user, "/api/timetable", { body: new Uint8Array([1]), type: "image/jpeg" }),
  );
  assert.equal(failed.status, 502);
  assert.ok(failed.body.photo, "다시 시도하거나 취소할 수 있게 사진 열쇠를 돌려준다");

  // R2가 잠깐 안 돼도 사진 읽기는 계속한다(photo = null)
  const brokenR2 = { put: async () => Promise.reject(new Error("R2 down")), delete: async () => {} };
  const ok = await withFetch(
    async () => aiReply({ classes: CLASSES, note: "" }),
    () => post({ ...env, PHOTOS: brokenR2 }, user, "/api/timetable", { body: new Uint8Array([1]), type: "image/jpeg" }),
  );
  assert.deepEqual([ok.status, ok.body.photo, ok.body.classes.length], [200, null, 2]);
});

test("저장: 학기 끝까지 펼쳐 넣고 사진을 지운다. 다시 저장하면 그날부터의 시간표를 바꾼다. 그날부터의 eTL 수업은 지운다", async () => {
  const DB = fakeD1();
  const PHOTOS = fakeR2();
  const user = addUser(DB);
  const env = { DB, PHOTOS };
  const photo = `timetable/${user.id}/1-abcdef01.png`;
  PHOTOS.files.set(photo, {});
  DB.sqlite.prepare("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '지난 수업', '2026-11-03T09:30:00+09:00', 'timetable', 'old')").run(user.id);
  // eTL API로 들어온 수업: 저장 날짜부터의 것은 지우고(두 번 보이지 않게), 지난 것과 eTL 일정은 그대로
  const etl = (title, start, ext) => DB.sqlite.prepare("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, ?, ?, 'etl', ?)").run(user.id, title, start, ext);
  etl("[예시] eTL 지난 수업", "2026-11-05T09:30:00+09:00", "api-class-1-20261105-0930");
  etl("[예시] eTL 앞 수업", "2026-11-10T09:30:00+09:00", "api-class-1-20261110-0930");
  etl("[예시] eTL 공지 일정", "2026-11-11T10:00:00+09:00", "api-calendar-7");

  const r = await post(env, user, "/api/timetable/save", { body: JSON.stringify({ photo, classes: CLASSES, from: "2026-11-09", until: "2026-11-22" }) });
  await r.ctx.settle();
  assert.deepEqual(r.body, { saved: 4 });
  assert.equal(PHOTOS.files.size, 0);
  const titles = () => DB.sqlite.prepare("SELECT title, start FROM events ORDER BY start").all().map((e) => `${e.start.slice(0, 10)} ${e.title}`);
  assert.deepEqual(titles(), [
    "2026-11-03 지난 수업",
    "2026-11-05 [예시] eTL 지난 수업",
    "2026-11-10 [예시] 유기화학",
    "2026-11-11 [예시] eTL 공지 일정",
    "2026-11-12 [예시] 생명과학실험",
    "2026-11-17 [예시] 유기화학",
    "2026-11-19 [예시] 생명과학실험",
  ]);

  // 목요일 실험을 금요일로 고쳐 다시 저장 → 11-09부터는 새 시간표만 남는다
  const changed = [CLASSES[0], { ...CLASSES[1], day: "금" }];
  await post(env, user, "/api/timetable/save", { body: JSON.stringify({ classes: changed, from: "2026-11-09", until: "2026-11-22" }) });
  assert.deepEqual(titles(), [
    "2026-11-03 지난 수업",
    "2026-11-05 [예시] eTL 지난 수업",
    "2026-11-10 [예시] 유기화학",
    "2026-11-11 [예시] eTL 공지 일정",
    "2026-11-13 [예시] 생명과학실험",
    "2026-11-17 [예시] 유기화학",
    "2026-11-20 [예시] 생명과학실험",
  ]);
  assert.deepEqual(DB.sqlite.prepare("SELECT action FROM log ORDER BY id").all().map((x) => x.action), ["timetable_save", "timetable_save"]);
});

test("저장 막기와 취소: 빈 목록·거꾸로 된 기간·너무 긴 기간, 남의 사진은 안 지움", async () => {
  const DB = fakeD1();
  const PHOTOS = fakeR2();
  const me = addUser(DB);
  const other = addUser(DB, { email: "other@example.com", googleSub: "sub-other" });
  const env = { DB, PHOTOS };
  const bad = (b) => post(env, me, "/api/timetable/save", { body: JSON.stringify(b) }).then((r) => r.status);
  assert.equal(await bad({ classes: [] }), 400);
  assert.equal(await bad({ classes: CLASSES, from: "2026-11-20", until: "2026-11-09" }), 400);
  assert.equal(await bad({ classes: CLASSES, from: "2026-01-01", until: "2026-12-31" }), 400);

  const mine = `timetable/${me.id}/1-aaaaaaaa.png`;
  const theirs = `timetable/${other.id}/1-bbbbbbbb.png`;
  PHOTOS.files.set(mine, {});
  PHOTOS.files.set(theirs, {});
  await post(env, me, "/api/timetable/cancel", { body: JSON.stringify({ photo: theirs }) });
  const c = await post(env, me, "/api/timetable/cancel", { body: JSON.stringify({ photo: mine }) });
  await c.ctx.settle();
  assert.deepEqual([...PHOTOS.files.keys()], [theirs]);
  assert.equal((await handle(new Request("https://x.test/api/timetable"), env, fakeCtx(), me)).status, 404);
  assert.equal((await handle(new Request("https://x.test/api/timetable", { method: "POST" }), env, fakeCtx(), null)).status, 401);
});
