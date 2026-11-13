// 넓은 화면 '오늘' 위젯 칸 사이 경계를 끌어 칸 크기 바꾸기(11-13 사람 "칸 크기를 마음대로 바꿀 수 있게 … 칸 사이 경계를 클릭하고 움직일 수 있게").
// 경계마다 손잡이(role=separator): 끌기 · 화살표 키(24px) · 두 번 누르면 이 배치의 처음 크기.
// 크기는 배치 · 칸 모양(열 × 줄)마다 이 기기에(todayLayout.js readSizes) 두고, 칸 그리드에 grid-template-columns/rows를 fr 비율로 바로 쓴다(창이 바뀌어도 비율 그대로).
// 손잡이는 양쪽 칸이 실제로 다른 곳만 덮는다 — 세 칸 배치의 고리 | 할 일 경계는 가운데 열에만.
// layout이 없으면(폰) 손잡이도 크기도 없다.
import { useLayoutEffect, useRef, useState } from 'react';
import { areasOf, readSizes, resizeTracks, writeSizes } from '../todayLayout.js';

const MIN = { col: 220, row: 140 };
const STEP = 24;
const pxList = (text) => text.split(' ').map(parseFloat);
const sum = (list, from, to) => list.slice(from, to).reduce((s, v) => s + v, 0);
const frs = (list) => list.map((v) => `minmax(0, ${v.toFixed(1)}fr)`).join(' ');

// 경계마다 { axis, i, a, b(양쪽 칸 이름), style(자리) }
function boundaries({ areas, cols, rows, cgap, rgap, pl, pt }) {
  const out = [];
  const span = (ks) => [ks[0], ks[ks.length - 1]];
  for (let i = 0; i < cols.length - 1; i++) {
    const ks = areas.map((r, k) => (r[i] !== r[i + 1] ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) continue;
    const [r0, r1] = span(ks);
    const left = pl + sum(cols, 0, i + 1) + i * cgap + cgap / 2;
    out.push({ axis: 'col', i, a: areas[r0][i], b: areas[r0][i + 1], style: { left, top: pt + sum(rows, 0, r0) + r0 * rgap, height: sum(rows, r0, r1 + 1) + (r1 - r0) * rgap } });
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const ks = areas[i].map((v, k) => (v !== areas[i + 1][k] ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) continue;
    const [c0, c1] = span(ks);
    const top = pt + sum(rows, 0, i + 1) + i * rgap + rgap / 2;
    out.push({ axis: 'row', i, a: areas[i][c0], b: areas[i + 1][c0], style: { top, left: pl + sum(cols, 0, c0) + c0 * cgap, width: sum(cols, c0, c1 + 1) + (c1 - c0) * cgap } });
  }
  return out;
}

export default function GridSplit({ layout, names }) {
  const anchor = useRef(null);
  const drag = useRef(null); // { h, x, y, start, geo, last }
  const [geo, setGeo] = useState(null); // { key, areas, cols, rows, cgap, rgap, pl, pt }
  const [active, setActive] = useState(null); // 끄는 경계 'col0' 등
  const gridEl = () => anchor.current?.parentElement;

  function apply(g, cols, rows) {
    g.style.gridTemplateColumns = cols ? frs(cols) : '';
    g.style.gridTemplateRows = rows ? frs(rows) : '';
  }

  // 저장된 크기를 입히고 지금 칸 자리를 잰다
  function measure() {
    const g = gridEl();
    if (!g) return;
    const areas = layout ? areasOf(getComputedStyle(g).gridTemplateAreas) : [];
    if (!areas.length) {
      apply(g);
      setGeo(null);
      return;
    }
    const key = `${layout}@${areas[0].length}x${areas.length}`;
    const saved = readSizes()[key];
    const ok = saved?.cols?.length === areas[0].length && saved?.rows?.length === areas.length;
    apply(g, ok && saved.cols, ok && saved.rows);
    const cs = getComputedStyle(g);
    setGeo({ key, areas, cols: pxList(cs.gridTemplateColumns), rows: pxList(cs.gridTemplateRows), cgap: parseFloat(cs.columnGap) || 0, rgap: parseFloat(cs.rowGap) || 0, pl: parseFloat(cs.paddingLeft) || 0, pt: parseFloat(cs.paddingTop) || 0 });
  }

  useLayoutEffect(() => {
    measure();
    const g = gridEl();
    if (!g || !window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(() => !drag.current && measure()); // 창 크기 · 넓이 구간이 바뀌면 다시
    ro.observe(g);
    return () => ro.disconnect();
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  function resize(g0, h, next) {
    const cols = h.axis === 'col' ? next : g0.cols;
    const rows = h.axis === 'row' ? next : g0.rows;
    apply(gridEl(), cols, rows);
    setGeo({ ...g0, cols, rows });
    return { cols, rows };
  }
  const save = (key, v) => writeSizes({ ...readSizes(), [key]: { cols: v.cols.map(Math.round), rows: v.rows.map(Math.round) } });
  function reset() {
    const all = readSizes();
    delete all[geo.key];
    writeSizes(all);
    measure();
  }

  function down(e, h) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { h, x: e.clientX, y: e.clientY, start: h.axis === 'col' ? geo.cols : geo.rows, geo, last: null };
    setActive(h.axis + h.i);
    document.documentElement.classList.add(h.axis === 'col' ? 'resizing-col' : 'resizing-row');
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const delta = d.h.axis === 'col' ? e.clientX - d.x : e.clientY - d.y;
    d.last = resize(d.geo, d.h, resizeTracks(d.start, d.h.i, delta, MIN[d.h.axis]));
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    setActive(null);
    document.documentElement.classList.remove('resizing-col', 'resizing-row');
    if (d?.last) save(d.geo.key, d.last);
  }
  function key(e, h) {
    const dir = (h.axis === 'col' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 })[e.key];
    if (!dir) return;
    e.preventDefault();
    const list = h.axis === 'col' ? geo.cols : geo.rows;
    save(geo.key, resize(geo, h, resizeTracks(list, h.i, dir * STEP, MIN[h.axis])));
  }

  return (
    <>
      <span ref={anchor} hidden />
      {geo &&
        boundaries(geo).map((h) => {
          const list = h.axis === 'col' ? geo.cols : geo.rows;
          return (
            <div
              key={`${h.axis}${h.i}${h.a}`}
              role="separator"
              tabIndex={0}
              className={`grid-split ${h.axis}${active === h.axis + h.i ? ' on' : ''}`}
              style={h.style}
              aria-orientation={h.axis === 'col' ? 'vertical' : 'horizontal'}
              aria-label={`${names[h.a]} · ${names[h.b]} 사이 경계`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((list[h.i] / (list[h.i] + list[h.i + 1])) * 100)}
              title="끌어서 칸 크기 바꾸기 · 두 번 누르면 처음 크기"
              onPointerDown={(e) => down(e, h)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => (e.stopPropagation(), reset())}
              onKeyDown={(e) => key(e, h)}
            />
          );
        })}
    </>
  );
}
