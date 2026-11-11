import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { reportError } from './api.js';
import './styles.css';
import './themes.css';
import { applyTheme, currentTheme } from './themes.js';

// 지난번에 고른 테마를 첫 화면이 그려지기 전에 입힌다(메뉴 → 테마).
applyTheme(currentTheme());

// 화면 오류 자동 보고(서버 6_feedback → GitHub 이슈). 한 번 열었을 때 같은 메시지는 한 번만, 다 합쳐 5개까지.
// 보내다 실패하면 다시 보내지 않는다(렌더마다 나는 오류가 요청을 쏟지 않게).
const sent = new Set();
const MAX_REPORTS = 5;
function report(message, stack) {
  const key = String(message);
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  reportError({
    message: String(message).slice(0, 300),
    stack: String(stack || '').slice(0, 2000),
    screen: document.body.dataset.screen || '?',
  }).catch(() => {});
}
window.addEventListener('error', (e) => report(e.message, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => report(e.reason?.message || String(e.reason), e.reason?.stack));

// 홈 화면에 추가한 앱이 빠르게 열리도록 화면 파일만 저장해 둔다(public/sw.js).
// 개발 서버와, 나중에 Capacitor로 감싼 앱 안에서는 쓰지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
