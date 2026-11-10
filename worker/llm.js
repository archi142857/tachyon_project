// Claude API를 부르는 곳은 이 파일 하나다 (계획: "호출은 llm.js 한 곳").
//
// - 쓰는 곳: 3_memo_popup.js(즉시 팝업, 빠른 모델) · 4_night.js(밤 정리, 똑똑한 모델) · 5_timetable_photo.js(시간표 사진, 똑똑한 모델)
// - 비밀값: ANTHROPIC_API_KEY. Cloudflare 비밀값에만 둔다(`npx wrangler secret put ANTHROPIC_API_KEY`). 코드·저장소·로그에 적지 않는다.
//   선택: ANTHROPIC_API_KEY_2(다른 팀원의 구독 월 API 크레딧 조직 키). 있으면 두 키를 번갈아 쓰고, 한 키가 크레딧 부족·키 오류면 다른 키로 한 번 더 부른다(소통판 11-10 01:30).
// - temperature는 보내지 않는다: 5.5 모델은 `temperature` is deprecated(400)로 거절한다(11-10 배포본에서 팝업 AI가 모두 실패했던 원인).
// - 모델: 기본은 아래 MODELS. 바꾸려면 wrangler.toml [vars]에 MODEL_FAST / MODEL_SMART를 둔다.
// - 답 모양: 'answer' 도구 하나로 정해진 JSON만 받는다. 모델마다 보내는 법이 다르다(공식 API primer 'Forcing tool use'·'Thinking', 11-10 확인).
//   · Haiku 5.5: tool_choice로 그 도구를 강제한다. 강제 호출은 생각(thinking)을 건너뛴다(배포본 log blocks = tool_use뿐, 출력 약 157토큰).
//   · Sonnet 5.5: 강제(tool_choice any·tool)를 400으로 거절한다. → tool_choice auto + 앞 생각 끄기(thinking between_tools —
//     Sonnet 5.5는 생각이 기본으로 켜져 있고 disabled는 400) + 프롬프트의 'answer 도구로만 답한다'. 도구 없이 글로 JSON을 쓰면 그 JSON을 읽는다.
//   · 다른 모델로 바꿨는데 400이 tool_choice나 thinking을 탓하면 그 칸만 바꿔 바로 한 번 더 보낸다.
// - 프롬프트 원문은 worker/prompts/에 있다. 이 파일은 보내고 받는 일만 한다.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const MODELS = {
  fast: "claude-haiku-5-5", // 즉시 팝업
  smart: "claude-sonnet-5-5", // 밤 정리 · 시간표 사진
};

// 도구 강제(tool_choice any·tool)를 400으로 거절하는 모델 (공식 문서: Fable 5.1·5.2, Mythos 5.1·5.2, Opus 5.5, Sonnet 5.5)
const NO_FORCED_TOOL = /^claude-(?:opus-5-5|sonnet-5-5|fable-5|mythos-5)/;
// 생각이 기본으로 켜져 있고 disabled가 400이라, between_tools로 앞 생각만 끄는 모델 (같은 문서)
const BETWEEN_TOOLS = /^claude-sonnet-5-5/;

/** 모델별로 보내는 모양: 도구를 강제할지(forced), thinking 칸에 무엇을 보낼지(null = 안 보냄) */
export function shapeFor(model) {
  const forced = !NO_FORCED_TOOL.test(model);
  return { forced, thinking: !forced && BETWEEN_TOOLS.test(model) ? { type: "between_tools" } : null };
}

export class LlmError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "LlmError";
    this.status = status; // HTTP 상태 (0 = 연결 실패·시간 초과)
    this.retryable = retryable; // 다시 시도해 볼 만한가
  }
}

/**
 * Claude에게 묻고, schema 모양의 JSON 하나를 받는다.
 *
 * @param {object} env Worker 환경. ANTHROPIC_API_KEY(비밀값), 선택: MODEL_FAST · MODEL_SMART
 * @param {object} req
 * @param {"fast"|"smart"} req.model 빠른 모델(Haiku) 또는 똑똑한 모델(Sonnet)
 * @param {string} req.system 시스템 프롬프트 (worker/prompts/의 원문)
 * @param {string|Array} req.content 사용자 메시지. 사진은 [imageBlock(...), { type: "text", text }]
 * @param {object} req.schema 답 JSON 스키마
 * @param {number} [req.maxTokens=512] 답 길이 상한
 * @param {number} [req.timeoutMs=20000] 이 시간 안에 답이 없으면 끊는다
 * @param {number} [req.retries=0] 429·5xx·시간 초과·연결 실패일 때 다시 시도할 횟수
 * @param {Function} [req.fetch] 테스트용 (기본: 전역 fetch)
 * @returns {Promise<{data: object, model: string, ms: number, usage: {input: number, output: number}, blocks: string[]}>}
 */
