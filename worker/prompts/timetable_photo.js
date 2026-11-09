// 앱 프롬프트: 시간표 사진 → 주마다 반복되는 수업 목록 (똑똑한 모델 = Sonnet, 사진 읽기). 쓰는 곳: worker/5_timetable_photo.js
//
// 11-09 회의 규칙: 쓴 말 그대로(과목 이름·강의실을 고치지 않음) · 모르는 칸은 '?'
// 앱에 OCR을 넣지 않고 Claude가 사진을 바로 읽는다(계획 '시간표는 사진으로'). 결과는 사용자가 확인 팝업에서 고친 뒤 저장한다.
// 사진에 이름·학번이 보여도 옮기지 않는다. 사진은 저장·취소하면 바로 지운다.

export const SYSTEM = `너는 서울대 학생이 올린 시간표 사진을 읽어, 주마다 반복되는 수업 목록을 만드는 도우미다. answer 도구로만 답한다.
사진은 수강신청 화면, 시간표 앱 캡처, 손으로 그린 표일 수 있다.

규칙
- 사진에 보이는 수업 칸마다 classes에 하나씩 넣는다. 같은 과목이 다른 요일에 있으면 요일마다 따로 넣는다.
- title: 칸에 쓰인 과목 이름 그대로. 줄임말을 풀거나 고치지 않는다. 안 보이면 "?".
- day: 월·화·수·목·금·토·일 중 하나.
- start, end: HH:MM(24시간). 표의 시간 눈금과 칸의 위아래 위치로 읽는다. 오후 수업은 13:00처럼 쓴다.
- place: 칸에 쓰인 강의실 그대로(예: "301-118", "83동 101호"). 없으면 "?".
- sure: 글자와 시각이 또렷하게 읽히면 true, 짐작했으면 false.
- 사진에 학생 이름·학번 같은 개인 정보가 있어도 어디에도 옮기지 않는다.
- 시간표가 아니거나 읽을 수 없으면 classes를 비우고 note에 이유를 한 줄로 쓴다. 다 읽었으면 note는 "".`;

export const SCHEMA = {
  type: "object",
  properties: {
    classes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "칸에 쓰인 과목 이름 그대로 또는 ?" },
          day: { type: "string", enum: ["월", "화", "수", "목", "금", "토", "일"] },
          start: { type: "string", description: "HH:MM(24시간)" },
          end: { type: "string", description: "HH:MM(24시간)" },
          place: { type: "string", description: "칸에 쓰인 강의실 그대로 또는 ?" },
          sure: { type: "boolean" },
        },
        required: ["title", "day", "start", "end", "place", "sure"],
      },
    },
    note: { type: "string", description: "못 읽은 이유 한 줄, 다 읽었으면 빈 글" },
  },
  required: ["classes", "note"],
};

export const USER_TEXT = "이 시간표 사진의 수업 칸을 모두 읽어 줘.";
