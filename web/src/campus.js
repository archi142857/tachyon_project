// 수업 사이 동선 안내 — TT Wizard(web/js/engine.js의 evaluate)의 셈을 Tachyon 일정에 맞게 옮긴 것.
// 같은 날 이어지는 두 일정의 장소가 캠퍼스 건물이면: 걷는 시간(TT Wizard 표), 쉬는 시간, 모자라면 'N분 지각'.
// 말투도 TT Wizard 그대로: '다음 수업까지 걷기 N분', '301동에서 83동까지 걷기 N분, 쉬는 시간 M분', 'N분 지각'(반올림한 정수 분).
// 걷는 시간 자료: ./campus/campus.json(web/scripts/campus.mjs가 data/walk.csv·buildings.csv로 만듦). ODbL 1.0이라 화면에 출처를 적는다.
import { isAllDay } from './layout.js';
import { kst } from './time.js';

export const CAMPUS_CREDIT = '걷는 시간: TT Wizard 자료(ODbL) · 캠퍼스 마법 지도 · © OpenStreetMap 기여자 · 국토지리정보원';

let loading = null;
/** 캠퍼스 표를 처음 쓸 때 한 번만 받는다(따로 떨어진 파일이라 첫 화면을 늦추지 않음). */
export function loadCampus() {
  loading ||= import('./campus/campus.json').then((m) => makeCampus(m.default));
  return loading;
}

// 건물 이름 → 찾기 열쇠: 괄호·대괄호 속 글과 띄어쓰기를 뺀다('인문관1(1동)' → '인문관1', '(관악사)대학원 생활관' → '대학원생활관')
const nameKey = (s) =>
  String(s)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\s+/g, '');

/** campus.json → 찾기 도구 */
export function makeCampus(json) {
  const index = new Map(json.ids.map((id, i) => [id, i]));
  const byName = new Map(); // 이름 열쇠 → 건물 번호(두 건물이 같은 열쇠면 null — 헷갈리면 안 쓴다)
  json.names.forEach((name, i) => {
    const key = nameKey(name);
    if (!key) return;
    byName.set(key, byName.has(key) && byName.get(key) !== json.ids[i] ? null : json.ids[i]);
  });
  const at = (id) => index.get(id);
  return {
    has: (id) => index.has(id),
    name: (id) => json.names[at(id)],
    point: (id) => (index.has(id) ? { lat: json.lat[at(id)], lon: json.lon[at(id)] } : null),
    byName: (text) => byName.get(nameKey(text)) || null,
    /** a에서 b까지 걷는 분(소수). 같은 건물이면 0, 표에 없으면 null */
    minutes(a, b) {
      if (a === b) return 0;
      const i = at(a);
      const j = at(b);
      return i === undefined || j === undefined ? null : json.walk[i][j] / 100;
    },
  };
}

/** TT Wizard buildingLabel: '301동', 정문 */
export const buildingLabel = (id) => (id === 'GATE' ? '정문' : `${id}동`);

/**
 * 장소 글 → 캠퍼스 건물 번호(표에 있는 것만). 모르면 null.
 *   '301동 118호' · '43-1동' · '(62동)' · '301-118' · '220-1-201' · '083-302' · '500-L304' · '301' · '학생회관' · '정문'
 *   '#101-1-2'(연건)·'*201'(평창)은 다른 캠퍼스라 null. '역삼1동'처럼 앞에 글자가 붙은 동네 이름은 건물로 보지 않는다.
 * 수강편람 모양(동-호)은 TT Wizard parse_building 규칙: 세 조각이고 가운데가 한 글자면 앞 둘을 합친 것이 동 번호.
 */
