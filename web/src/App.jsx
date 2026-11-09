// 화면 흐름: 로그인 → (처음이면) 첫 설정 → 대시보드. 주소 끝에 ?example을 붙이면 서버 없이 예시 자료로 연다.
import { useEffect, useState } from 'react';
import * as api from './api.js';
import Dashboard from './screens/Dashboard.jsx';
import Login from './screens/Login.jsx';
import Setup from './screens/Setup.jsx';

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | login | setup | dashboard
  const [user, setUser] = useState(null);
  const [again, setAgain] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [loginError] = useState(() => api.loginErrorText(new URLSearchParams(window.location.search).get('login_error')));

  async function load() {
    try {
      const me = await api.getMe();
      setUser(me);
      setScreen(me.setup_done ? 'dashboard' : 'setup');
    } catch {
      setScreen('login');
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('example') && !api.isExample()) api.startExample();
    load();
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
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
        setScreen('login');
      }}
    />
  );
}
