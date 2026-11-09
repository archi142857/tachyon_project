// 6_feedback.js 시험 (담당: 서버 세션). 사람·글·저장소·토큰은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { reportServerError, scrub, device } from '../6_feedback.js';
import { packDetail } from '../lib/log.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-09T03:00:00Z'); // 한국 11/9(월) 12:00
const GITHUB = { GITHUB_TOKEN: 'test-token-example', GITHUB_REPO: 'example/tachyon-example' };
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const realNow = Date.now;
const realFetch = globalThis.fetch;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** GitHub 가짜: 보낸 요청을 모으고, statuses 순서대로 답한다(다 쓰면 201) */
function mockGithub(statuses = []) {
  const calls = [];
  let next = 1;
  globalThis.fetch = async (url, init = {}) => {
    const status = statuses[calls.length] ?? 201;
    calls.push({ url: String(url), method: init.method, headers: init.headers, payload: JSON.parse(init.body) });
    if (status !== 201) return new Response(JSON.stringify({ message: '예시 실패' }), { status });
    const number = next++;
    return Response.json({ number, html_url: `https://github.com/example/tachyon-example/issues/${number}` }, { status: 201 });
  };
  return calls;
}

async function setup(extra = GITHUB) {
  const env = makeEnv(extra);
  const user = await addTestUser(env, { sub: 'sub-fb', email: 'feedback-user@example.invalid', name: '예시 이름' });
  const cookie = (await makeSessionCookie(env, user.id)).split(';')[0];
  return { env, user, cookie };
}

function call(env, cookie, path, { method = 'POST', body, ua = ANDROID } = {}) {
  const headers = { origin: ORIGIN, 'user-agent': ua };
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, makeCtx());
}
const read = async (res) => ({ status: res.status, data: await res.json() });
const logRows = (env, action) =>
  env.DB.sqlite.prepare('SELECT user_id, detail, at FROM log WHERE action = ? ORDER BY id').all(action).map((r) => ({ ...r, detail: JSON.parse(r.detail) }));
const addLog = (env, userId, action, detail, at) =>
  env.DB.sqlite.prepare('INSERT INTO log (user_id, action, detail, at) VALUES (?, ?, ?, ?)').run(userId, action, typeof detail === 'string' ? detail : JSON.stringify(detail), at);

test('의견 → GitHub 이슈: 제목·라벨·본문, 개인 정보는 지우고, log에도 남김', async () => {
  const { env, user, cookie } = await setup();
  const calls = mockGithub();
  const text = '예시: 저장 버튼이 안 눌려요\n연락은 someone@example.invalid 나 010-1234-5678, 학번 2026-12345';
  const { status, data } = await read(await call(env, cookie, '/api/feedback', { body: { kind: 'bug', text, screen: '오늘' } }));

  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true, issue: 1, url: 'https://github.com/example/tachyon-example/issues/1' });
  assert.equal(calls.length, 1);
  const [c] = calls;
  assert.equal(c.url, 'https://api.github.com/repos/example/tachyon-example/issues');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.authorization, 'Bearer test-token-example');
  assert.equal(c.headers['user-agent'], 'Tachyon-feedback');
  assert.equal(c.payload.title, '[버그] 예시: 저장 버튼이 안 눌려요');
  assert.deepEqual(c.payload.labels, ['의견', '버그']);
  const body = c.payload.body;
  for (const line of ['- 종류: 버그', '- 화면: 오늘', '- 시각: 2026-11-09T12:00:00+09:00', '- 기기: 안드로이드 · Chrome 131', `- 보낸 사람: 사용자 #${user.id}`]) {
    assert.ok(body.includes(line), line);
  }
  assert.ok(body.includes('연락은 [이메일] 나 [전화], 학번 [번호]'));
  for (const secret of ['someone@example.invalid', '010-1234-5678', '2026-12345', 'feedback-user@example.invalid', '예시 이름']) {
    assert.ok(!body.includes(secret) && !c.payload.title.includes(secret), secret);
  }

  const [row] = logRows(env, 'feedback');
  assert.equal(row.user_id, user.id);
  assert.equal(row.at, '2026-11-09T12:00:00+09:00');
  assert.deepEqual(row.detail, { kind: 'bug', screen: '오늘', issue: 1, text: '예시: 저장 버튼이 안 눌려요\n연락은 [이메일] 나 [전화], 학번 [번호]' });
});

