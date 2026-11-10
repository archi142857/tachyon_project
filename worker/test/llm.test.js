// worker/llm.js 테스트. 실제 API는 부르지 않고 가짜 fetch로 주고받는 모양만 본다.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { askJson, imageBlock, usageDetail, LlmError, MODELS, shapeFor } from "../llm.js";

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
  assert.deepEqual(r.blocks, ["tool_use"]);
  assert.ok(r.ms >= 0);
});

test("Sonnet 5.5는 도구를 강제하지 않는다: tool_choice auto + 앞 생각 끄기(between_tools)", async () => {
  // 공식 API primer 'Forcing tool use': Sonnet 5.5는 tool_choice any·tool이 400. Haiku 5.5는 강제가 되고 강제 호출은 생각을 건너뛴다
  let body;
  const fetch = async (_u, init) => ((body = JSON.parse(init.body)), reply({ ok: true }));
  const r = await askJson(env, { model: "smart", system: "", content: "x", schema, fetch });
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.deepEqual(body.tool_choice, { type: "auto" });
  assert.deepEqual(body.thinking, { type: "between_tools" });
  assert.match(body.tools[0].description, /이 도구/);
  assert.deepEqual(r.data, { ok: true });

  await askJson(env, { model: "fast", system: "", content: "x", schema, fetch });
  assert.deepEqual(body.tool_choice, { type: "tool", name: "answer" });
  assert.equal("thinking" in body, false);
  assert.equal(body.tools[0].description, "답을 이 모양으로 낸다."); // 팝업(잰 그대로)은 한 글자도 안 바뀐다
});

test("shapeFor: 강제를 거절하는 모델 표", () => {
  assert.deepEqual(shapeFor("claude-haiku-5-5"), { forced: true, thinking: null });
  assert.deepEqual(shapeFor("claude-sonnet-5-5"), { forced: false, thinking: { type: "between_tools" } });
  assert.deepEqual(shapeFor("claude-opus-5-5"), { forced: false, thinking: null }); // 생각은 늘 켜짐(끄는 칸 없음)
  assert.equal(shapeFor("claude-fable-5-1").forced, false);
  assert.equal(shapeFor("claude-mythos-5-2").forced, false);
});

test("모르는 모델이 400으로 tool_choice를 탓하면 auto로 바로 한 번 더(다시 시도 횟수와 따로)", async () => {
  const sent = [];
  const fetch = async (_u, init) => {
    const b = JSON.parse(init.body);
    sent.push(b.tool_choice.type);
    return b.tool_choice.type === "tool"
      ? new Response('{"type":"error","error":{"type":"invalid_request_error","message":"tool_choice forced is not supported for this model"}}', { status: 400 })
      : reply({ ok: true });
  };
  const r = await askJson({ ...env, MODEL_SMART: "claude-new-model" }, { model: "smart", system: "", content: "x", schema, fetch });
  assert.deepEqual(sent, ["tool", "auto"]);
  assert.deepEqual(r.data, { ok: true });
});

test("400이 thinking을 탓하면 thinking 칸을 빼고 한 번 더, 그래도 400이면 멈춘다", async () => {
  const sent = [];
  const fetch = async (_u, init) => {
    const b = JSON.parse(init.body);
    sent.push(b.thinking?.type ?? "none");
    return b.thinking ? new Response('{"error":{"message":"thinking.type: between_tools is not supported"}}', { status: 400 }) : reply({ ok: true });
  };
  const r = await askJson(env, { model: "smart", system: "", content: "x", schema, fetch, retries: 2 });
  assert.deepEqual(sent, ["between_tools", "none"]);
  assert.deepEqual(r.data, { ok: true });

  let calls = 0;
  const always = async () => (calls++, new Response('{"error":{"message":"thinking is broken"}}', { status: 400 }));
  await assert.rejects(askJson(env, { model: "smart", system: "", content: "x", schema, fetch: always, retries: 2 }), (e) => e.status === 400);
  assert.equal(calls, 2); // 칸을 바꿔 한 번 더 보낸 뒤에는 다른 400처럼 멈춘다
});

