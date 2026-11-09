// Claude API를 부르는 곳은 이 파일 하나다 (계획: "호출은 llm.js 한 곳").
//
// - 쓰는 곳: 3_memo_popup.js(즉시 팝업, 빠른 모델) · 4_night.js(밤 정리, 똑똑한 모델) · 5_timetable_photo.js(시간표 사진, 똑똑한 모델)
// - 비밀값: ANTHROPIC_API_KEY. Cloudflare 비밀값에만 둔다(`npx wrangler secret put ANTHROPIC_API_KEY`). 코드·저장소·로그에 적지 않는다.
// - 모델: 기본은 아래 MODELS. 바꾸려면 wrangler.toml [vars]에 MODEL_FAST / MODEL_SMART를 둔다.
// - 답 모양: 'answer' 도구 하나를 꼭 쓰게 해서(tool_choice) 정해진 JSON으로만 받는다.
// - 프롬프트 원문은 worker/prompts/에 있다. 이 파일은 보내고 받는 일만 한다.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const MODELS = {
  fast: "claude-haiku-5-5", // 즉시 팝업
  smart: "claude-sonnet-5-5", // 밤 정리 · 시간표 사진
};

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
 * @returns {Promise<{data: object, model: string, ms: number, usage: {input: number, output: number}}>}
 */
export async function askJson(env, req) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new LlmError("ANTHROPIC_API_KEY 비밀값이 없다");

  const model = req.model === "smart" ? env.MODEL_SMART || MODELS.smart : env.MODEL_FAST || MODELS.fast;
  const timeoutMs = req.timeoutMs ?? 20000;
  const body = JSON.stringify({
    model,
    max_tokens: req.maxTokens ?? 512,
    temperature: 0,
    system: req.system,
    messages: [{ role: "user", content: req.content }],
    tools: [{ name: "answer", description: "답을 이 모양으로 낸다.", input_schema: req.schema }],
    tool_choice: { type: "tool", name: "answer" },
  });
  const doFetch = req.fetch ?? fetch;

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const res = await doFetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": API_VERSION },
        body,
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
      const block = (json.content || []).find((b) => b.type === "tool_use" && b.name === "answer");
      if (!block) throw new LlmError("답에 answer 도구가 없다", { status: 200 });
      return {
        data: block.input,
        model: json.model || model,
        ms,
        usage: { input: json.usage?.input_tokens ?? 0, output: json.usage?.output_tokens ?? 0 },
      };
    } catch (err) {
      const e = asLlmError(err, timeoutMs);
      if (attempt >= (req.retries ?? 0) || !e.retryable) throw e;
      await new Promise((r) => setTimeout(r, (req.retryDelayMs ?? 1000) * 2 ** attempt)); // 1초, 2초, 4초 …
    }
  }
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
  return JSON.stringify({ use, model: result.model, ms: result.ms, in: result.usage.input, out: result.usage.output });
}
