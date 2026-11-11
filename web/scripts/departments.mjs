// 첫 설정 '학과' 목록(web/src/departments.json)을 저장소 맨 위 data/에서 만든다. 자료가 바뀌면 다시 돌린다: node web/scripts/departments.mjs
// - data/departments/courses_2024.json: 학교 '전공별 교과목, 학사과정(2024년 기준)'의 학과·전공 이름과 단과대(사실만 옮긴 것, 출처는 그 README)
// - data/offerings/2026-2.json: 2026-2 수강편람의 개설 학과 — 2024년 뒤에 바뀐 학부 이름만 보탠다(아래 NEWER). 대학원만 있는 곳은 넣지 않는다.
// 목록에 없는 학과·전공은 화면에서 쓴 그대로 넣을 수 있다(DeptPicker).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
export const OUT = join(here, '..', 'src', 'departments.json');

// 학과 아닌 묶음(교양·교직·과정)과 단과대 공통과목 묶음은 뺀다
const NOT_DEPT = new Set(['교양과목', '교직과목', '그린리더십 과정']);
// 2024년판 뒤에 바뀌거나 생긴 학부(2026-2 수강편람에 있는 이름) → 단과대. 수강편람에는 단과대 칸이 없어 여기 적는다.
const NEWER = {
  건설환경도시공학부: '공과대학',
  고고미술사학과: '인문대학',
  '물리·천문학부': '자연과학대학',
  소비자아동학부: '생활과학대학',
  정치외교학부: '사회과학대학',
  치의학과: '치의학대학원',
  학부대학: '학부대학',
  '연계전공 유럽지역학': '연합·연계전공',
  '연계전공 일본학': '연합·연계전공',
};

/** 가운뎃점·줄표를 한 가지로(2024년판은 '⋅'·'－', 수강편람은 '·'·'-') */
export const tidyName = (s) => s.replace(/[⋅∙•]/g, '·').replace(/[－–—]/g, '-').replace(/\s+/g, ' ').trim();

/** '약학과(2+4년제) 및 372. 제약학과(2+4년제)' 같은 줄 → ['약학과', '제약학과'] */
function splitNames(name) {
  return name
    .split(/\s+및\s+/)
    .map((part) => tidyName(part.replace(/^\d+[A-Z]?\.\s*/, '').replace(/\((?:2\+4|6)년제\)/g, '')))
    .filter((n) => n && n !== '약학기본과정');
}

/** courses_2024 departments · 2026-2 개설 학과 이름 → [[이름, 단과대], …] (2024년판 순서, 새 이름은 같은 단과대 끝에) */
export function buildDepartments(departments2024, offeringDepts) {
  const out = [];
  const seen = new Set();
  const push = (name, college) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push([name, college]);
  };
  for (const d of departments2024) {
    if (NOT_DEPT.has(d.name) || /대학$/.test(d.name)) continue; // '인문대학' 같은 단과대 공통과목 묶음
    for (const name of splitNames(d.name)) push(name, tidyName(d.college));
  }
  const offered = new Set(offeringDepts.map(tidyName));
  for (const [name, college] of Object.entries(NEWER)) {
    if (!offered.has(name)) throw new Error(`2026-2 수강편람에 없는 학과: ${name} — NEWER를 고친다`);
    const at = out.findLastIndex(([, c]) => c === college);
    if (seen.has(name)) continue;
    seen.add(name);
    out.splice(at < 0 ? out.length : at + 1, 0, [name, college]);
  }
  return out;
}

export function formatDepartments(list) {
  return `{\n  "about": "첫 설정 학과 목록. data/departments/courses_2024.json(학교 '전공별 교과목, 학사과정' 2024년판) + 2026-2 수강편람에서 바뀐 학부 이름. [이름, 단과대]. 만든 법: node web/scripts/departments.mjs",\n  "list": [\n${list.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const courses = JSON.parse(readFileSync(join(ROOT, 'data', 'departments', 'courses_2024.json'), 'utf8'));
  const offerings = JSON.parse(readFileSync(join(ROOT, 'data', 'offerings', '2026-2.json'), 'utf8'));
  const list = buildDepartments(courses.departments, offerings.courses.map((row) => row[2]));
  writeFileSync(OUT, formatDepartments(list));
  console.log(`학과 ${list.length}개 → ${OUT}`);
}
