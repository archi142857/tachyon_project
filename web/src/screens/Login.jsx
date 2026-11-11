// 로그인: 구글 로그인(이름·이메일만). 서버 없이 보려면 '예시로 둘러보기'.
// 서울대 구글 계정(@snu.ac.kr)으로 하라고 안내만 한다(11-11 사람 요청). 막지는 않는다: 팀원 개인 계정과 구글 시험 사용자 목록이 걸려서.
import { LOGIN_URL } from '../api.js';
import Logo from '../components/Logo.jsx';
import { appLogin, inApp } from '../native.js';

// 아이폰 홈 화면 앱(사파리와 쿠키가 따로)인지
const iosHomeApp = () => window.navigator.standalone === true && /iPhone|iPad/.test(navigator.userAgent);

export default function Login({ error, notice, onExample }) {
  return (
    <main className="center-page">
      <div className="card login">
        <h1 className="wordmark">
          <Logo height={40} />
        </h1>
        <p className="lead">메모하면 달력과 할 일로 정리해 줘요.</p>
        {notice && (
          <p className="hint" role="status">
            {notice}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <p className="school">
          서울대 구글 계정(<b>@snu.ac.kr</b>)으로 로그인해 주세요.
        </p>
        {/* 앱 안에서는 폰 브라우저로 나가 로그인하고 돌아온다(native.js) */}
        <a className="btn" href={LOGIN_URL} onClick={inApp() ? (e) => (e.preventDefault(), appLogin()) : undefined} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          학교 구글 계정으로 로그인
        </a>
        <button type="button" className="btn-text" onClick={onExample}>
          예시로 둘러보기
        </button>
        <p className="hint">계정 고르는 화면에 학교 계정이 없으면 ‘다른 계정 사용’을 눌러 주세요. 구글에서는 이름과 이메일만 받아요.</p>
        {iosHomeApp() && <p className="hint">아이폰 홈 화면 앱에서 로그인이 안 되면, 사파리에서 로그인한 뒤 홈 화면에 다시 추가해 주세요.</p>}
      </div>
    </main>
  );
}