test('의견: 로그인·종류·빈 글 확인, POST만', async () => {
  const { env, cookie } = await setup();
  const calls = mockGithub();
  assert.equal((await call(env, null, '/api/feedback', { body: { kind: 'idea', text: '예시' } })).status, 401);
  assert.equal((await call(env, cookie, '/api/feedback', { body: { kind: 'love', text: '예시' } })).status, 400);
  assert.equal((await call(env, cookie, '/api/feedback', { body: { kind: 'pain', text: '   ' } })).status, 400);
  assert.equal((await call(env, cookie, '/api/feedback', { body: 'JSON 아님' })).status, 400);
  assert.equal((await call(env, cookie, '/api/feedback', { method: 'GET' })).status, 405);
  assert.equal((await call(env, cookie, '/api/feedback/nothing', { body: {} })).status, 404);
  assert.equal(calls.length, 0);
  assert.equal(logRows(env, 'feedback').length, 0);
});

test('의견: GitHub 토큰이 아직 없으면 이슈 없이 log에만 남기고 ok', async () => {
  const { env, cookie } = await setup({});
  const calls = mockGithub();
  const { status, data } = await read(await call(env, cookie, '/api/feedback', { body: { kind: 'idea', text: '예시: 다크 모드가 있으면 좋겠어요', screen: '설정' } }));
  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true, issue: null, url: null });
  assert.equal(calls.length, 0);
  assert.equal(logRows(env, 'feedback')[0].detail.issue, null);
});

test('의견: GitHub이 라벨을 거절(422)하면 라벨 없이 한 번 더, 실패(500)해도 의견은 log에', async () => {
  const { env, cookie } = await setup();
  const calls = mockGithub([422, 201, 500]);
  const first = await read(await call(env, cookie, '/api/feedback', { body: { kind: 'pain', text: '예시: 글씨가 작아요' } }));
  assert.equal(first.data.issue, 1);
  assert.deepEqual(calls[0].payload.labels, ['의견', '불편']);
  assert.equal(calls[1].payload.labels, undefined);
  assert.equal(calls[1].payload.title, '[불편] 예시: 글씨가 작아요');

  const second = await read(await call(env, cookie, '/api/feedback', { body: { kind: 'pain', text: '예시: 또 작아요' } }));
  assert.equal(second.status, 200);
  assert.equal(second.data.issue, null);
  assert.deepEqual(logRows(env, 'feedback').map((r) => r.detail.issue), [1, null]);
});

test('의견: 한 사람 하루 20개까지(어제 것은 안 셈, 남의 것도 안 셈)', async () => {
  const { env, user, cookie } = await setup();
  mockGithub();
  const other = await addTestUser(env, { sub: 'sub-other', email: 'other@example.invalid' });
  for (let i = 0; i < 20; i++) addLog(env, user.id, 'feedback', { kind: 'idea' }, '2026-11-08T23:00:00+09:00'); // 어제
  for (let i = 0; i < 20; i++) addLog(env, other.id, 'feedback', { kind: 'idea' }, '2026-11-09T09:00:00+09:00'); // 남
  for (let i = 0; i < 19; i++) addLog(env, user.id, 'feedback', { kind: 'idea' }, '2026-11-09T00:00:00+09:00');
  assert.equal((await call(env, cookie, '/api/feedback', { body: { kind: 'idea', text: '예시 20번째' } })).status, 200);
  const over = await read(await call(env, cookie, '/api/feedback', { body: { kind: 'idea', text: '예시 21번째' } }));
  assert.equal(over.status, 429);
  assert.match(over.data.error, /하루 20개/);
});

