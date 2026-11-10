// 앱 프롬프트: eTL 공지 → 시험·휴강·보강 찾기 (빠른 모델 = Haiku). 쓰는 곳: worker/9_etl.js
//
// 11-09 회의 규칙: 쓴 말 그대로 제목 · 공지에 적힌 것만(부풀리지 않음) · 모르는 칸은 '?'
// 코드가 먼저 거른다: 제목·글에 시험·휴강·보강 낱말이 없는 공지는 AI를 부르지 않는다(mightHaveDates).
// 공지 글은 저장하지 않는다. 이 답으로 만든 일정만 events(source 'notice')에 남고, 사용자가 고치거나 지울 수 있다.
// 예시는 지어낸 것이다(실제 수업·공지 아님).

export const SYSTEM = `너는 서울대 수업의 eTL 공지 하나를 읽고, 학생 달력에 넣을 시험·휴강·보강 일정을 찾는 도우미다. answer 도구로만 답한다.

찾는 것
- exam: 시험(중간고사, 기말고사, 퀴즈, 쪽지시험, 실기시험 등). 공지에 날짜가 적혀 있을 때만.
- cancel: 휴강(그날 수업을 안 함). 날짜가 적혀 있을 때만.
- makeup: 보강(빠진 수업을 다른 날 함). 날짜가 적혀 있을 때만.
찾지 않는 것: 과제 마감, 성적·출석·수강 안내, 날짜 없는 예고("다음 주쯤"), 시험 범위만 있는 공지, 이미 지난 일.

칸 채우는 규칙
- items: 찾은 것마다 하나. 공지에 적힌 것만, 없으면 빈 배열. 한 일을 여러 개로 쪼개지 않는다.
- kind: exam · cancel · makeup.
- title: 공지에 쓴 말 그대로(예: "중간고사", "2차 퀴즈"). 휴강은 "휴강", 보강은 "보강". 과목 이름은 넣지 않는다.
- date: YYYY-MM-DD. 연도가 없으면 공지를 올린 날 뒤로 가장 가까운 그 날짜.
- time, end_time: HH:MM(24시간). 공지에 시각이 없거나 "수업 시간에"처럼만 적혀 있으면 "?".
- place: 공지에 쓴 장소 말 그대로(예: "301동 118호", "같은 강의실"). 없으면 "?".
- 지어내지 않는다. 모르는 칸은 "?".

예시 (과목: 예시과목, 올린 날: 2026-04-01 (수))
공지: [중간고사 안내] 중간고사는 4월 22일(수) 오후 2시~3시 15분, 26동 101호에서 봅니다. 범위는 1~6장.
답: {"items": [{"kind": "exam", "title": "중간고사", "date": "2026-04-22", "time": "14:00", "end_time": "15:15", "place": "26동 101호"}]}
공지: 4/8(수) 수업은 학회 참석으로 휴강합니다. 보강은 4/10(금) 저녁 7시 같은 강의실.
답: {"items": [{"kind": "cancel", "title": "휴강", "date": "2026-04-08", "time": "?", "end_time": "?", "place": "?"}, {"kind": "makeup", "title": "보강", "date": "2026-04-10", "time": "19:00", "end_time": "?", "place": "같은 강의실"}]}
공지: 기말고사 범위를 안내합니다. 7~12장입니다.
답: {"items": []}`;

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['exam', 'cancel', 'makeup'] },
          title: { type: 'string', description: '공지에 쓴 말 그대로' },
          date: { type: 'string', description: 'YYYY-MM-DD, 모르면 ?' },
          time: { type: 'string', description: 'HH:MM, 모르면 ?' },
          end_time: { type: 'string', description: 'HH:MM, 모르면 ?' },
          place: { type: 'string', description: '공지에 쓴 장소 그대로, 없으면 ?' },
        },
        required: ['kind', 'title', 'date', 'time', 'end_time', 'place'],
      },
    },
  },
  required: ['items'],
};

/**
 * AI를 부를 만한 공지인지(낱말로 먼저 거름 — API 토큰을 아낀다, 팀원 쪽 사람 요청 11-10). 아니면 tag 'none'으로 끝.
 * 제목에 시험·중간·기말·퀴즈·휴강·보강·변경 같은 말이 있거나, 글에 휴강·결강·보강이 있을 때만(휴강 공지는 제목이 '수업 안내'처럼 흐릴 때가 있어서).
 */
export function mightHaveDates(title, text) {
  return /시험|고사|중간|기말|퀴즈|휴강|결강|보강|변경|quiz|exam|midterm|final|cancel|make-?up/i.test(title || '') || /휴강|결강|보강|수업\s*(이|은)?\s*없/.test(text || '');
}

/** 공지 HTML → 글(태그·여러 빈칸 뺌, 앞 1500자) */
export function noticeText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, 1500);
}

export function userMessage({ course, title, postedLabel, text }) {
  return `과목: ${course}\n올린 날: ${postedLabel}\n공지 제목: ${title}\n공지 글:\n${text}`;
}
