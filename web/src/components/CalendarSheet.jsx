// 폰 달력에서 보기: Tachyon에 넣은 일정·마감을 폰 달력에서 보게 한다.
// - 안드로이드 앱: 폰 안 'Tachyon' 캘린더에 직접 쓴다(켜기·끄기, native.js — 11-10 컨셉, 사람 요청 "달력도 자동으로 동기화").
// - 그 밖(아이폰·PC·브라우저): 사람마다 다른 구독 주소(8_calendar_feed.js). 아이폰은 '폰 달력에 추가', 구글 캘린더는 '구글 캘린더'(웹에서 한 번 누르기).
// - 구글 캘린더 실시간 연동(11-18 사람 "구글/노션 캘린더랑 연동되어서 실시간으로 둘 다 반영"): 맨 위 GoogleSync. 연동하면 일정은 구글로 바로 가고
//   구독 주소·폰 'Tachyon' 캘린더에는 할 일 마감만 남는다(겹치지 않게, 12_gcal.js).
// 주소는 사람마다 다른 비밀이라 화면에만 보이고, 오류 보고·로그 어디에도 남기지 않는다.
import { useEffect, useRef, useState } from 'react';
import { disconnectGcal, gcalConnectUrl, getCalendarFeed, getGcal, googleSubscribeLink, syncGcal } from '../api.js';
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
    <Sheet title="구글 캘린더 연동·폰 달력" onClose={onClose}>
      <div className="form-grid">
        <GoogleSync app={app} />
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

// 구글 캘린더 연동: 연결 → 구글 동의 화면 → /?gcal=ok 로 돌아옴. 앱 안 화면에서는 구글이 로그인 창을 막아서 브라우저에서 하게 한다
function GoogleSync({ app }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    getGcal()
      .then(setSt)
      .catch(() => setNote('연동 상태를 불러오지 못했어요'));
  }, []);

  async function run(job, done) {
    setBusy(true);
    setNote(null);
    try {
      await job();
      setSt(await getGcal());
      setNote(done);
    } catch (err) {
      setNote(err.message || '하지 못했어요. 다시 해 주세요');
    } finally {
      setBusy(false);
      setSure(false);
    }
  }

  const broken = st?.error === 'reconnect';
  const connect = app ? (
    <p className="hint" style={{ margin: 0 }}>앱 안에서는 구글이 연결 창을 막아요. 폰이나 컴퓨터의 브라우저에서 Tachyon에 들어가 연결해 주세요. 한 번 연결하면 앱에도 그대로 맞춰져요.</p>
  ) : st?.ready && !st.example ? (
    <a className="btn" href={gcalConnectUrl()} style={{ ...linkButton, justifySelf: 'start' }}>
      {broken ? '다시 연결' : '구글 캘린더 연결'}
    </a>
  ) : (
    <button type="button" className="btn" disabled style={{ justifySelf: 'start' }}>
      {st?.example ? '구글 캘린더 연결(예시라 안 됨)' : '구글 캘린더 연결(준비 중)'}
    </button>
  );

  return (
    <div style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>구글 캘린더와 실시간 연동 {st?.linked && !broken ? '· 켜짐' : ''}</p>
      <p className="hint" style={{ margin: 0 }}>
        {st?.linked
          ? '구글 캘린더에서 바꾸면 Tachyon에, Tachyon에서 바꾸면 구글 캘린더에 바로 반영돼요. 노션 캘린더도 이 구글 캘린더를 보여 줘서 같이 맞춰져요. 아래 구독 주소·폰 캘린더에는 이제 할 일 마감만 들어가요.'
          : '구글 캘린더(그리고 그걸 보여 주는 노션 캘린더)와 일정을 양쪽으로 바로 맞춰요. 어느 쪽에서 넣거나 고치거나 지워도 다른 쪽에 반영돼요.'}
      </p>
      {broken && <p className="error" style={{ margin: 0 }}>구글 연결이 끊겼어요. 다시 연결해 주세요.</p>}
      {note && (
        <p className="hint" role="status" style={{ margin: 0, color: 'var(--accent-text)' }}>
          {note}
        </p>
      )}
      {st?.linked && !broken ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" disabled={busy} onClick={() => run(syncGcal, '구글 캘린더와 맞췄어요')}>
            지금 맞추기
          </button>
          <button type="button" className="btn-text danger" disabled={busy} onClick={() => (sure ? run(disconnectGcal, '연동을 끊었어요. Tachyon이 구글에 넣은 일정은 지웠어요') : setSure(true))}>
            {sure ? '한 번 더 누르면 끊어요' : '연동 끊기'}
          </button>
          {st.pulled_at && <span className="hint">마지막으로 맞춘 때 {st.pulled_at.slice(5, 16).replace('T', ' ')}</span>}
        </div>
      ) : (
        st && connect
      )}
    </div>
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