test('화면 오류 자동 보고: 로그인 없어도, 같은 오류는 이슈 하나, 이 앱 주소는 경로만 남김', async () => {
  const { env } = await setup();
  const calls = mockGithub();
  const report = (message, line, screen = '주간') =>
    call(env, null, '/api/feedback/error', {
      body: {
        message,
        stack: `TypeError: 예시\n    at render (${ORIGIN}/assets/app-1a2b3c.js:${line}:20)\n    at load (https://cdn.example.invalid/lib.js?key=예시)`,
        screen,
      },
    }).then(read);

  const first = await report("TypeError: Cannot read properties of undefined (reading 'title')", 10);
  assert.deepEqual(first.data, { ok: true, issue: 1, duplicate: false });
  const [c] = calls;
  assert.equal(c.payload.title, "[오류] 화면 주간: TypeError: Cannot read properties of undefined (reading 'title')");
  assert.deepEqual(c.payload.labels, ['오류', '자동']);
  assert.ok(c.payload.body.includes('at render (/assets/app-1a2b3c.js:10:20)'));
  assert.ok(c.payload.body.includes('at load ([주소 cdn.example.invalid])'));
  assert.ok(c.payload.body.includes('- 사용자: 로그인 전'));
  assert.ok(c.payload.body.includes('- 기기: 안드로이드 · Chrome 131'));

  // 줄 번호만 다른 같은 오류 → 새 이슈 없음, log 줄도 더 안 늘어남
  const again = await report("TypeError: Cannot read properties of undefined (reading 'title')", 11);
  assert.deepEqual(again.data, { ok: true, issue: 1, duplicate: true });
  assert.equal(calls.length, 1);
  assert.equal(logRows(env, 'error_report').length, 1);

  // 다른 화면이나 다른 메시지는 새 이슈
  assert.equal((await report("TypeError: Cannot read properties of undefined (reading 'title')", 10, '오늘')).data.issue, 2);
  assert.equal((await report('RangeError: 예시 범위', 10)).data.issue, 3);
  assert.equal((await call(env, null, '/api/feedback/error', { body: { stack: '예시' } })).status, 400);
});

test('오류: GitHub 연결 전에 난 오류는 연결 뒤 처음 다시 날 때 이슈가 된다', async () => {
  const { env } = await setup({});
  const calls = mockGithub();
  const report = () => call(env, null, '/api/feedback/error', { body: { message: 'Error: 예시 고장', screen: '오늘' } }).then(read);

  assert.deepEqual((await report()).data, { ok: true, issue: null, duplicate: false });
  assert.deepEqual((await report()).data, { ok: true, issue: null, duplicate: true });
  assert.equal(logRows(env, 'error_report').length, 1);

  Object.assign(env, GITHUB);
  assert.deepEqual((await report()).data, { ok: true, issue: 1, duplicate: false });
  assert.deepEqual((await report()).data, { ok: true, issue: 1, duplicate: true });
  assert.equal(calls.length, 1);
});

test('오류: 새 오류 이슈는 전체 하루 30개까지', async () => {
  const { env } = await setup();
  const calls = mockGithub();
  for (let i = 0; i < 30; i++) addLog(env, null, 'error_report', { fp: `예시${i}`, where: '화면 예시', issue: i + 100 }, '2026-11-09T08:00:00+09:00');
  addLog(env, null, 'memo_note', '예시: JSON 아닌 기록도 섞여 있다', '2026-11-09T08:00:00+09:00'); // 다른 기능이 남긴 글자 detail
  const { data } = await read(await call(env, null, '/api/feedback/error', { body: { message: 'Error: 예시 31번째' } }));
  assert.deepEqual(data, { ok: true, issue: null, duplicate: false, capped: true });
  assert.equal(calls.length, 0);
});

