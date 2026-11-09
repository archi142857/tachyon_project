// 시험용 ICS 만들기 도우미 (담당: 서버 세션). 일정은 모두 지어낸 예시다.

const SEOUL_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Seoul',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:KST',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** VEVENT 줄 묶음들 → ICS 글 */
export function calendar(...events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//예시//EN', ...SEOUL_TZ, ...events.flat(), 'END:VCALENDAR', ''].join('\r\n');
}

/** 속성 줄들 → VEVENT 줄 묶음 (DTSTAMP는 자동) */
export function vevent(props) {
  return ['BEGIN:VEVENT', 'DTSTAMP:20261109T000000Z', ...props, 'END:VEVENT'];
}
