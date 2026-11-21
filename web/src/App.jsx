// 화면 흐름: 로그인 → (처음이면) 첫 설정 → 대시보드. 주소 끝에 ?example을 붙이면 서버 없이 예시 자료로 연다.
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import Dashboard from './screens/Dashboard.jsx';
import { clearNotify, inApp, listenAppLogin, listenAppResume, listenBack, listenNotify, pushToDevice } from './native.js';
import Logo from './components/Logo.jsx';
import Login from './screens/Login.jsx';

const Setup = lazy(() => import('./screens/Setup.jsx')); // 첫 설정은 처음 한 번만 쓰니 그때 받는다(11-21)

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | down(인터넷 끊김) | login | setup | dashboard
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
      // 앱: 화면부터 연다. 폰 캘린더 올리기는 대시보드가 뜬 뒤에(Dashboard.jsx back — 11-21, 빈 화면에서 기다리지 않게)
      if (inApp() && !api.isExample()) pushToDevice().catch(() => null); // 켜 두었으면 폰 'Tachyon' 캘린더를 맞춘다(기다리지 않음, 11-10 컨셉)
      setUser(me);
      setScreen(me.setup_done ? 'dashboard' : 'setup');
    } catch (err) {
      // 401 = 로그인 전. 그 밖(연결 끊김·서버 오류)은 로그인 화면에 까닭을 한 줄로
      // 서버가 저장소 사정(503 code: db_limit·db_busy)을 알리면 그 안내 글을, 아니면 연결 문제로 본다
      // 인터넷이 끊긴 것(err.offline)은 로그인 화면이 아니라 '다시 시도' 화면으로 — 연결이 돌아오면 저절로 다시 연다(11-21)
      if (err.offline) return setScreen('down');
      if (err.status !== 401) setLoginError(err.code ? err.message : '지금은 연결할 수 없어요. 잠시 후 다시 시도해 주세요');
      setScreen('login');
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('example') && !api.isExample()) api.startExample();
    api.catchTtwLink(); // TT Wizard 'Tachyon으로 보내기'(…/#ttw=…)를 로그인 전에 받아 둔다(11-11 컨셉)
    api.catchJoinLink(); // 친구·그룹 초대 링크(…/?join=…)도 로그인 전에 받아 둔다
    if (inApp()) {
      listenAppLogin();
      listenBack(); // 안드로이드 뒤로 단추 = 열린 창 닫기(11-21)
      listenNotify(); // 알림을 누르면 그 일정 · 할 일로(11-21)
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
      setLoginError('로그인이 풀렸어요. 다시 로그인해 주세요');
      setScreen('login');
    };
    window.addEventListener(api.SIGNED_OUT, onSignedOut);
    const onOnline = () => screenRef.current === 'down' && load();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener(api.SIGNED_OUT, onSignedOut);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.screen = screen; // 오류 자동 보고에 화면 이름으로 붙는다
  }, [screen]);

  // 계정을 지운 뒤(또는 예시에서 '계정 지우기') → 로그인 화면
  const onDeleted = (example) => {
    clearNotify().catch(() => null); // 잡아 둔 폰 알림도 지운다
    setAgain(false);
    setLoginError(null);
    setNotice(example ? '예시를 끝냈어요. 아무것도 지우지 않았어요' : '계정과 내 자료를 모두 지웠어요');
    setScreen('login');
  };

  // TT Wizard에서 보낸 시간표(#ttw=…)는 대시보드를 처음 열 때 한 번만 넘긴다
  if (screen === 'dashboard' && ttwRef.current === undefined) ttwRef.current = api.takeTtwLink();
  if (screen === 'dashboard' && joinRef.current === undefined) joinRef.current = api.takeJoinLink();

  // 처음 여는 동안: 빈 화면 대신 로고(11-21)
  if (screen === 'loading')
    return (
      <div className="boot" aria-busy="true" aria-label="여는 중">
        <Logo height={30} />
      </div>
    );
  if (screen === 'down')
    return (
      <div className="boot" role="alert">
        <Logo height={30} />
        <p>{api.OFFLINE_TEXT}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setScreen('loading');
            load();
          }}
        >
          다시 시도
        </button>
      </div>
    );
  if (screen === 'login')
    return (
      <Login
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
      <Suspense
        fallback={
          <div className="boot" aria-busy="true" aria-label="여는 중">
            <Logo height={30} />
          </div>
        }
      >
        <Setup
          user={user}
          example={api.isExample()}
          again={again}
          onDone={() => {
            setAgain(false);
            load();
          }}
          onDeleted={onDeleted}
        />
      </Suspense>
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
        clearNotify().catch(() => null); // 잡아 둔 폰 알림도 지운다(다음 사람에게 울리지 않게)
        setLoginError(null);
        setNotice(null);
        setScreen('login');
      }}
      onDeleted={onDeleted}
    />
  );
}
