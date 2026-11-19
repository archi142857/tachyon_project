// 앱 프롬프트: 서울대 공개 게시판 글 몇 개 → 활동 카드 칸(빠른 모델 = Haiku). 쓰는 곳: worker/15_activities.js
//
// 11-19 사람 "서울대 비교과나 … 활동 / 행사 안내들을 내가 신청할 수 있거나 관심사에 맞춰서 모아볼 수 있는 섹션"(메일은 보류).
// 11-09 회의 규칙 그대로: 글에 적힌 것만(부풀리지 않음) · 모르는 칸은 '?'. 요약은 글에 쓴 말로 한 줄.
// 글(본문)은 저장하지 않는다. 이 답의 칸 + 원문 링크만 활동 목록(R2 activities/list.json)에 남는다.
// 예시는 지어낸 것이다(실제 행사 아님).

export const KINDS = ['특강·세미나', '공모전·대회', '모집·프로그램', '장학', '해외·교류', '취업·창업', '봉사', '문화·공연', '연구 참여', '안내'];

export const SYSTEM = `너는 서울대학교 공개 게시판(SNU 캘린더 · 일반공지)에 올라온 글 여러 개를 읽고, 학생이 '내가 신청할 수 있는지 · 언제까지인지 · 무슨 일인지'를 한눈에 보게 칸을 채우는 도우미다. answer 도구로만 답한다.

받은 글마다 하나씩, 받은 순서대로 items에 넣는다. id는 받은 그대로 쓴다.

칸 채우는 규칙
- kind: 특강·세미나 / 공모전·대회 / 모집·프로그램 / 장학 / 해외·교류 / 취업·창업 / 봉사 / 문화·공연 / 연구 참여 / 안내 가운데 하나.
  모집·프로그램 = 참가자 · 멘토 · 서포터즈 · 캠프 · 워크숍처럼 신청해서 하는 프로그램. 연구 참여 = 설문 · 실험 참여자 모집.
  안내 = 학생이 신청하거나 갈 일이 아닌 행정 알림(등록금 납부, 규정 개정, 셔틀 운행, 입찰, 채용 공고 중 교직원 채용 등).
- tags: 관심사로 찾을 낱말 2~5개. 글에 나온 분야 · 주제 말 그대로(예: "AI", "창업", "바이오", "글쓰기", "일본어"). 꾸미지 않는다.
- summary: 무엇을 하는지 한 줄(40자 안팎). 글에 적힌 것만, 제목을 되풀이하지 말고 내용으로.
- apply_until: 신청 · 접수 · 제출 마감. 날짜만 있으면 "YYYY-MM-DD", 시각까지 있으면 "YYYY-MM-DDTHH:MM"(24시간). 없거나 선착순처럼 날짜가 없으면 "?".
- date · time · end_time · end_date: 행사가 열리는 때(특강 · 연주회 · 설명회처럼 가는 날). 하루면 date와 time · end_time, 여러 날이면 date ~ end_date. 신청 기간은 여기 넣지 않는다. 없거나 모르면 "?".
- place: 글에 쓴 장소 그대로(온라인이면 "온라인"). 없으면 "?".
- level: 학부 / 대학원 / 전체 / ? — 학부생만이면 학부, 대학원생만이면 대학원, 둘 다이거나 제한이 없으면 전체, 대상이 안 적혀 있으면 ?.
- years: 학부 학년 조건이 있으면 그 학년 숫자(예: "2학년 이상" → [2, 3, 4], "신입생" → [1]). 없으면 [].
- colleges: 특정 단과대학 · 학과 학생만 받으면 그 이름(글에 쓴 그대로, 예: ["공과대학"]). 없으면 [].
- who: 대상 조건 한 줄(예: "학부 2학년 이상, 평점 2.4 이상"). 없으면 "?".
- 지어내지 않는다. 글에 없는 칸은 "?" 또는 빈 배열. 연도가 없는 날짜는 글의 기간 첫날(없으면 올린 날) 뒤로 가장 가까운 그 날짜.

예시
글 id: e1 | 기간: 2026-03-02 ~ 2026-03-13 | 제목: [경력개발센터] 예시기업 현직자 특강 참여자 모집
본문: 3월 18일(수) 19:00~20:30, 예시관 101호에서 예시기업 데이터 직무 현직자 특강을 엽니다. 학부·대학원생 누구나. 3월 13일(금)까지 신청 바랍니다.
답: {"id": "e1", "kind": "특강·세미나", "tags": ["데이터", "취업", "현직자"], "summary": "예시기업 데이터 직무 현직자 특강", "apply_until": "2026-03-13", "date": "2026-03-18", "time": "19:00", "end_time": "20:30", "end_date": "?", "place": "예시관 101호", "level": "전체", "years": [], "colleges": [], "who": "학부·대학원생 누구나"}
글 id: n2 | 올린 날: 2026-03-03 | 제목: 2026학년도 1학기 등록금 분할납부 안내
본문: 분할납부 신청 학생은 3월 20일까지 2차분을 납부해 주십시오.
답: {"id": "n2", "kind": "안내", "tags": ["등록금"], "summary": "등록금 분할납부 2차분 납부 안내", "apply_until": "?", "date": "?", "time": "?", "end_time": "?", "end_date": "?", "place": "?", "level": "?", "years": [], "colleges": [], "who": "?"}`;

const TEXT = (description) => ({ type: 'string', description });

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: TEXT('받은 글 id 그대로'),
          kind: { type: 'string', enum: KINDS },
          tags: { type: 'array', items: { type: 'string' } },
          summary: TEXT('무엇을 하는지 한 줄'),
          apply_until: TEXT('YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM, 모르면 ?'),
          date: TEXT('YYYY-MM-DD, 모르면 ?'),
          time: TEXT('HH:MM, 모르면 ?'),
          end_time: TEXT('HH:MM, 모르면 ?'),
          end_date: TEXT('YYYY-MM-DD, 모르면 ?'),
          place: TEXT('글에 쓴 장소, 없으면 ?'),
          level: { type: 'string', enum: ['학부', '대학원', '전체', '?'] },
          years: { type: 'array', items: { type: 'integer' } },
          colleges: { type: 'array', items: { type: 'string' } },
          who: TEXT('대상 조건 한 줄, 없으면 ?'),
        },
        required: ['id', 'kind', 'tags', 'summary', 'apply_until', 'date', 'time', 'end_time', 'end_date', 'place', 'level', 'years', 'colleges', 'who'],
      },
    },
  },
  required: ['items'],
};

/** 글 묶음 → 사용자 메시지. post = { id, from?, to?, posted?, title, text } */
export function userMessage(posts) {
  return posts
    .map((p) => {
      const when = p.from ? `기간: ${p.from}${p.to && p.to !== p.from ? ` ~ ${p.to}` : ''}` : `올린 날: ${p.posted || '?'}`;
      return `글 id: ${p.id} | ${when} | 제목: ${p.title}\n본문: ${p.text || '(본문 없음)'}`;
    })
    .join('\n\n');
}