test("강제하지 않은 답: 도구 없이 글 속 JSON이 오면 읽고, 아무것도 없으면 다시 시도한다", async () => {
  const text = async () => reply(null, { content: [{ type: "text", text: '정리했어요.\n{"ok": true}' }], stop_reason: "end_turn" });
  const r = await askJson(env, { model: "smart", system: "", content: "x", schema, fetch: text });
  assert.deepEqual(r.data, { ok: true });
  assert.deepEqual(r.blocks, ["text"]);

  let calls = 0;
  const empty = async () => (++calls === 1 ? reply(null, { content: [{ type: "text", text: "모르겠어요" }], stop_reason: "end_turn" }) : reply({ ok: false }));
  const again = await askJson(env, { model: "smart", system: "", content: "x", schema, fetch: empty, retries: 1, retryDelayMs: 5 });
  assert.equal(calls, 2);
  assert.deepEqual(again.data, { ok: false });

  // 글 앞에 짧은 말이 있고 도구를 부른 답은 도구 쪽을 쓴다
  const both = async () => reply(null, { content: [{ type: "text", text: "{}" }, { type: "tool_use", id: "t", name: "answer", input: { ok: true } }] });
  assert.deepEqual((await askJson(env, { model: "smart", system: "", content: "x", schema, fetch: both })).data, { ok: true });
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

test("usageDetail에는 사용량과 답 조각 종류만 들어간다", () => {
  const d = JSON.parse(usageDetail("memo_popup", { model: "m", ms: 812, usage: { input: 300, output: 40 }, data: { title: "비밀" } }));
  assert.deepEqual(d, { use: "memo_popup", model: "m", ms: 812, in: 300, out: 40 });
  const withBlocks = JSON.parse(usageDetail("memo_popup", { model: "m", ms: 9, usage: { input: 1, output: 2 }, blocks: ["thinking", "tool_use"], data: {} }));
  assert.equal(withBlocks.blocks, "thinking,tool_use");
});

test("temperature는 보내지 않는다(5.5 모델이 400으로 거절)", async () => {
  let body;
  const fetch = async (_u, init) => {
    body = JSON.parse(init.body);
    return reply({ ok: true });
  };
  await askJson(env, { model: "fast", system: "", content: "x", schema, fetch });
  assert.equal("temperature" in body, false);
});

// 크레딧 부족 답 (Anthropic이 실제로 주는 모양)
function lowCredit() {
  const error = { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." };
  return new Response(JSON.stringify({ type: "error", error }), { status: 400 });
}

test("키 둘: 한 키가 크레딧 부족이면 다른 키로 한 번 더 부른다", async () => {
  const two = { ANTHROPIC_API_KEY: "key-a", ANTHROPIC_API_KEY_2: "key-b" };
  // 시작 키는 무작위라 여러 번 돌려 본다
  for (let i = 0; i < 8; i++) {
    const used = [];
    const fetch = async (_u, init) => {
      const key = init.headers["x-api-key"];
      used.push(key);
      return key === "key-a" ? lowCredit() : reply({ ok: true });
    };
    const r = await askJson(two, { model: "fast", system: "", content: "x", schema, fetch });
    assert.deepEqual(r.data, { ok: true });
    assert.equal(used.at(-1), "key-b");
    assert.ok(used.length <= 2);
  }
});

test("키 둘이 다 크레딧 부족이면 두 번만 부르고 멈춘다", async () => {
  const two = { ANTHROPIC_API_KEY: "key-a", ANTHROPIC_API_KEY_2: "key-b" };
  let calls = 0;
  const fetch = async () => {
    calls++;
    return lowCredit();
  };
  await assert.rejects(askJson(two, { model: "fast", system: "", content: "x", schema, fetch }), /credit balance/);
  assert.equal(calls, 2);
});

test("키가 하나면 크레딧 부족에서 바로 멈춘다(다른 400처럼)", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return lowCredit();
  };
  await assert.rejects(askJson(env, { model: "fast", system: "", content: "x", schema, fetch, retries: 2 }), /credit balance/);
  assert.equal(calls, 1);
});
