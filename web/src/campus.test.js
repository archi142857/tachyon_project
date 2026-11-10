// 수업 사이 동선(campus.js)과 네이버 지도 주소(naverMap.js). 예시는 모두 지어낸 일정이다.
import { describe, expect, it } from 'vitest';
import { buildCampus, formatCampus, readSources } from '../scripts/campus.mjs';
import campusJson from './campus/campus.json';
import { CAMPUS_CREDIT, arriveText, buildingLabel, dayLegs, departText, lateOf, makeCampus, parseBuilding } from './campus.js';
import { makeExample } from './example.js';
import { androidIntent, placeLink, walkLink, webMercator } from './naverMap.js';
import { fromKst } from './time.js';

const campus = makeCampus(campusJson);
const [buildingsCsv, walkCsv] = readSources();
// TT Wizard 표(data/walk.csv)에서 바로 읽은 값
const csvMinutes = (a, b) => {
  const line = walkCsv.split('\n').find((l) => l.startsWith(`${a},${b},`));
  return Number(line.split(',')[2]);
};

describe('캠퍼스 표 = TT Wizard 자료', () => {
  it('campus.json은 data/walk.csv·buildings.csv에서 만든 것과 같다(자료를 바꾸면 node web/scripts/campus.mjs)', () => {
    const built = buildCampus(buildingsCsv, walkCsv);
    expect(JSON.parse(formatCampus(built))).toEqual(campusJson);
    expect(campusJson.ids).toHaveLength(135);
    expect(campusJson.about).toContain('ODbL');
  });

  it('걷는 시간은 방향마다 다르고(오르막·내리막) 표 그대로', () => {
    expect(campus.minutes('26', '301')).toBe(csvMinutes('26', '301'));
    expect(campus.minutes('301', '26')).toBe(csvMinutes('301', '26'));
    expect(campus.minutes('26', '301')).not.toBe(campus.minutes('301', '26'));
    expect(campus.minutes('301', '301')).toBe(0);
    expect(campus.minutes('301', '없는곳')).toBeNull();
  });
});

describe('장소 글 → 건물 번호', () => {
  const cases = [
    ['301동 118호', '301'],
    ['301동', '301'],
    ['서울대 83동', '83'],
    ['43-1동 101호', '43-1'],
    ['중앙도서관(62동)', '62'],
    ['301-118', '301'],
    ['083-302', '83'],
    ['10-1-201', '10-1'],
    ['220-1-201', '220'], // 220-1은 표에 따로 없어 본관
    ['43-1-B101', '43-1'],
    ['500-L304', '500'],
    ['301', '301'],
    ['43-1', '43-1'],
    ['919a동', '919A'],
    ['정문', 'GATE'],
    ['서울대학교 정문', 'GATE'],
    ['중앙도서관 본관', '62'],
  ];
  it.each(cases)('%s → %s', (place, id) => expect(parseBuilding(place, campus)).toBe(id));

  it.each([
    ['#101-1-2'], // 연건 캠퍼스
    ['*201'], // 평창 캠퍼스
    ['역삼1동 주민센터'], // 동네 이름
    ['11-13'], // 날짜처럼 보이는 것
    ['02-880-1234'], // 전화번호
    ['010-1234-5678'],
    ['온라인'],
    ['강남역 2번 출구'],
    ['학생회관'], // 표에 이 이름이 없다
    [''],
    [null],
  ])('%s → 모름', (place) => expect(parseBuilding(place, campus)).toBeNull());
});

const at = (d, h, min = 0) => fromKst(2026, 11, d, h, min).toISOString().replace('.000Z', 'Z');
const ev = (id, d, [h1, m1], [h2, m2], place, title = `수업 ${id}`) => ({ id, title, start: at(d, h1, m1), end: h2 === null ? null : at(d, h2, m2), place });