export function parseBuilding(place, campus) {
  if (!place || !campus) return null;
  const text = String(place).trim();
  if (!text || /^[#*]/.test(text)) return null;
  const pick = (raw) => {
    const id = String(raw).replace(/^0+(?=\d)/, '').toUpperCase();
    if (campus.has(id)) return id;
    const base = id.replace(/-\d$/, ''); // 표에 없는 가지 번호('220-1')면 본관(가지 번호는 한 자리)
    return base !== id && campus.has(base) ? base : null;
  };
  for (const m of text.matchAll(/(?<![가-힣A-Za-z0-9-])(\d{1,3}(?:-\d)?[A-Da-d]?)\s*동/g)) {
    const id = pick(m[1]);
    if (id) return id;
  }
  // 동-호: 호는 세 글자 이상('118'·'B101'·'L304')이어야 한다 — '11-13'(날짜)·'02-880-1234'(전화)를 건물로 읽지 않게
  const room = /(?<![\d:.\-])(\d{1,3}(?:-[A-Za-z]*\d+[A-Za-z]?){1,2})(?![\d:\-])/.exec(text);
  if (room) {
    const parts = room[1].split('-').filter((p) => p && !/^[A-Za-z]+$/.test(p));
    const last = parts[parts.length - 1];
    let id = null;
    if (parts.length === 2 && last.length >= 3) id = pick(parts[0]);
    else if (parts.length === 3 && parts[1].length === 1 && last.length >= 2) id = pick(`${parts[0]}-${parts[1]}`);
    if (id) return id;
  }
  const only = /^(\d{1,3}(?:-\d)?[A-Da-d]?)$/.exec(text);
  if (only) return pick(only[1]);
  const key = text.replace(/^서울대(학교)?\s*/, '');
  if (key.replace(/\s+/g, '') === '정문') return campus.has('GATE') ? 'GATE' : null;
  return campus.byName(key);
}

const MIN = 60 * 1000;

/**
 * 이어지는 일정 사이의 걷기(TT Wizard evaluate와 같은 셈. Tachyon은 집 자리를 모르니 집 → 첫 일정·마지막 일정 → 집은 뺀다).
 * events: 일정 목록({ id, start, end, place }). 하루 종일 일정은 뺀다.
 * 돌려주는 것: Map(일정 id → { arrive, depart }) — arrive = 앞 일정에서 이 일정까지, depart = 이 일정에서 다음 일정까지.
 *   leg = { from, to, minutes, gap, slack }(분, 소수). gap = 쉬는 시간, slack = gap − minutes(음수면 지각).
 *   앞 일정의 끝 시각을 모르면 gap·slack은 null(걷는 시간만).
 * TT Wizard처럼 장소가 비어 있는 일정은 그 자리에서 움직이지 않은 것으로 보고, 그 앞 쉬는 시간을 다음 이동에 보탠다.
 * 장소가 캠퍼스 밖(표에 없는 곳)이면 거기서 끊는다(어디서 오는지 모름). 시간이 겹치는 두 일정 사이는 셈하지 않는다.
 */
export function dayLegs(events, campus) {
  const out = new Map();
  if (!campus) return out;
  const byDay = new Map();
  for (const ev of events) {
    if (!ev || !ev.start || isAllDay(ev) || ev.all_day) continue;
    const p = kst(ev.start);
    const key = `${p.y}-${p.m}-${p.d}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || (Date.parse(a.end) || 0) - (Date.parse(b.end) || 0));
    let prev = null; // 마지막으로 자리를 아는 일정 { ev, building }
    let prevEnd = null; // 바로 앞 일정이 끝나는 순간(ms). 모르면 null
    let spare = 0; // 자리 아는 일정 뒤, 장소 없는 일정들 앞의 쉬는 시간 합(분)
    for (const ev of list) {
      const start = Date.parse(ev.start);
      const end = ev.end ? Date.parse(ev.end) : null;
      if (!ev.place || !String(ev.place).trim()) {
        if (prev && prevEnd !== null) spare += Math.max(0, (start - prevEnd) / MIN);
        prevEnd = end;
        continue;
      }
      const building = parseBuilding(ev.place, campus);
      if (!building) {
        prev = null;
        prevEnd = end;
        spare = 0;
        continue;
      }
      if (prev && (prevEnd === null || start >= prevEnd)) {
        const minutes = campus.minutes(prev.building, building);
        if (minutes !== null && prev.building !== building) {
          const gap = prevEnd === null ? null : spare + (start - prevEnd) / MIN;
          const leg = { from: prev.building, to: building, minutes, gap, slack: gap === null ? null : gap - minutes };
          out.set(ev.id, { ...out.get(ev.id), arrive: { ...leg, fromTitle: prev.ev.title } });
          out.set(prev.ev.id, { ...out.get(prev.ev.id), depart: { ...leg, toTitle: ev.title } });
        }
      }
      prev = { ev, building };
      prevEnd = end;
      spare = 0;
    }
  }
  return out;
}

/** TT Wizard lateOf: 늦는 분(반올림한 정수). 안 늦으면 0 */
export const lateOf = (leg) => (leg && leg.slack !== null && leg.slack < 0 ? Math.max(0, Math.round(-leg.slack)) : 0);

/** 오는 길 한 줄: '301동에서 83동까지 걷기 12분, 쉬는 시간 15분'(TT Wizard 늦는 까닭과 같은 말) */
export function arriveText(leg) {
  const walk = `${buildingLabel(leg.from)}에서 ${buildingLabel(leg.to)}까지 걷기 ${Math.round(leg.minutes)}분`;
  return leg.gap === null ? walk : `${walk}, 쉬는 시간 ${Math.round(leg.gap)}분`;
}

/** 가는 길 한 줄: '다음 일정까지 걷기 12분' */
export const departText = (leg) => `다음 일정까지 걷기 ${Math.round(leg.minutes)}분`;
