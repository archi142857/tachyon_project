// 첫 설정 학과·학번(11-11): 학번 목록·학년 셈, 학과 찾기, 학과 목록 만들기. 자료는 지어낸 예시와 저장소 data/의 학교 공식 학과 이름.
import { describe, expect, it } from 'vitest';
import DEPARTMENTS from './departments.json';
import { entryOf, entryYears, gradeOf, matchDepartments, schoolYear, searchKey } from './setup.js';
import { buildDepartments, tidyName } from '../scripts/departments.mjs';

const KST = (s) => new Date(`${s}+09:00`);

describe('학번', () => {
  it('학년도는 3월에 바뀐다(한국 시간)', () => {
    expect(schoolYear(KST('2026-11-11T12:00:00'))).toBe(2026);
    expect(schoolYear(KST('2027-02-28T23:59:00'))).toBe(2026);
    expect(schoolYear(KST('2027-03-01T00:00:00'))).toBe(2027);
  });

  it('목록은 올해 학번부터 8개, 마지막은 ‘이전’', () => {
    const list = entryYears(KST('2026-11-11T12:00:00'));
    expect(list.map((y) => y.label)).toEqual(['26학번', '25학번', '24학번', '23학번', '22학번', '21학번', '20학번', '19학번 이전']);
    expect(list[0].value).toBe(2026);
  });

  it('학번 → 서버의 학년(1~8) → 다시 학번', () => {
    const now = KST('2026-11-11T12:00:00');
    expect([2026, 2025, 2023, 2019, 2010].map((e) => gradeOf(e, now))).toEqual([1, 2, 4, 8, 8]);
    expect([1, 2, 4, 8].map((g) => entryOf(g, now))).toEqual([2026, 2025, 2023, 2019]);
    expect(entryOf(null, now)).toBe(null);
    expect(entryOf(5, now)).toBe(2022); // 예전 '5학년 이상'
  });
});

describe('학과 찾기', () => {
  const list = [
    ['경제학부', '사회과학대학'],
    ['식품·동물생명공학부', '농업생명과학대학'],
    ['동양화과', '미술대학'],
    ['기계공학부', '공과대학'],
    ['컴퓨터공학부', '공과대학'],
  ];
  it('빈 글이면 목록 그대로', () => {
    expect(matchDepartments(list, '  ')).toBe(list);
  });
  it('이름 앞 → 이름 안 → 단과대 순, 띄어쓰기·가운뎃점은 보지 않는다', () => {
    expect(matchDepartments(list, '동').map((r) => r[0])).toEqual(['동양화과', '식품·동물생명공학부']);
    expect(matchDepartments(list, '식품 동물').map((r) => r[0])).toEqual(['식품·동물생명공학부']);
    expect(matchDepartments(list, '공학').map((r) => r[0])).toEqual(['식품·동물생명공학부', '기계공학부', '컴퓨터공학부']);
    expect(matchDepartments(list, '공과').map((r) => r[0])).toEqual(['기계공학부', '컴퓨터공학부']);
  });
  it('searchKey: 가운뎃점·줄표·띄어쓰기를 뺀다', () => {
    expect(searchKey('전기⋅정보 공학부')).toBe(searchKey('전기·정보공학부'));
    expect(searchKey('연합전공 정치－경제－철학')).toBe('연합전공정치경제철학');
  });
});

describe('학과 목록(departments.json)', () => {
  it('학교 자료에서 뽑은 학과가 들어 있고 묶음 이름은 없다', () => {
    const names = DEPARTMENTS.list.map((r) => r[0]);
    expect(names).toContain('식품·동물생명공학부');
    expect(names).toContain('자유전공학부');
    expect(names).toContain('건설환경도시공학부'); // 2026-2 수강편람의 새 이름
    expect(names).toContain('약학과');
    expect(names).not.toContain('교양과목');
    expect(names).not.toContain('인문대학');
    expect(new Set(names).size).toBe(names.length);
  });

  it('buildDepartments: 묶음·단과대 공통 빼기, 가운뎃점 맞추기, ‘및’ 나누기', () => {
    const rows = buildDepartments(
      [
        { name: '교양과목', college: '교양과목' },
        { name: '인문대학', college: '인문대학' },
        { name: '국어국문학과', college: '인문대학' },
        { name: '전기⋅정보공학부', college: '공과대학' },
        { name: '약학과(2+4년제) 및 372. 제약학과(2+4년제)', college: '약학대학' },
        { name: '자유전공학부', college: '자유전공학부' },
      ],
      ['건설환경도시공학부', '고고미술사학과', '물리·천문학부', '소비자아동학부', '정치외교학부', '치의학과', '학부대학', '연계전공 유럽지역학', '연계전공 일본학'],
    );
    const names = rows.map((r) => r[0]);
    expect(names.slice(0, 2)).toEqual(['국어국문학과', '고고미술사학과']); // 새 이름은 같은 단과대 끝에
    expect(names).toContain('전기·정보공학부');
    expect(names).toEqual(expect.arrayContaining(['약학과', '제약학과', '자유전공학부']));
    expect(names).not.toContain('교양과목');
    expect(tidyName('연합전공 정치－경제－철학')).toBe('연합전공 정치-경제-철학');
  });
});
