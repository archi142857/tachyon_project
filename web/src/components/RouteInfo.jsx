// 일정 창 안의 '장소 · 동선' 칸.
//   - 장소를 네이버 지도(앱·웹)로 열기
//   - 같은 날 앞·뒤 일정이 캠퍼스 건물이면 걷는 시간·쉬는 시간(TT Wizard 자료, 말투도 TT Wizard), 모자라면 'N분 지각', '길 보기'(네이버 지도 도보 길찾기)
//   - 그날 캠퍼스 건물 두 곳 넘게 들르면 '하루 동선' 지도(TT Wizard 요일 동선 지도를 작게, DayRouteMap)
import { useState } from 'react';
import { CAMPUS_CREDIT, arriveText, departText, lateOf, parseBuilding } from '../campus.js';
import { appName, openNaver, placeLink, walkLink } from '../naverMap.js';
import { dayStops, dayWalk } from '../routeMap.js';
import DayRouteMap from './DayRouteMap.jsx';

function MapLink({ link, label, children }) {
  return (
    <a
      className="btn-text map-link"
      href={link.web}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        openNaver(link);
      }}
    >
      {children}
    </a>
  );
}

export default function RouteInfo({ event, leg, campus, events }) {
  const [showMap, setShowMap] = useState(false);
  if (!event.place) return null;
  const stops = campus && events ? dayStops(events, campus, event.start) : [];
  const appname = appName();
  const building = parseBuilding(event.place, campus);
  const place = placeLink({ place: event.place, building, campus, appname });
  const arrive = leg && leg.arrive;
  const depart = leg && leg.depart;
  const late = lateOf(arrive);
  const arriveWalk = arrive && walkLink({ from: arrive.from, to: arrive.to, campus, appname });
  const departWalk = depart && walkLink({ from: depart.from, to: depart.to, campus, appname });

  return (
    <div className="route-info">
      <div className="route-row">
        <span>{event.place}</span>
        <MapLink link={place} label={`${event.place} 네이버 지도에서 보기`}>
          지도
        </MapLink>
      </div>
      {arrive && (
        <div className="route-row">
          <span>
            {arriveText(arrive)}
            {late > 0 && <b className="late"> · {late}분 지각</b>}
          </span>
          {arriveWalk && (
            <MapLink link={arriveWalk} label="앞 일정에서 오는 길 네이버 지도에서 보기">
              길 보기
            </MapLink>
          )}
        </div>
      )}
      {depart && (
        <div className="route-row">
          <span>
            {departText(depart)}
            {lateOf(depart) > 0 && <b className="late"> · {lateOf(depart)}분 지각</b>}
          </span>
          {departWalk && (
            <MapLink link={departWalk} label="다음 일정으로 가는 길 네이버 지도에서 보기">
              길 보기
            </MapLink>
          )}
        </div>
      )}
      {stops.length >= 2 && (
        <div className="route-row">
          <span>하루 동선 · 걷기 {dayWalk(stops, campus)}분</span>
          <button type="button" className="btn-text map-link" aria-expanded={showMap} onClick={() => setShowMap(!showMap)}>
            {showMap ? '지도 닫기' : '지도 보기'}
          </button>
        </div>
      )}
      {showMap && <DayRouteMap events={events} campus={campus} dayOf={event.start} />}
      {(arrive || depart) && <p className="hint">{CAMPUS_CREDIT}</p>}
    </div>
  );
}
