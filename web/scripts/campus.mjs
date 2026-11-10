// TT Wizard 캠퍼스 자료(저장소 맨 위 data/walk.csv·buildings.csv) → web/src/campus/campus.json
// 수업 사이 동선 안내(web/src/campus.js)가 읽는다. data/ 자료가 바뀌면 다시 돌린다: node web/scripts/campus.mjs
// 걷는 시간은 경사를 반영한 분(가는 방향마다 다름)이고, 원본 소수 둘째 자리 그대로 100을 곱한 정수로 둔다.
// 자료 조건: ODbL 1.0 — 캠퍼스 마법 지도 · © OpenStreetMap 기여자 · 국토지리정보원(data/README.md, data/ODbL-1.0.txt)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const OUT = join(here, '..', 'src', 'campus', 'campus.json');

const rows = (text) =>
  text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','));

/** buildings.csv(building,name,lat,lon)·walk.csv(from,to,minutes) 글 → campus.json 내용 */
export function buildCampus(buildingsCsv, walkCsv) {
  const buildings = rows(buildingsCsv);
  const ids = buildings.map((r) => r[0]);
  const index = new Map(ids.map((id, i) => [id, i]));
  if (index.size !== ids.length) throw new Error('buildings.csv에 같은 건물 번호가 두 번 있다');
  const walk = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : null)));
  for (const [from, to, minutes] of rows(walkCsv)) {
    const i = index.get(from);
    const j = index.get(to);
    if (i === undefined || j === undefined) throw new Error(`buildings.csv에 없는 지점: ${from} → ${to}`);
    walk[i][j] = Math.round(Number(minutes) * 100);
  }
  const holes = walk.flat().filter((v) => v === null || Number.isNaN(v)).length;
  if (holes) throw new Error(`걷는 시간이 빈 칸 ${holes}개`);
  return {
    about: 'TT Wizard 자료(data/walk.csv·buildings.csv). walk[출발][도착] = 걷는 분 × 100(경사 반영, 방향마다 다름). ODbL 1.0 — 캠퍼스 마법 지도 · © OpenStreetMap 기여자 · 국토지리정보원',
    ids,
    names: buildings.map((r) => r[1]),
    lat: buildings.map((r) => Number(r[2])),
    lon: buildings.map((r) => Number(r[3])),
    walk,
  };
}

/** 한 줄에 표 한 줄씩(차이를 보기 쉽게) */
export function formatCampus(campus) {
  const { walk, ...rest } = campus;
  const head = JSON.stringify(rest).slice(0, -1);
  return `${head},"walk":[\n${walk.map((row) => JSON.stringify(row)).join(',\n')}\n]}\n`;
}

export function readSources(root = ROOT) {
  return [readFileSync(join(root, 'data', 'buildings.csv'), 'utf8'), readFileSync(join(root, 'data', 'walk.csv'), 'utf8')];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const campus = buildCampus(...readSources());
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, formatCampus(campus));
  console.log(`campus.json: 지점 ${campus.ids.length}개, 걷는 시간 ${campus.ids.length * (campus.ids.length - 1)}쌍`);
}
