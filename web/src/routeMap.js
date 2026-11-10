// 하루 동선 지도 — TT Wizard(웹 app.js의 요일 동선 지도, 안드로이드 위젯 DayMapBitmap)를 작게 옮긴 것.
// 그날 수업(장소가 캠퍼스 건물인 일정)을 시간 순서로 번호 핀, 그 사이를 걷는 길(TT Wizard route_paths.json)로 잇는다.
// 바탕 지도는 그리지 않는다(TT Wizard 바탕은 수치지형도에서 만든 층이 있어 가져오지 않음 — campus/README.md). 대신 캠퍼스 건물을 옅은 점으로.
import { buildingLabel, parseBuilding } from './campus.js';
import { isAllDay } from './layout.js';
import { kst } from './time.js';

let loading = null;
/** 길 모양 표를 처음 쓸 때 한 번만 받는다(따로 떨어진 파일, 압축 130KB) */
export function loadRoutes() {
  loading ||= import('./campus/route_paths.json').then((m) => m.default);
  return loading;
}

/** Google polyline(소수 5자리) → [[lat, lon], ...] (TT Wizard engine.js decodePolyline) */
export function decodePolyline(text) {
  const out = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < text.length) {
    const vals = [];
    for (let k = 0; k < 2; k++) {
      let shift = 0;
      let result = 0;
      let b;
      do {
        b = text.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      vals.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    lat += vals[0];
    lon += vals[1];
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

/** a → b 길 좌표. 표에는 한 방향만 있으니 거꾸로도 찾는다(TT Wizard engine.js routeLine). 없으면 null */
export function routeLine(routes, a, b) {
  if (!routes || !routes.paths) return null;
  const p = routes.paths[`${a}|${b}`];
  if (p) return decodePolyline(p);
  const q = routes.paths[`${b}|${a}`];
  return q ? decodePolyline(q).reverse() : null;
}

const dayKey = (iso) => {
  const p = kst(iso);
  return `${p.y}-${p.m}-${p.d}`;
};

/**
 * 그날 들르는 캠퍼스 건물을 시간 순서로 → [{ building, label: '2·3', titles: [...] }].
 * 장소를 모르거나 캠퍼스 밖인 일정은 뺀다. 같은 건물이 이어지면 핀 하나에 번호를 모은다(TT Wizard '2·3').
 */
export function dayStops(events, campus, dayOfIso) {
  const key = dayKey(dayOfIso);
  const list = events
    .filter((ev) => ev && ev.start && !isAllDay(ev) && !ev.all_day && dayKey(ev.start) === key)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((ev) => ({ ev, building: parseBuilding(ev.place, campus) }))
    .filter((x) => x.building);
  const stops = [];
  list.forEach((x, i) => {
    const last = stops[stops.length - 1];
    if (last && last.building === x.building) {
      last.numbers.push(i + 1);
      last.titles.push(x.ev.title);
    } else stops.push({ building: x.building, numbers: [i + 1], titles: [x.ev.title] });
  });
  return stops.map((s) => ({ building: s.building, label: s.numbers.join('·'), titles: s.titles }));
}

/** 그날 걷는 분 합(이어지는 핀 사이, TT Wizard 표). 모르는 쌍은 뺀다 */
export function dayWalk(stops, campus) {
  let sum = 0;
  for (let i = 1; i < stops.length; i++) sum += campus.minutes(stops[i - 1].building, stops[i].building) || 0;
  return Math.round(sum);
}

/** 위도·경도 → 메르카토르(0~1) */
export function world(lat, lon) {
  const phi = (lat * Math.PI) / 180;
  return [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2];
}

const MAX_SCALE = 256 * 2 ** 18; // 핀이 한 곳뿐이어도 이보다 크게 당기지 않는다(TT Wizard 지도 최대 배율 근처)

/** 점들(메르카토르)이 w×h 캔버스에 pad만큼 비우고 들어오게 → { S, ox, oy } (화면 x = u·S − ox) */
export function fit(points, w, h, pad = 28) {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const [u, v] of points) {
    x0 = Math.min(x0, u);
    x1 = Math.max(x1, u);
    y0 = Math.min(y0, v);
    y1 = Math.max(y1, v);
  }
  const du = Math.max(x1 - x0, 1e-9);
  const dv = Math.max(y1 - y0, 1e-9);
  const S = Math.min((w - 2 * pad) / du, (h - 2 * pad) / dv, MAX_SCALE);
  return { S, ox: ((x0 + x1) / 2) * S - w / 2, oy: ((y0 + y1) / 2) * S - h / 2 };
}

/**
 * 캔버스에 그린다. colors = { bg, dot, halo, line, pin, pinText }(CSS 변수에서 읽어 넘김)
 * 순서: 바탕색 → 캠퍼스 건물 점 → 길(흰 테두리 + 선) → 핀(번호)
 */
export function drawDayMap(ctx, { w, h, stops, campus, routes, allPoints, colors, ratio = 1 }) {
  const pts = stops.map((s) => campus.point(s.building)).filter(Boolean);
  const legs = [];
  for (let i = 1; i < stops.length; i++) {
    const line = routeLine(routes, stops[i - 1].building, stops[i].building);
    const a = campus.point(stops[i - 1].building);
    const b = campus.point(stops[i].building);
    legs.push(line || (a && b ? [[a.lat, a.lon], [b.lat, b.lon]] : []));
  }
  const fitPts = [...pts.map((p) => world(p.lat, p.lon)), ...legs.flat().map(([la, lo]) => world(la, lo))];
  if (!fitPts.length) return;
  const { S, ox, oy } = fit(fitPts, w, h);
  const xy = (lat, lon) => {
    const [u, v] = world(lat, lon);
    return [u * S - ox, v * S - oy];
  };
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = colors.dot;
  for (const [lat, lon] of allPoints) {
    const [x, y] = xy(lat, lon);
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [width, color] of [
    [7, colors.halo],
    [3.5, colors.line],
  ]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const line of legs) {
      if (line.length < 2) continue;
      ctx.beginPath();
      line.forEach(([lat, lon], i) => {
        const [x, y] = xy(lat, lon);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${colors.font || 'sans-serif'}`;
  stops.forEach((s) => {
    const p = campus.point(s.building);
    if (!p) return;
    const [x, y] = xy(p.lat, p.lon);
    const r = Math.max(11, ctx.measureText(s.label).width / 2 + 6);
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = colors.halo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.pin;
    ctx.fill();
    ctx.fillStyle = colors.pinText;
    ctx.fillText(s.label, x, y + 0.5);
    ctx.fillStyle = colors.label;
    ctx.font = `500 11px ${colors.font || 'sans-serif'}`;
    ctx.fillText(buildingLabel(s.building), x, y + r + 9);
    ctx.font = `700 12px ${colors.font || 'sans-serif'}`;
  });
}

/** 화면 읽기용 한 줄: '오늘 동선: 1 500동 → 2 43-1동 → 3 301동, 걷기 24분' */
export function routeSummary(stops, campus) {
  return `${stops.map((s) => `${s.label} ${buildingLabel(s.building)}`).join(' → ')}, 걷기 ${dayWalk(stops, campus)}분`;
}
