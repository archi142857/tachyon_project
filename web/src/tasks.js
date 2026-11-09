// 할 일 표시 도우미. 진짜 순서(여유 적은 순)와 몰린 주 경고는 서버(AI 세션 4_night.js, /api/briefing/rank)가 준다.
// 여기 topThree·dueThisWeek는 예시 모드에서만 쓰는 1단계 규칙(마감 가까운 순, 이번 주 마감 수)이다.
import { addDays } from './time.js';

export const CROWDED = 4; // 한 주에 마감이 이만큼 이상이면 '몰림'

export function topThree(tasks, n = 3) {
  return tasks
    .filter((t) => !t.done)
    .slice()
    .sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity))
    .slice(0, n);
}

// 이번 주(start부터 7일)에 마감인 끝나지 않은 할 일 수
export function dueThisWeek(tasks, start) {
  const from = new Date(start);
  const to = addDays(start, 7);
  return tasks.filter((t) => !t.done && t.due && new Date(t.due) >= from && new Date(t.due) < to).length;
}

// schema.sql: ready 1 = 지금 시작 가능, 0 = 수업·자료 뒤(기본 1).
// 밤 정리가 걸리는 시간(minutes)을 매기기 전에는 기본값일 뿐이라 '지금 가능'을 보이지 않는다.
export function readyLabel(task) {
  if (task.ready === 0) return '수업·자료 뒤';
  if (task.ready === 1 && task.minutes != null) return '지금 가능';
  return null;
}

// 약 2시간 / 약 30분, 모르면 '시간 ?'(앱 프롬프트 규칙: 모르는 칸은 '?')
export function minutesLabel(minutes) {
  if (minutes == null) return '시간 ?';
  if (minutes < 60) return `약 ${minutes}분`;
  const h = Math.round((minutes / 60) * 2) / 2;
  return `약 ${h}시간`;
}

// 여유: slack_days = 마감까지 남는 날(소수, 4_night.js). 0이면 빠듯, 음수면 모자람, null이면 마감 없음.
// 화면에는 내림한 날 수만 보인다(2.3 → '여유 2일').
export function slackLabel(slackDays) {
  if (slackDays == null) return null;
  if (slackDays < 0) return '시간 모자람';
  if (slackDays < 1) return '빠듯';
  return `여유 ${Math.floor(slackDays)}일`;
}
