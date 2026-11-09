// 로그인: 구글 로그인(이름·이메일만). 서버 없이 보려면 '예시로 둘러보기'.
import { LOGIN_URL } from '../api.js';

// 아이폰 홈 화면 앱(사파리와 쿠키가 따로)인지
const iosHomeApp = () => window.navigator.standalone === true && /iPhone|iPad/.test(navigator.userAgent);

export default function Login({ error, onExample }) {
  return (
    <main className="center-page">
      <div className="card login">
        <h1 className="wordmark">Tachyon</h1>
        <p className="lead">메모하면 달력과 할 일로 정리해 줘요.</p>
        {error && <p className="error">{error}</p>}
        <a className="btn" href={LOGIN_URL} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          구글로 로그인
        </a>
        <button type="button" className="btn-text" onClick={onExample}>
          예시로 둘러보기
        </button>
        <p className="hint">구글에서는 이름과 이메일만 받아요.</p>
        {iosHomeApp() && <p className="hint">아이폰 홈 화면 앱에서 로그인이 안 되면, 사파리에서 로그인한 뒤 홈 화면에 다시 추가해 주세요.</p>}
      </div>
    </main>
  );
}
