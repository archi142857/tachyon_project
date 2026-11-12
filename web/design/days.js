// 시안을 볼 지어낸 하루 둘(실제 일정 아님). 모양은 앱 DayRing의 arcs와 같다: { key, from, to(분), kind } + 이름.
export const DAYS = {
  many: {
    label: '수업 많은 날',
    arcs: [
      { key: 'm1', from: 570, to: 645, kind: 'timetable', title: '선형대수' },
      { key: 'm2', from: 660, to: 735, kind: 'timetable', title: '자료구조' },
      { key: 'm3', from: 750, to: 810, kind: 'ics', title: '점심 약속' },
      { key: 'm4', from: 840, to: 1010, kind: 'timetable', title: '물리 실험' },
      { key: 'm5', from: 1080, to: 1170, kind: 'ics', title: '동아리 회의' },
      { key: 'm6', from: 1170, to: 1260, kind: 'slot', title: '보고서 쓰기' },
      { key: 'm7', from: 1290, to: 1330, kind: 'memo', title: '산책' },
    ],
  },
  packed: {
    label: '붙은 일정 많은 날',
    arcs: [
      { key: 'p1', from: 540, to: 615, kind: 'timetable', title: '미적분' },
      { key: 'p2', from: 630, to: 705, kind: 'timetable', title: '일반화학' },
      { key: 'p3', from: 720, to: 795, kind: 'timetable', title: '글쓰기' },
      { key: 'p4', from: 900, to: 960, kind: 'memo', title: '스터디' },
      { key: 'p5', from: 960, to: 1020, kind: 'ics', title: '상담' },
      { key: 'p6', from: 1020, to: 1080, kind: 'ics', title: '장보기' },
      { key: 'p7', from: 1200, to: 1290, kind: 'slot', title: '과제 풀기' },
      { key: 'p8', from: 1290, to: 1350, kind: 'slot', title: '단어 외우기' },
    ],
  },
};
