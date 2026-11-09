// 폰 달력에서 보기: Tachyon에 넣은 일정·마감을 폰 달력이 구독하는 내 주소(8_calendar_feed.js).
// 주소는 사람마다 다른 비밀이라 화면에만 보이고, 오류 보고·로그 어디에도 남기지 않는다.
import { useEffect, useRef, useState } from 'react';
import { getCalendarFeed } from '../api.js';
import Sheet from './Sheet.jsx';

export default function CalendarSheet({ onClose }) {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null); // 복사 결과(창이 맨 위라 스낵바 대신 창 안에 보인다)
  const input = useRef(null);

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
        {error && <p className="error">{error}</p>}
        {feed && (
          <>
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
              <li>아이폰: 아래 '폰 달력에 추가'를 누르면 구독 창이 떠요.</li>
              <li>안드로이드·구글 캘린더: 컴퓨터에서 calendar.google.com → 다른 캘린더 + → URL로 추가에 붙여 넣어요. 바뀐 것이 몇 시간 늦게 보일 수 있어요.</li>
            </ul>
          </>
        )}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn-text" disabled={!feed} onClick={copy}>
          주소 복사
        </button>
        {feed && !feed.example ? (
          <a className="btn" href={feed.webcal} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            폰 달력에 추가
          </a>
        ) : (
          <button type="button" className="btn" disabled>
            폰 달력에 추가
          </button>
        )}
      </div>
    </Sheet>
  );
}
