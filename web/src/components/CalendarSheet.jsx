// 폰 달력에서 보기: Tachyon에 넣은 일정·마감을 폰 달력에서 보게 한다.
// - 안드로이드 앱: 폰 안 'Tachyon' 캘린더에 직접 쓴다(켜기·끄기, native.js — 11-10 컨셉, 사람 요청 "달력도 자동으로 동기화").
// - 그 밖(아이폰·PC·브라우저): 사람마다 다른 구독 주소(8_calendar_feed.js). 아이폰은 '폰 달력에 추가', 구글 캘린더는 '구글 캘린더'(웹에서 한 번 누르기).
// 주소는 사람마다 다른 비밀이라 화면에만 보이고, 오류 보고·로그 어디에도 남기지 않는다.
import { useEffect, useRef, useState } from 'react';
import { getCalendarFeed, googleSubscribeLink } from '../api.js';
import { CAL_NAME, inApp, pushOn, pushToDevice, turnPushOff, turnPushOn } from '../native.js';
import Sheet from './Sheet.jsx';

const linkButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' };

export default function CalendarSheet({ onClose }) {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null); // 복사 결과(창이 맨 위라 스낵바 대신 창 안에 보인다)
  const input = useRef(null);
  const app = inApp();

  useEffect(() => {
    getCalendarFeed()
      .then(setFeed)
      .catch((err) => setError(err.message || '주소를 불러오지 못했어요'));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(feed.url);
      setNote('주소를 복사했어요');
    } catch {
      // 복사를 막는 브라우저: 글자를 골라 두고 직접 복사하게 한다
      input.current?.select();
      setNote('주소를 골라 두었어요. 길게 눌러 복사해 주세요');
    }
  }

  return (
    <Sheet title="폰 달력에서 보기" onClose={onClose}>
      <div className="form-grid">
        <p className="hint" style={{ fontSize: 15, lineHeight: '22px', color: 'var(--text)' }}>
          메모·시간표·eTL 일정과 할 일 마감을 폰 달력에서 볼 수 있어요. 구글·애플 캘린더에서 온 일정은 이미 폰에 있어서 빼요.
        </p>
        {app && feed && !feed.example && <PhonePush />}
        {error && <p className="error">{error}</p>}
        {feed && (
          <>
            {app && !feed.example && <p className="hint" style={{ color: 'var(--text)', fontWeight: 700, marginTop: 8 }}>다른 폰·PC에서 보려면: 구독 주소</p>}
            <label className="field">
              <span>내 구독 주소{feed.example ? ' (예시)' : ''}</span>
              <input ref={input} className="input" readOnly value={feed.url} onFocus={(e) => e.target.select()} />
            </label>
            {note && (
              <p className="hint" role="status" style={{ color: 'var(--accent-text)' }}>
                {note}
              </p>
            )}
            <p className="hint">이 주소를 아는 사람은 누구나 내 일정을 볼 수 있어요. 다른 사람에게 보여 주지 마세요.</p>
            <ul className="hint" style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
              {!app && <li>아이폰: 아래 '폰 달력에 추가'를 누르면 구독 창이 떠요.</li>}
              <li>구글 캘린더: 컴퓨터에서 '구글 캘린더'를 누르면 추가할지 물어요(주소를 붙여 넣지 않아도 돼요). 바뀐 것은 구글이 받아 가는 대로 최대 12시간쯤 늦게 보여요.</li>
            </ul>
          </>
        )}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn-text" disabled={!feed} onClick={copy}>
          주소 복사
        </button>
        {feed && !feed.example ? (
          <>
            <a className="btn-text" href={googleSubscribeLink(feed.webcal)} target="_blank" rel="noopener noreferrer" style={linkButton}>
              구글 캘린더
            </a>
            {/* 안드로이드 앱에는 webcal을 여는 곳이 없어서 위의 '이 폰 캘린더에 바로 넣기'를 쓴다 */}
            {!app && (
              <a className="btn" href={feed.webcal} style={linkButton}>
                폰 달력에 추가
              </a>
            )}
          </>
        ) : (
          <button type="button" className="btn" disabled>
            폰 달력에 추가
          </button>
        )}
      </div>
    </Sheet>
  );
}

// 안드로이드 앱에서만: 폰 안 'Tachyon' 캘린더에 직접 쓰기(앱을 열거나 다시 볼 때마다 맞춤)
function PhonePush() {
  const [on, setOn] = useState(pushOn);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  async function run(job) {
    setBusy(true);
    setStatus(null);
    try {
      await job();
    } catch {
      setStatus('폰 캘린더에 넣지 못했어요. 잠시 뒤 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  const NO_PERMISSION = '캘린더 권한이 없어서 못 넣었어요. 폰 설정의 앱 목록에서 Tachyon → 권한 → 캘린더를 허용해 주세요';
  const done = (r) => setStatus(r ? `‘${CAL_NAME}’ 캘린더에 일정 ${r.total}개를 맞췄어요${r.added || r.removed ? ` (새로 ${r.added}개, 뺀 것 ${r.removed}개)` : ''}` : NO_PERMISSION);

  return (
    <div style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>이 폰 캘린더에 바로 넣기 {on ? '· 켜짐' : ''}</p>
      <p className="hint" style={{ margin: 0 }}>
        폰 안에 ‘{CAL_NAME}’ 캘린더를 만들고, 앱을 열 때마다 맞춰요. 구독 주소처럼 몇 시간씩 늦지 않아요. 이 폰에만 있어서 컴퓨터의 구글 캘린더에는 안 보여요. 고치거나 지우는 건 Tachyon에서 해 주세요.
      </p>
      {status && (
        <p className="hint" role="status" style={{ margin: 0, color: 'var(--accent-text)' }}>
          {status}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {on ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => done(await pushToDevice()))}>
              지금 맞추기
            </button>
            <button
              type="button"
              className="btn-text"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await turnPushOff();
                  setOn(false);
                  setStatus(`폰의 ‘${CAL_NAME}’ 캘린더를 지웠어요`);
                })
              }
            >
              끄기
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await turnPushOn();
                if (r) setOn(true);
                done(r);
              })
            }
          >
            켜기
          </button>
        )}
      </div>
    </div>
  );
}