describe('이어지는 일정 사이 걷기(TT Wizard evaluate와 같은 셈)', () => {
  it('26동 → 301동: 걷기 24분, 쉬는 시간 15분 → 9분 지각. 다음 일정 쪽에는 가는 길', () => {
    const legs = dayLegs([ev(1, 9, [10, 0], [11, 15], '26동'), ev(2, 9, [11, 30], [12, 45], '301동 118호')], campus);
    const arrive = legs.get(2).arrive;
    expect(arrive).toMatchObject({ from: '26', to: '301', gap: 15 });
    expect(arrive.minutes).toBe(csvMinutes('26', '301'));
    expect(arrive.slack).toBeCloseTo(15 - csvMinutes('26', '301'), 6);
    expect(lateOf(arrive)).toBe(Math.round(csvMinutes('26', '301') - 15));
    expect(arriveText(arrive)).toBe(`26동에서 301동까지 걷기 ${Math.round(csvMinutes('26', '301'))}분, 쉬는 시간 15분`);
    expect(legs.get(1).depart).toMatchObject({ from: '26', to: '301', toTitle: '수업 2' });
    expect(departText(legs.get(1).depart)).toBe(`다음 일정까지 걷기 ${Math.round(csvMinutes('26', '301'))}분`);
  });

  it('넉넉하면 지각 없음, 같은 건물이면 셈하지 않음', () => {
    const legs = dayLegs([ev(1, 10, [9, 30], [10, 45], '500동'), ev(2, 10, [11, 0], [12, 15], '43-1동'), ev(3, 10, [13, 0], [14, 0], '43-1동 201호')], campus);
    expect(lateOf(legs.get(2).arrive)).toBe(0);
    expect(legs.get(2).arrive.slack).toBeCloseTo(15 - csvMinutes('500', '43-1'), 6);
    expect(legs.get(3)).toBeUndefined();
  });

  it('장소 없는 일정은 그 자리에 있던 것으로 보고 앞 쉬는 시간을 보탠다(TT Wizard 강의실 미정과 같음)', () => {
    const legs = dayLegs([ev(1, 11, [9, 0], [10, 0], '26동'), ev(2, 11, [10, 10], [11, 0], null, '면담'), ev(3, 11, [11, 5], [12, 0], '301동')], campus);
    // 쉬는 시간 = 10분(9:00 수업 뒤) + 5분(면담 뒤)
    expect(legs.get(3).arrive.gap).toBe(15);
    expect(legs.get(3).arrive.from).toBe('26');
    expect(legs.has(2)).toBe(false);
  });

  it('캠퍼스 밖 장소에서 끊고, 겹치는 일정·끝 모르는 일정·다른 날은 셈하지 않거나 시간만', () => {
    const legs = dayLegs(
      [
        ev(1, 12, [9, 0], [10, 0], '26동'),
        ev(2, 12, [10, 30], [11, 30], '강남역'),
        ev(3, 12, [12, 0], [13, 0], '301동'), // 앞이 캠퍼스 밖 → 없음
        ev(4, 12, [12, 30], [13, 30], '83동'), // 3과 겹침 → 없음
        ev(5, 13, [9, 0], [null, null], '26동'), // 끝 모름
        ev(6, 13, [11, 0], [12, 0], '301동'),
      ],
      campus,
    );
    expect(legs.has(3)).toBe(false);
    expect(legs.has(4)).toBe(false);
    expect(legs.get(6).arrive).toMatchObject({ from: '26', to: '301', gap: null, slack: null });
    expect(lateOf(legs.get(6).arrive)).toBe(0);
    expect(arriveText(legs.get(6).arrive)).toBe(`26동에서 301동까지 걷기 ${Math.round(csvMinutes('26', '301'))}분`);
  });

  it('하루 종일 일정은 뺀다', () => {
    const allDay = { id: 9, title: '축제', start: at(16, 0), end: at(17, 0), place: '26동' };
    expect(dayLegs([allDay, ev(2, 16, [10, 0], [11, 0], '301동')], campus).size).toBe(0);
  });

  it.each([
    ['2026-11-10T03:00:00Z', '2026-11-10'], // 화요일 → 오늘
    ['2026-11-14T03:00:00Z', '2026-11-16'], // 토요일 → 다음 월요일
  ])('예시 자료(%s): 500동 → 43-1동은 괜찮고 43-1동 → 301동은 2분 지각, 그날 %s', (nowIso, day) => {
    const { events } = makeExample(new Date(nowIso));
    const legs = dayLegs(events, campus);
    const find = (title) => events.find((e) => e.title === title);
    expect(find('공학수학').start.slice(0, 10)).toBe(day);
    expect(lateOf(legs.get(find('물리학').id).arrive)).toBe(0);
    expect(arriveText(legs.get(find('물리학').id).arrive)).toBe('500동에서 43-1동까지 걷기 7분, 쉬는 시간 15분');
    expect(lateOf(legs.get(find('공학수학').id).arrive)).toBe(2);
    expect(buildingLabel('GATE')).toBe('정문');
    expect(CAMPUS_CREDIT).toContain('OpenStreetMap');
  });
});

describe('네이버 지도 주소(키 없음)', () => {
  const appname = 'https://tachyon.example';
  it('웹 메르카토르 좌표(네이버 웹 길찾기 주소가 받는 모양)', () => {
    const { x, y } = webMercator(37.5456653, 126.9846296);
    expect(x).toBeCloseTo(14135864.3, 0);
    expect(y).toBeGreaterThan(4500000);
    expect(y).toBeLessThan(4520000);
  });

  it('캠퍼스 건물은 좌표로, 아니면 검색으로', () => {
    const p = campus.point('301');
    const a = placeLink({ place: '301동 118호', building: '301', campus, appname });
    expect(a.app).toBe(`nmap://place?lat=${p.lat}&lng=${p.lon}&name=${encodeURIComponent(campus.name('301'))}&appname=${encodeURIComponent(appname)}`);
    expect(a.web).toBe(`https://map.naver.com/p/search/${encodeURIComponent('서울대학교 301동')}`);
    const b = placeLink({ place: '강남역 2번 출구', building: null, campus, appname });
    expect(b.app).toBe(`nmap://search?query=${encodeURIComponent('강남역 2번 출구')}&appname=${encodeURIComponent(appname)}`);
    expect(b.web).toBe(`https://map.naver.com/p/search/${encodeURIComponent('강남역 2번 출구')}`);
  });

  it('두 건물 사이 도보 길찾기: 앱 route/walk, 웹 /p/directions/…/-/walk, 안드로이드는 앱이 없으면 웹으로', () => {
    const link = walkLink({ from: '26', to: '301', campus, appname });
    expect(link.app.startsWith('nmap://route/walk?slat=')).toBe(true);
    expect(link.app).toContain(`&appname=${encodeURIComponent(appname)}`);
    expect(link.web).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/[\d.]+,[\d.]+,[^/]+,,\/[\d.]+,[\d.]+,[^/]+,,\/-\/walk$/);
    const intent = androidIntent(link.app, link.web);
    expect(intent.startsWith('intent://route/walk?')).toBe(true);
    expect(intent).toContain(';package=com.nhn.android.nmap;');
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(link.web)};end`);
    expect(walkLink({ from: '26', to: '없는곳', campus, appname })).toBeNull();
  });
});
