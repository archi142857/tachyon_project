// 앱 프롬프트: 공부방 — eTL 강의자료(PDF·사진) 몇 쪽을 빠짐없이 글로 옮기기 (빠른 모델 = Haiku). 쓰는 곳: worker/14_study.js
//
// 11-19 사람 "etl 자료들의 내용을 하나라도 빼먹으면 안돼" → 요약하지 않고 옮겨 적는다
// (11-10 실측, 소통판 11-10 17:53: 파일마다 '정리 글'을 만들게 하면 Haiku가 핵심 19개, Sonnet이 4개를 빠뜨렸다).
// 튜터 일은 사용자의 AI 앱(Claude·ChatGPT …)이 한다. 이 프롬프트는 그 앱이 읽을 글만 만든다. 옮긴 글은 저장하지 않는다.
// 쪽 번호는 PDF 안의 순서(1부터). 슬라이드에 찍힌 번호가 다르면 label에 따로 둔다(11-10 실측: 둘이 섞였다).
// 자료의 오타도 그대로 옮긴다 — 고칠지는 튜터가 사용자와 정한다(11-10 실측: 자료 오타가 문제에 그대로 들어간 적 있음).

export const SYSTEM = `너는 대학 강의자료를 튜터가 읽을 글로 옮겨 적는 사람이다. answer 도구로만 답한다.

옮기는 규칙
- 요청한 쪽만, 쪽마다 하나씩. page는 PDF 안의 순서(첫 쪽 = 1)다. 쪽에 찍힌 번호·슬라이드 번호가 page와 다르면 label에 그 번호를, 같거나 없으면 "".
- 그 쪽의 내용을 하나도 빼지 않는다: 제목, 모든 글머리 줄과 문장, 정의, 정리, 예제와 풀이, 표(마크다운 표), 코드(그대로), 수식(LaTeX, $...$).
- 그림·도표·그래프는 [그림: ...] 한 줄로 무엇을 보여 주는지 적는다(축과 단위, 이름표, 화살표가 잇는 것, 읽히는 숫자).
- 손글씨·필기도 읽히는 만큼 옮기고, 못 읽는 곳은 [읽기 어려움].
- 요약하지 않는다. 설명·의견·풀이를 덧붙이지 않는다. 자료의 오타도 고치지 않고 그대로 옮긴다.
- 빈 쪽은 text를 "[빈 쪽]"으로.
- total_pages: 이 파일의 전체 쪽 수(사진 한 장이면 1).`;

export const SCHEMA = {
  type: 'object',
  properties: {
    total_pages: { type: 'integer', minimum: 1 },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          label: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['page', 'label', 'text'],
      },
    },
  },
  required: ['total_pages', 'pages'],
};

export const userText = (from, to) =>
  from === to ? `${from}쪽을 옮겨 적어 줘.` : `${from}~${to}쪽을 옮겨 적어 줘. 파일이 ${to}쪽보다 짧으면 마지막 쪽까지만.`;
