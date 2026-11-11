// 시작 화면(시연 9판): 로그인 · 첫 설정. '입자' · '종이' 테마를 고른 기기에서만 보인다.
// 로그인은 원래 화면(Login.jsx)과 같은 길(학교 구글 계정)만 쓴다. 학교 아이디·비밀번호를 우리 화면에서 받지 않는다.
import { LOGIN_URL } from '../api.js';
import { appLogin, inApp } from '../native.js';
import Setup from '../screens/Setup.jsx';
import { PAL, usePhone, useSkin } from './skin.jsx';
import './ours.css';

const POINTS = [
  [PAL[0], '메모', '생각나는 대로 한 줄만 적어요'],
  [PAL[1], '달력', '날짜나 시각이 있으면 달력에 이어 드려요'],
  [PAL[4], '할 일', '마감과 빈 시간을 보고 오늘 할 자리를 넣어 봐요'],
];

function Frame({ children }) {
  const skin = useSkin();
  const phone = usePhone();
  return <div className={`ty9 y-start${phone ? ' y-ph' : ''}${skin === '종이' ? ' y-lt' : ''}`}>{children}</div>;
}

export function OursLogin({ error, notice, onExample }) {
  const iosHome = window.navigator.standalone === true && /iPhone|iPad/.test(navigator.userAgent);
  return (
    <Frame>
      <div className="y-ob">
        <div>
          <div className="y-logo">Tachyon</div>
          <h1>메모하면 달력과 할 일로 정리해 줘요.</h1>
          <div className="y-rows">
            {POINTS.map(([color, title, sub]) => (
              <div key={title} className="y-row">
                <i className="y-dot" style={{ '--c': color }} />
                <div>
                  <b>{title}</b>
                  <small>{sub}</small>
                </div>
              </div>
            ))}
          </div>
          {notice && (
            <p className="y-obk" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="y-obk y-err" role="alert">
              {error}
            </p>
          )}
          <small>
            서울대 구글 계정(<b>@snu.ac.kr</b>)으로 로그인해 주세요.
          </small>
          <a className="y-wb" href={LOGIN_URL} onClick={inApp() ? (e) => (e.preventDefault(), appLogin()) : undefined}>
            학교 구글 계정으로 로그인
          </a>
          <button type="button" className="y-gb" onClick={onExample}>
            예시로 둘러보기
          </button>
          <small>계정 고르는 화면에 학교 계정이 없으면 ‘다른 계정 사용’을 눌러 주세요. 구글에서는 이름과 이메일만 받아요.</small>
          {iosHome && <small>아이폰 홈 화면 앱에서 로그인이 안 되면, 사파리에서 로그인한 뒤 홈 화면에 다시 추가해 주세요.</small>}
        </div>
      </div>
    </Frame>
  );
}

// 첫 설정: 묻는 것과 저장은 원래 화면(Setup)을 그대로 쓰고, 틀만 우리 것
export function OursSetup(props) {
  return (
    <Frame>
      <div className="y-ob y-set">
        <div>
          <div className="y-logo">Tachyon</div>
          <h1>{props.again ? '연결과 학과를 고쳐요.' : '처음 한 번만 알려 주세요.'}</h1>
          {props.example && <p className="y-obk">예시 자료로 둘러보는 중이에요</p>}
          <div className="y-host">
            <Setup {...props} />
          </div>
        </div>
      </div>
    </Frame>
  );
}
