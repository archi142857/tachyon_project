// worker/llm.js 테스트. 실제 API는 부르지 않고 가짜 fetch로 주고받는 모양만 본다.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { askJson, imageBlock, usageDetail, LlmError, MODELS } from "../llm.js";

const env = { ANTHROPIC_API_KEY: "test-key" }; // 지어낸 값
const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };

function reply(input, extra = {}) {
  return new Response(
    JSON.stringify({
      model: "claude-haiku-5-5",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "answer", input }],
      usage: { input_tokens: 321, output_tokens: 12 },
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("보내는 모양: 모델·헤더·answer 도구 강제, 받은 JSON을 돌려준다", async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return reply({ ok: true });
  };
  const r = await askJson(env, { model: "fast", system: "시스템", content: "안녕", schema, fetch });

  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.headers["x-api-key"], "test-key");
  assert.equal(seen.init.headers["anthropic-version"], "2023-06-01");
  assert.equal(seen.body.model, MODELS.fast);
  assert.equal(seen.body.system, "시스템");
  assert.deepEqual(seen.body.messages, [{ role: "user", content: "안녕" }]);
  assert.deepEqual(seen.body.tool_choice, { type: "tool", name: "answer" });
  assert.deepEqual(seen.body.tools[0].input_schema, schema);
  assert.deepEqual(r.data, { ok: true });
  assert.deepEqual(r.usage, { input: 321, output: 12 });
  assert.ok(r.ms >= 0);
});

test("smart는 Sonnet, wrangler.toml 변수로 모델을 바꿀 수 있다", async () => {
  const models = [];
  const fetch = async (_u, init) => (models.push(JSON.parse(init.body).model), reply({ ok: true }));
  await askJson(env, { model: "smart", system: "", content: "x", schema, fetch });
  await askJson({ ...env, MODEL_FAST: "claude-haiku-test" }, { model: "fast", system: "", content: "x", schema, fetch });
  assert.deepEqual(models, [MODELS.smart, "claude-haiku-test"]);
});

test("키가 없으면 부르지 않고 멈춘다", async () => {
  let called = false;
  await assert.rejects(
    askJson({}, { model: "fast", system: "", content: "x", schema, fetch: async () => ((called = true), reply({})) }),
    /ANTHROPIC_API_KEY/,
  );
  assert.equal(called, false);
});

test("400은 다시 시도하지 않는다", async () => {
  let calls = 0;
  const fetch = async () => (calls++, new Response('{"error":"bad"}', { status: 400 }));
  await assert.rejects(askJson(env, { model: "fast", system: "", content: "x", schema, fetch, retries: 2 }), (e) => {
    assert.ok(e instanceof LlmError);
    assert.equal(e.status, 400);
    assert.equal(e.retryable, false);
    return true;
  });
  assert.equal(calls, 1);
});

test("529(과부하)는 retries만큼 다시 시도한다", async () => {
  let calls = 0;
  const fetch = async () => (++calls === 1 ? new Response("overloaded", { status: 529 }) : reply({ ok: true }));
  const r = await askJson(env, { model: "smart", system: "", content: "x", schema, fetch, retries: 1, retryDelayMs: 5 });
  assert.equal(calls, 2);
  assert.deepEqual(r.data, { ok: true });
});

test("시간 초과는 LlmError로 바뀐다", async () => {
  // Node의 AbortSignal.timeout 타이머는 이벤트 루프를 붙잡지 않아서, 테스트 동안만 타이머 하나로 붙잡아 둔다.
  const fetch = (_u, init) =>
    new Promise((_, reject) => {
      const hold = setTimeout(() => {}, 5000);
      init.signal.addEventListener("abort", () => (clearTimeout(hold), reject(init.signal.reason)));
    });
  await assert.rejects(askJson(env, { model: "fast", system: "", content: "x", schema, fetch, timeoutMs: 30 }), (e) => {
    assert.ok(e instanceof LlmError);
    assert.match(e.message, /시간 초과/);
    return true;
  });
});

test("max_tokens에서 잘린 답이나 도구 없는 답은 오류", async () => {
  const cut = async () => reply({ ok: true }, { stop_reason: "max_tokens" });
  await assert.rejects(askJson(env, { model: "fast", system: "", content: "x", schema, fetch: cut }), /잘렸다/);
  const text = async () => reply(null, { content: [{ type: "text", text: "그냥 글" }] });
  await assert.rejects(askJson(env, { model: "fast", system: "", content: "x", schema, fetch: text }), /answer 도구/);
});

test("imageBlock은 base64로 바꾼다", () => {
  const block = imageBlock(new TextEncoder().encode("hello"), "image/png");
  assert.deepEqual(block, { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } });
  const big = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.equal(imageBlock(big, "image/jpeg").source.data, Buffer.from(big).toString("base64"));
});

test("usageDetail에는 사용량만 들어간다", () => {
  const d = JSON.parse(usageDetail("memo_popup", { model: "m", ms: 812, usage: { input: 300, output: 40 }, data: { title: "비밀" } }));
  assert.deepEqual(d, { use: "memo_popup", model: "m", ms: 812, in: 300, out: 40 });
});
