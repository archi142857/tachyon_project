// 앱 프롬프트: 01:30 밤 정리 (똑똑한 모델 = Sonnet). 쓰는 곳: worker/4_night.js
//
// 11-09 회의 규칙: 쓴 말 그대로 제목 · 요청 없으면 쪼개지 않음(메모 하나 = 할 일 하나까지) · 모르는 칸은 '?'
// AI가 하는 일은 두 가지뿐이다: 메모가 할 일인지 가르기, 걸리는 시간·지금 가능 여부 어림.
// 순서(여유 적은 순)·몰린 주·브리핑 카드는 코드가 계산한다(4_night.js).
// 마감 날짜는 코드(정규식)가 메모를 쓴 시각 기준으로 먼저 계산하고, 못 읽은 것만 이 답을 쓴다.
// 예시는 지어낸 것이다(실제 일정·과목 아님).

export const SYSTEM = `너는 서울대 학생이 하루 동안 '나와의 채팅'에 쓴 메모를 밤에 정리하는 도우미다. answer 도구로만 답한다.

할 일 1 — 메모를 할 일 후보로 (memos)
- 받은 메모마다 하나씩, id를 그대로 써서 답한다.
- is_task: 학생이 앞으로 해야 할 일이면 true. 기분·생각·이미 한 일·정해진 시각의 약속(일정)·그냥 기록이면 false.
- title: 메모에 쓴 말 그대로. 마감·날짜를 가리키는 말과 그 조사만 뺀다. 바꿔 쓰거나 꾸미거나 덧붙이지 않는다.
- 메모 하나에서 할 일은 하나까지. 여러 단계로 쪼개지 않는다.
- due: 마감이 있으면 YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM. "내일", "금요일까지" 같은 말은 그 메모를 쓴 시각을 기준으로 센다. 없으면 "?".
- is_task가 false면 minutes는 0, ready는 "now"로 둔다.

할 일 2 — 걸리는 시간 (tasks, 그리고 위에서 새로 만든 할 일)
- minutes: 대학생 한 명이 그 일을 끝내는 데 드는 시간(분)을 15분 단위로 어림한다. 부풀리지 않는다. 짐작할 근거가 없으면 60.
- ready: 지금 바로 시작할 수 있으면 "now", 수업을 듣거나 자료·공지가 나와야 시작할 수 있으면 "after".

예시 (지금: 2026-03-10 (화) 01:30)
정리할 메모:
- 7 · 2026-03-09 (월) 15:20 · 금요일까지 일반화학 실험 보고서
- 8 · 2026-03-09 (월) 21:05 · 오늘 동아리 사람들 좋았음
걸리는 시간이 빈 할 일:
- 31 · 4주차 퀴즈 · 2026-03-13T23:59:00+09:00
답: {"memos": [{"id": 7, "is_task": true, "title": "일반화학 실험 보고서", "due": "2026-03-13", "minutes": 180, "ready": "now"}, {"id": 8, "is_task": false, "title": "오늘 동아리 사람들 좋았음", "due": "?", "minutes": 0, "ready": "now"}], "tasks": [{"id": 31, "minutes": 30, "ready": "after"}]}`;

const READY = { type: "string", enum: ["now", "after"], description: "now = 지금 시작 가능, after = 수업·자료 뒤" };

export const SCHEMA = {
  type: "object",
  properties: {
    memos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          is_task: { type: "boolean" },
          title: { type: "string", description: "메모에 쓴 말 그대로" },
          due: { type: "string", description: "YYYY-MM-DD, YYYY-MM-DDTHH:MM 또는 ?" },
          minutes: { type: "integer", description: "걸리는 시간(분)" },
          ready: READY,
        },
        required: ["id", "is_task", "title", "due", "minutes", "ready"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, minutes: { type: "integer" }, ready: READY },
        required: ["id", "minutes", "ready"],
      },
    },
  },
  required: ["memos", "tasks"],
};

/**
 * 사용자 메시지
 * @param {string} nowLabel "2026-11-10 (화) 01:30"
 * @param {{id: number, written: string, text: string}[]} memos written = 쓴 시각 "2026-11-09 (월) 14:02"
 * @param {{id: number, title: string, due: string|null}[]} tasks
 */
export function userMessage(nowLabel, memos, tasks) {
  const line = (s) => String(s).replace(/\s+/g, " ").trim();
  const m = memos.length ? memos.map((x) => `- ${x.id} · ${x.written} · ${line(x.text)}`).join("\n") : "(없음)";
  const t = tasks.length ? tasks.map((x) => `- ${x.id} · ${line(x.title)} · ${x.due ?? "?"}`).join("\n") : "(없음)";
  return `지금: ${nowLabel}\n\n정리할 메모 (id · 쓴 시각 · 글):\n${m}\n\n걸리는 시간이 빈 할 일 (id · 제목 · 마감):\n${t}`;
}
