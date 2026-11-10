// 네이버 지도로 열기(키 없음). 앱이 있으면 앱(nmap://), 없거나 PC면 웹(map.naver.com).
//   - 장소: 캠퍼스 건물이면 그 좌표, 아니면 장소 글로 검색
//   - 두 건물 사이: 도보 길찾기
// 앱 주소 모양: 네이버 지도 URL Scheme(https://guide.ncloud-docs.com/docs/maps-url-scheme) — appname(웹은 페이지 주소)이 꼭 있어야 한다.
// 웹 길찾기 주소는 map.naver.com/p/directions/출발/도착/경유/수단, 좌표는 웹 메르카토르(EPSG:3857, m).
// 안드로이드는 intent:// 로 앱을 열고 앱이 없으면 웹 주소로(browser_fallback_url), 아이폰은 앱을 먼저 열어 보고 1.5초 안에
// 화면이 그대로면 웹으로 간다.
import { buildingLabel } from './campus.js';

const R = 20037508.342789244;
/** 위도·경도 → 웹 메르카토르(m) */
export function webMercator(lat, lon) {
  const x = (lon * R) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (R / 180);
  return { x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) };
}

const enc = encodeURIComponent;
const appQuery = (params) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${enc(v)}`)
    .join('&');

// 건물 이름은 TT Wizard 자료 이름('제1공학관(301동)' 같은 것), 없으면 '301동'
const pointOf = (campus, id) => {
  const p = campus.point(id);
  return p && { ...p, name: campus.name(id) || buildingLabel(id) };
};

/**
 * 장소 하나를 여는 주소 { app, web }.
 * building(캠퍼스 건물 번호)이 있으면 그 자리에 표시, 없으면 장소 글로 검색.
 */
export function placeLink({ place, building, campus, appname }) {
  const p = building && campus ? pointOf(campus, building) : null;
  if (p) {
    const query = building === 'GATE' ? '서울대학교 정문' : `서울대학교 ${buildingLabel(building)}`;
    return {
      app: `nmap://place?${appQuery({ lat: p.lat, lng: p.lon, name: p.name, appname })}`,
      web: `https://map.naver.com/p/search/${enc(query)}`,
    };
  }
  const text = String(place || '').trim();
  return {
    app: `nmap://search?${appQuery({ query: text, appname })}`,
    web: `https://map.naver.com/p/search/${enc(text)}`,
  };
}

/** 캠퍼스 두 건물 사이 도보 길찾기 주소 { app, web }. 좌표를 모르면 null */
export function walkLink({ from, to, campus, appname }) {
  const a = pointOf(campus, from);
  const b = pointOf(campus, to);
  if (!a || !b) return null;
  const ma = webMercator(a.lat, a.lon);
  const mb = webMercator(b.lat, b.lon);
  return {
    app: `nmap://route/walk?${appQuery({ slat: a.lat, slng: a.lon, sname: a.name, dlat: b.lat, dlng: b.lon, dname: b.name, appname })}`,
    web: `https://map.naver.com/p/directions/${ma.x},${ma.y},${enc(a.name)},,/${mb.x},${mb.y},${enc(b.name)},,/-/walk`,
  };
}

/** 안드로이드에서 앱을 열고, 앱이 없으면 웹으로 가는 intent 주소 */
export function androidIntent(app, web) {
  const rest = app.replace(/^nmap:\/\//, '');
  return `intent://${rest}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${enc(web)};end`;
}

/** 이 기기에 맞게 연다(누른 그 순간에 불러야 한다). */
export function openNaver(link, nav = typeof navigator === 'undefined' ? {} : navigator) {
  // 안드로이드 앱(app/, Capacitor) 안: 앱 화면(WebView)은 intent·nmap 주소를 못 열 수 있어 웹 지도를 폰 브라우저 창(Browser 플러그인)으로
  const browser = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser;
  if (browser) {
    browser.open({ url: link.web });
    return;
  }
  const ua = nav.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  if (/Android/i.test(ua)) {
    window.location.href = androidIntent(link.app, link.web);
  } else if (ios) {
    const timer = setTimeout(() => {
      if (!document.hidden) window.location.href = link.web;
    }, 1500);
    document.addEventListener('visibilitychange', () => document.hidden && clearTimeout(timer), { once: true });
    window.location.href = link.app;
  } else {
    window.open(link.web, '_blank', 'noopener');
  }
}

/** 이 화면의 주소(네이버 지도 앱이 부른 곳을 알아보는 appname) */
export const appName = () => (typeof location === 'undefined' ? 'https://tachyon.tachyon-project.workers.dev' : location.origin);