export async function askJson(env, req) {
  const keys = [env.ANTHROPIC_API_KEY, env.ANTHROPIC_API_KEY_2].filter(Boolean);
  if (!keys.length) throw new LlmError("ANTHROPIC_API_KEY 비밀값이 없다");
  let k = Math.floor(Math.random() * keys.length); // 키가 둘이면 번갈아(각자 개인 용도로 쓸 크레딧이 반씩 남게)
  let switched = false;

  const model = req.model === "smart" ? env.MODEL_SMART || MODELS.smart : env.MODEL_FAST || MODELS.fast;
  const timeoutMs = req.timeoutMs ?? 20000;
  let shape = shapeFor(model);
  let reshaped = 0;
  const doFetch = req.fetch ?? fetch;

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const res = await doFetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": keys[k], "anthropic-version": API_VERSION },
        body: bodyOf(model, req, shape),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        throw new LlmError(`Claude API ${res.status}: ${detail.slice(0, 200)}`, { status: res.status, retryable });
      }
      const json = await res.json();
      const ms = Date.now() - started;
      if (json.stop_reason === "max_tokens") throw new LlmError("답이 max_tokens에서 잘렸다", { status: 200 });
      return {
        data: answerOf(json.content || [], shape.forced),
        model: json.model || model,
        ms,
        usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 },
        // 답 조각 종류(보통 ["tool_use"]). 11-10 실측 출력이 답 JSON(약 60토큰)보다 많은 160토큰이라, 무엇이 더 나오는지 log로 본다
        blocks: (json.content || []).map((b) => b.type),
      };
    } catch (err) {
      const e = asLlmError(err, timeoutMs);
      const next = reshaped < 2 ? reshape(shape, e) : null;
      if (next) {
        shape = next; // 거절한 칸만 바꿔 바로 한 번 더 (다시 시도 횟수에는 세지 않는다)
        reshaped++;
        attempt--;
        continue;
      }
      if (keys.length > 1 && !switched && keyProblem(e)) {
        k = 1 - k; // 다른 키로 바로 한 번 더 (다시 시도 횟수에는 세지 않는다)
        switched = true;
        attempt--;
        continue;
      }
      if (attempt >= (req.retries ?? 0) || !e.retryable) throw e;
      await new Promise((r) => setTimeout(r, (req.retryDelayMs ?? 1000) * 2 ** attempt)); // 1초, 2초, 4초 …
    }
  }
}

/** 보낼 본문. 강제하지 않을 때는 도구 설명에 '글로 쓰지 말고 이 도구로'를 더한다 */
function bodyOf(model, req, shape) {
  return JSON.stringify({
    model,
    max_tokens: req.maxTokens ?? 512,
    system: req.system,
    messages: [{ role: "user", content: req.content }],
    tools: [
      {
        name: "answer",
        description: shape.forced ? "답을 이 모양으로 낸다." : "답을 이 모양으로 낸다. 글로 쓰지 말고 이 도구를 한 번만 부른다.",
        input_schema: req.schema,
      },
    ],
    tool_choice: shape.forced ? { type: "tool", name: "answer" } : { type: "auto" },
    ...(shape.thinking ? { thinking: shape.thinking } : {}),
  });
}

/** 400이 tool_choice나 thinking을 탓하면 그 칸만 바꾼 모양(아니면 null) — MODEL_FAST·MODEL_SMART를 표에 없는 모델로 바꿨을 때 */
function reshape(shape, e) {
  if (e.status !== 400) return null;
  if (shape.forced && /tool_choice/i.test(e.message)) return { ...shape, forced: false };
  if (shape.thinking && /thinking/i.test(e.message)) return { ...shape, thinking: null };
  return null;
}

/** 답 JSON: answer 도구의 입력. 강제하지 않았는데 도구 없이 글만 왔으면 글 속 JSON 하나를 읽는다(없으면 다시 시도할 만한 오류) */
function answerOf(content, forced) {
  const block = content.find((b) => b.type === "tool_use" && b.name === "answer");
  if (block) return block.input;
  const fromText = forced ? null : jsonInText(content);
  if (fromText) return fromText;
  throw new LlmError("답에 answer 도구가 없다", { status: 200, retryable: !forced });
}

function jsonInText(content) {
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const v = JSON.parse(text.slice(from, to + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** 이 키로는 안 되는 실패: 키 오류(401·403) 또는 크레딧 부족(400 'credit balance is too low') */
function keyProblem(e) {
  return e.status === 401 || e.status === 403 || (e.status === 400 && /credit balance/i.test(e.message));
}

function asLlmError(err, timeoutMs) {
  if (err instanceof LlmError) return err;
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return new LlmError(`Claude API 시간 초과(${timeoutMs}ms)`, { retryable: true });
  }
  return new LlmError(`Claude API 연결 실패: ${err?.message || err}`, { retryable: true });
}

/** 사진 바이트 → Claude 메시지의 image 블록 */
export function imageBlock(bytes, mediaType) {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: toBase64(bytes) } };
}

function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** log 표에 남길 사용량 한 줄 (메모 글·답 내용은 넣지 않는다) */
export function usageDetail(use, result) {
  return JSON.stringify({ use, model: result.model, ms: result.ms, in: result.usage.input, out: result.usage.output, blocks: result.blocks?.join(",") });
}
