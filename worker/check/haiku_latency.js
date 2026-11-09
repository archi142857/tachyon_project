// 위험 확인: Haiku 팝업 지연 (계획 0단계)
// 지어낸 메모 10개(worker/test/fixtures/memo_cases.js)를 실제 API로 JSON(일정인지·이름·날짜·시각·장소)으로 바꾸고
// 지연 중앙값을 잰다. 앱과 똑같은 함수(3_memo_popup.js의 askPopupAi)와 프롬프트(worker/prompts/memo_popup.js)를 쓴다.
// 끝 기준: 중앙값이 1초 안이면 그대로, 넘으면 '날짜·시각은 정규식 먼저'(이미 들어 있음) + AI 기다리는 시간(POPUP_AI_MS)을 줄인다.
//
// 실행 (레포 폴더에서, Node 18 이상):
//   node worker/check/haiku_latency.js
// 키는 실행할 때 가려진 입력으로 묻는다(환경 변수 ANTHROPIC_API_KEY가 있으면 그걸 쓴다). 어디에도 저장하지 않는다.
// 비용: 빠른 모델 호출 11번(몸풀기 1 + 10). 몇 원 수준.
// 나오는 글에는 키·개인정보가 없다. 맨 아래 '요약' 줄을 소통판·쪽지에 붙이면 된다.
//
// 실사용이 시작되면 Worker가 부른 실제 지연도 log 표에 쌓인다(ms만, 메모 글은 없음). 다시 볼 때:
//   npx wrangler d1 execute tachyon --remote --command "SELECT json_extract(detail, '$.ms') AS ms FROM log
//     WHERE action = 'llm' AND json_extract(detail, '$.use') = 'memo_popup' ORDER BY ms"

import { createInterface } from "node:readline";
import { askPopupAi, findWhen, mergePopup } from "../3_memo_popup.js";
import { CASES, NOW } from "../test/fixtures/memo_cases.js";

const key = (process.env.ANTHROPIC_API_KEY || (await askHidden("Claude API 키 (붙여 넣어도 화면에 안 보임): "))).trim();
if (!key) {
  console.error("키가 없어서 멈춘다.");
  process.exit(1);
}
const env = { ANTHROPIC_API_KEY: key, MODEL_FAST: process.env.MODEL_FAST };
const timeoutMs = 15000; // 재는 동안은 넉넉히 기다린다

console.log("몸풀기 1번 (연결 준비, 계산에서 뺌) …");
await askPopupAi(env, "내일 9시 예시 일정", NOW, { timeoutMs }).catch((e) => console.log("  몸풀기 실패:", e.message));

const rows = [];
for (const c of CASES) {
  const t0 = performance.now();
  let r = null;
  let error = null;
  try {
    r = await askPopupAi(env, c.text, NOW, { timeoutMs });
  } catch (e) {
    error = e.message;
  }
  const wall = Math.round(performance.now() - t0);
  const popup = r ? mergePopup(c.text, findWhen(c.text, NOW), r.data) : null;
  rows.push({ c, r, wall, error, popup });
}

console.log("\n메모 | 걸린 ms | 토큰 입/출 | AI 답 | 최종 팝업 | 기대값과 같은 칸");
let fieldsOk = 0;
let fieldsAll = 0;
for (const { c, r, wall, error, popup } of rows) {
  if (error) {
    console.log(`${c.text} | ${wall} | - | 실패: ${error}`);
    continue;
  }
  const ai = r.data;
  const marks = [];
  const check = (name, got, want) => {
    fieldsAll++;
    if (got === want) fieldsOk++;
    marks.push(`${name}${got === want ? "○" : `✗(${got})`}`);
  };
  check("일정", ai.is_schedule, c.want.is_schedule);
  if (c.want.is_schedule) {
    check("이름", popup?.title, c.want.title);
    check("날짜", popup?.date, c.want.date);
    check("시각", popup?.time, c.want.time);
    check("장소", popup?.place, c.want.place);
  }
  const shown = popup ? `${popup.title} · ${popup.date} ${popup.time} · ${popup.place}` : "팝업 없음";
  console.log(`${c.text} | ${wall} | ${r.usage.input}/${r.usage.output} | ${JSON.stringify(ai)} | ${shown} | ${marks.join(" ")}`);
}

const times = rows.filter((x) => !x.error).map((x) => x.wall).sort((a, b) => a - b);
if (!times.length) {
  console.log("\n요약: 모든 호출이 실패했다. 위 오류(키·크레딧·모델 이름)를 확인할 것.");
  process.exit(1);
}
const median = times.length % 2 ? times[(times.length - 1) / 2] : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2);
const p90 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.9) - 1)];
const model = rows.find((x) => x.r)?.r.model;
const verdict =
  median <= 1000
    ? "1초 안 → 계획대로 그대로 (AI 팝업, POPUP_AI_MS 기본 2500 유지)"
    : "1초 넘음 → 날짜·시각은 정규식 먼저(이미 들어 있음), POPUP_AI_MS를 1000 안팎으로 줄여 늦은 AI 답은 버림";
console.log(
  `\n요약: ${new Date().toISOString().slice(0, 10)} · ${model} · 성공 ${times.length}/${rows.length} · ` +
    `중앙값 ${median} ms · 최소 ${times[0]} · p90 ${p90} · 최대 ${times.at(-1)} · 맞은 칸 ${fieldsOk}/${fieldsAll} → ${verdict}`,
);

/** 화면에 안 보이게 한 줄 입력받기 (터미널이면 raw 모드로 글자를 받기만 하고 되찍지 않는다) */
function askHidden(question) {
  process.stdout.write(question);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    // 파이프로 들어오면 첫 줄만 읽는다
    return new Promise((resolve) => {
      const rl = createInterface({ input: stdin });
      rl.once("line", (line) => (resolve(line), rl.close()));
      rl.once("close", () => resolve(""));
    });
  }
  return new Promise((resolve) => {
    let typed = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(typed);
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
        else typed += ch;
      }
    };
    stdin.on("data", onData);
  });
}
