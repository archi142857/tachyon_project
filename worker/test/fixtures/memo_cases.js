// 위험 확인 'Haiku 팝업 지연'에 쓰는 메모 10개와 기대값.
// 모두 지어낸 예시다(실제 일정·장소 약속 아님). 테스트(3_memo_popup.test.js)와 지연 측정(worker/check/haiku_latency.js)이 같이 쓴다.
// '지금'은 2026-11-09 (월) 17:00 한국 시각으로 고정해서 센다.

export const NOW = new Date("2026-11-09T17:00:00+09:00");

const no = { kind: "note", is_schedule: false };
const yes = (title, date, time, place, end_time = "?") => ({ kind: "schedule", is_schedule: true, title, date, time, end_time, place });
// 할 일(11-10부터 '할 일로 넣을까요?' 팝업): 마감 날짜·시각, 모르면 '?'
const task = (title, date = "?", time = "?") => ({ kind: "task", is_schedule: false, title, date, time });

export const CASES = [
  { text: "내일 3시 301동 스터디", want: yes("스터디", "2026-11-10", "15:00", "301동") },
  { text: "금요일 저녁 7시 학관에서 동아리 회식", want: yes("동아리 회식", "2026-11-13", "19:00", "학관") },
  { text: "11/13 오전 10시 반 중도 4층 팀플 회의", want: yes("팀플 회의", "2026-11-13", "10:30", "중도 4층") },
  { text: "다음주 화요일 2시 220동 302호 교수님 면담", want: yes("교수님 면담", "2026-11-17", "14:00", "220동 302호") },
  { text: "모레 12시 반에 자하연 앞에서 친구랑 점심", want: yes("친구랑 점심", "2026-11-11", "12:30", "자하연 앞") },
  { text: "토요일 오후 1시 관악산 입구 등산", want: yes("등산", "2026-11-14", "13:00", "관악산 입구") },
  { text: "수요일 18:30 체육관 배드민턴", want: yes("배드민턴", "2026-11-11", "18:30", "체육관") },
  { text: "12월 3일 기말 발표", want: yes("기말 발표", "2026-12-03", "?", "?") },
  { text: "다음주 월요일까지 유기화학 과제 제출", want: task("유기화학 과제 제출", "2026-11-16") }, // 마감 → 할 일 팝업
  { text: "오늘 점심 맛있었다", want: no }, // 지난 일
];