test('서버 오류(500) → 오류 이슈. 번호는 :id로 묶고, 사용자 응답은 그대로 500', async () => {
  const { env, cookie } = await setup();
  const calls = mockGithub();
  const prepare = env.DB.prepare;
  env.DB.prepare = (sql) => {
    if (/\btasks\b/.test(sql)) throw new Error('D1_ERROR: 예시 고장 (12번 줄)');
    return prepare(sql);
  };
  const ctx = makeCtx();
  const req = (id) =>
    new Request(`${ORIGIN}/api/tasks/${id}`, { method: 'PATCH', headers: { origin: ORIGIN, cookie }, body: JSON.stringify({ done: true }) });

  const res = await worker.fetch(req(12), env, ctx);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: '서버에서 오류가 났다' });
  await ctx.settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, '[오류] 서버 PATCH /api/tasks/:id: Error: D1_ERROR: 예시 고장 (12번 줄)');
  assert.ok(calls[0].payload.body.includes('- 기기: Cloudflare Worker'));
  assert.equal(calls[0].payload.body.split('Error: D1_ERROR').length - 1, 1); // stack 첫 줄(메시지)은 한 번만

  // 다른 번호에서 같은 고장 → 같은 이슈
  await worker.fetch(req(34), env, ctx);
  await ctx.settle();
  assert.equal(calls.length, 1);
});

test('reportServerError: 구독 주소의 서명은 가리고, DB가 고장 나도 던지지 않는다', async () => {
  const { env } = await setup();
  const calls = mockGithub();
  const request = new Request(`${ORIGIN}/api/calendar/7.abcdefabcdef0123456789ab.ics`);
  const result = await reportServerError(env, new TypeError('예시 실패'), { request });
  assert.equal(result.issue, 1);
  assert.equal(calls[0].payload.title, '[오류] 서버 GET /api/calendar/….ics: TypeError: 예시 실패');
  assert.ok(!calls[0].payload.body.includes('abcdefabcdef0123456789ab'));

  const broken = { ...GITHUB, DB: { prepare: () => { throw new Error('예시 DB 없음'); } } };
  assert.deepEqual(await reportServerError(broken, new Error('예시'), { where: 'cron */15 * * * *' }), { issue: null });
});

test('scrub: 개인 정보 모양은 지우고 보통 글은 그대로', () => {
  assert.equal(scrub('메일 kim.example+1@example.ac.kr 로'), '메일 [이메일] 로');
  assert.equal(scrub('전화01012345678요 / 010 1234 5678 / 02-123-4567'), '전화[전화]요 / [전화] / [전화]');
  assert.equal(scrub('학번 2026-12345, 번호 123456789'), '학번 [번호], 번호 [번호]');
  assert.equal(
    scrub('webcal://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics 와 https://example.invalid/a?b=c'),
    '[주소 myetl.snu.ac.kr] 와 [주소 example.invalid]',
  );
  assert.equal(scrub(`${ORIGIN}/assets/a.js:1:2`, 'tachyon.example.invalid'), '/assets/a.js:1:2');
  assert.equal(scrub('토큰 a1b2c3d4e5f6a7b8c9d0e1f2 끝'), '토큰 [토큰] 끝');
  assert.equal(scrub('내일 3시 301동 스터디, convertV4MiniflareOptions 오류'), '내일 3시 301동 스터디, convertV4MiniflareOptions 오류');
  assert.equal(scrub('줄\u0000바꿈\u0007\n다음 줄\t탭'), '줄바꿈\n다음 줄\t탭');
  assert.equal(scrub(null), '');
});

test('device: User-Agent를 짧은 이름으로', () => {
  const ua = (value) => device(new Request(ORIGIN, { headers: { 'user-agent': value } }));
  assert.equal(ua(ANDROID), '안드로이드 · Chrome 131');
  assert.equal(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), '아이폰·아이패드 · Safari 18');
  assert.equal(ua('Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'), '안드로이드 · 삼성 인터넷 26');
  assert.equal(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'), 'Windows · Edge 131');
  assert.equal(ua('curl/8.0'), '? · ?');
});

test('log detail: 길어도 1000자 안의 올바른 JSON', () => {
  const short = packDetail({ kind: 'idea', text: '가'.repeat(5000), n: 3 });
  assert.ok(short.length <= 1000);
  assert.deepEqual(JSON.parse(short), { kind: 'idea', text: '가'.repeat(200), n: 3 });
  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i]));
  const cut = JSON.parse(packDetail(many));
  assert.equal(cut.cut, true);
  assert.equal(cut.keys.length, 20);
});
