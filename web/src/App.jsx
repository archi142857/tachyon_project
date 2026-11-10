// 화면 흐름: 로그인 → (처음이면) 첫 설정 → 대시보드. 주소 끝에 ?example을 붙이면 서버 없이 예시 자료로 연다.
import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import Dashboard from './screens/Dashboard.jsx';
import { inApp, listenAppLogin, syncDevice } from './native.js';
import Login from './screens/Login.jsx';
import Setup from './screens/Setup.jsx';

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | login | setup | dashboard
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [user, setUser] = useState(null);
  const [again, setAgain] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [loginError, setLoginError] = useState(() => api.loginErrorText(new URLSearchParams(window.location.search).get('login_error')));

  async function load() {
    try {
      const me = await api.getMe();
      // 앱: 폰 캘린더를 먼저 올리고 화면을 연다(처음 한 번은 권한을 묻는다). 안 돼도 화면은 연다
      if (inApp() && !api.isExample()) await syncDevice('once').catch(() => null);
      setUser(me);
      setScreen(me.setup_done ? 'dashboard' : 'setup');
    } catch (err) {
      // 401 = 로그인 전. 그 밖(연결 끊김·서버 오류)은 로그인 화면에 까닭을 한 줄로
      if (err.status !== 401) setLoginError('서버에 닿지 않아요. 인터넷을 확인하고 다시 열어 주세요');
      setScreen('login');
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('example') && !api.isExample()) api.startExample();
    if (inApp()) listenAppLogin();
    load();
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onSignedOut = () => {
      if (screenRef.current === 'login' || screenRef.current === 'loading') return; // 로그아웃 직후 늦게 온 401은 무시
      setLoginError('로그인이 끝났어요. 다시 로그인해 주세요');
      setScreen('login');
    };
    window.addEventListener(api.SIGNED_OUT, onSignedOut);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener(api.SIGNED_OUT, onSignedOut);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.screen = screen; // 오류 자동 보고에 화면 이름으로 붙는다
  }, [screen]);

  if (screen === 'loading') return null;
  if (screen === 'login')
    return (
      <Login
        error={loginError}
        onExample={() => {
          api.startExample();
          load();
        }}
      />
    );
  if (screen === 'setup')
    return (
      <Setup
        user={user}
        example={api.isExample()}
        again={again}
        onDone={() => {
          setAgain(false);
          load();
        }}
      />
    );
  return (
    <Dashboard
      example={api.isExample()}
      installPrompt={installPrompt}
      onOpenSetup={() => {
        setAgain(true);
        setScreen('setup');
      }}
      onLogout={async () => {
        await api.logout().catch(() => {});
        setLoginError(null);
        setScreen('login');
      }}
    />
  );
}
