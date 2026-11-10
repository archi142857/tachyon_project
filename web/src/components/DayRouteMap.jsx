// 하루 동선 지도(TT Wizard 요일 동선 지도를 작게): 그날 캠퍼스 건물에서 하는 일정을 번호 핀으로, 그 사이 걷는 길을 선으로.
// 바탕 지도 없이 길 선과 옅은 건물 점만(campus/README.md). 처음 열 때 길 모양 표를 한 번 받는다.
import { useEffect, useRef, useState } from 'react';
import { dayStops, drawDayMap, loadRoutes, routeSummary } from '../routeMap.js';

export const ROUTE_CREDIT = '길: TT Wizard 자료(ODbL) · © OpenStreetMap 기여자 · © 캠퍼스 마법 지도';

function colors(el) {
  const cs = getComputedStyle(el);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--map-bg', '#f4f2ec'),
    dot: v('--map-dot', '#cfcac0'),
    halo: v('--map-halo', '#ffffff'),
    line: v('--map-route', v('--accent', '#0061fe')),
    pin: v('--map-pin', v('--accent', '#0061fe')),
    pinText: v('--map-pin-text', '#ffffff'),
    label: v('--map-label', '#3a3a3a'),
    font: getComputedStyle(document.body).fontFamily,
  };
}

export default function DayRouteMap({ events, campus, dayOf }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const [routes, setRoutes] = useState(null);
  const [failed, setFailed] = useState(false);
  const stops = campus ? dayStops(events, campus, dayOf) : [];

  useEffect(() => {
    loadRoutes().then(setRoutes, () => setFailed(true));
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !routes || !campus || stops.length < 2) return undefined;
    const draw = () => {
      const w = box.current.clientWidth;
      const h = Math.round(Math.min(320, Math.max(200, w * 0.62)));
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(w * ratio);
      el.height = Math.round(h * ratio);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      drawDayMap(el.getContext('2d'), { w, h, stops, campus, routes, allPoints: campus.points(), colors: colors(el), ratio });
    };
    draw();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    ro && ro.observe(box.current);
    return () => ro && ro.disconnect();
  }, [routes, campus, stops.map((s) => s.building + s.label).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stops.length < 2) return null;
  return (
    <figure className="day-map" ref={box}>
      {failed ? (
        <p className="hint">길 모양을 불러오지 못했어요</p>
      ) : (
        <canvas ref={canvas} role="img" aria-label={`하루 동선: ${routeSummary(stops, campus)}`} />
      )}
      <figcaption className="hint">
        {routeSummary(stops, campus)} · {ROUTE_CREDIT}
      </figcaption>
    </figure>
  );
}
