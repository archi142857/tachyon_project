// 화면 흐름: 로그인 → (처음이면) 첫 설정 → 대시보드. 주소 끝에 ?example을 붙이면 서버 없이 예시 자료로 연다.
import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import Dashboard from './screens/Dashboard.jsx';
import { inApp, listenAppLogin, listenAppResume, pushToDevice, syncDevice } from './native.js';
import Login from './screens/Login.jsx';
import Setup from './screens/Setup.jsx';
import { OursLogin, OursSetup } from './ours/OursStart.jsx';
import { useSkin } from './ours/skin.jsx';

export default function App() {
  const skin = useSkin(); // '입자' · '종이' 테마면 시작 화면도 그 모양(ours/)
  const [screen, setScreen] = useState('loading'); // loading | login | setup | dashboard
  const screenRef = useRef(screen);
  const ttwRef = useRef(undefined); // TT Wizard에서 보낸 시간표 링크(대시보드에 한 번만)
  const joinRef = useRef(undefined); // 초대 링크 코드(한 번만 연다)
  screenRef.current = screen;
  const [user, setUser] = useState(null);
  const [again, setAgain] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [notice, setNotice] = useState(null); // 로그인 화면의 알림 한 줄(계정을 지운 뒤 등)
  const [loginError, setLoginError] = useState(() => api.loginErrorText(new URLSearchParams(window.location.search).get('login_error')));

  async function load() {
    try {
      const me = await api.getMe();
      // 앱: 폰 캘린더를 먼저 올리고 화면을 연다(처음 한 번은 권한을 묻는다). 안 돼도 화면은 연다
      if (inApp() && !api.isExample()) {
        await syncDevice('once').catch(() => null);
        pushToDevice().catch(() => null); // 켜 두었으면 폰 'Tachyon' 캘린더를 맞춘다(기다리지 않음, 11-10 컨셉)
      }
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
    api.catchTtwLink(); // TT Wizard 'Tachyon으로 보내기'(…/#ttw=…)를 로그인 전에 받아 둔다(11-11 컨셉)
    api.catchJoinLink(); // 친구·그룹 초대 링크(…/?join=…)도 로그인 전에 받아 둔다
    if (inApp()) {
      listenAppLogin();
      listenAppResume(() => screenRef.current === 'dashboard' && !api.isExample());
    }
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

  // 계정을 지운 뒤(또는 예시에서 '계정 지우기') → 로그인 화면
  const onDeleted = (example) => {
    setAgain(false);
    setLoginError(null);
    setNotice(example ? '예시를 끝냈어요. 아무것도 지우지 않았어요' : '계정과 내 자료를 모두 지웠어요');
    setScreen('login');
  };

  // TT Wizard에서 보낸 시간표(#ttw=…)는 대시보드를 처음 열 때 한 번만 넘긴다
  if (screen === 'dashboard' && ttwRef.current === undefined) ttwRef.current = api.takeTtwLink();
  if (screen === 'dashboard' && joinRef.current === undefined) joinRef.current = api.takeJoinLink();

  if (screen === 'loading') return null;
  const LoginScreen = skin ? OursLogin : Login;
  const SetupScreen = skin ? OursSetup : Setup;
  if (screen === 'login')
    return (
      <LoginScreen
        error={loginError}
        notice={notice}
        onExample={() => {
          setNotice(null);
          api.startExample();
          load();
        }}
      />
    );
  if (screen === 'setup')
    return (
      <SetupScreen
        user={user}
        example={api.isExample()}
        again={again}
        onDone={() => {
          setAgain(false);
          load();
        }}
        onDeleted={onDeleted}
      />
    );
  return (
    <Dashboard
      example={api.isExample()}
      installPrompt={installPrompt}
      ttwLink={ttwRef.current}
      joinCode={joinRef.current}
      onOpenSetup={() => {
        setAgain(true);
        setScreen('setup');
      }}
      onLogout={async () => {
        await api.logout().catch(() => {});
        setLoginError(null);
        setNotice(null);
        setScreen('login');
      }}
      onDeleted={onDeleted}
    />
  );
}
