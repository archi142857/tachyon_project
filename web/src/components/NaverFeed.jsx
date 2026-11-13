// 캘린더 연결의 '네이버 캘린더' 칸(11-13 컨셉, 사람 요청 "네이버 캘린더랑 동기화").
// 네이버는 구독 주소가 없어서 아이디 + 애플리케이션 비밀번호를 받는다(setup.js NAVER). 서버는 CalDAV로 읽기만 한다.
// 연결하면 비밀번호 칸은 바로 비운다. 연결된 뒤에는 '연결됨 · 아이디 앞 두 글자'만 보이고 비밀번호는 다시 보이지 않는다.
import { useState } from 'react';
import { saveFeeds } from '../api.js';
import { NAVER, checkNaver, resultLine, unsavedErrors } from '../setup.js';

export default function NaverFeed({ saved, line: given, disabled, onFeeds }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [error, setError] = useState(null);
  const [line, setLine] = useState(null);
  const [busy, setBusy] = useState(false);
  const shown = line !== null ? line : given;

  async function connect() {
    const r = checkNaver(id, password);
    if (r.empty) {
      setError('네이버 아이디와 애플리케이션 비밀번호를 넣어 주세요');
      return;
    }
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { results, feeds } = await saveFeeds({ naver: { id: r.id, password: r.password } });
      onFeeds(feeds);
      const bad = unsavedErrors(results).naver;
      if (bad) {
        setError(bad);
        return;
      }
      setPassword('');
      setEditing(false);
      setLine(resultLine(results.find((x) => x.kind === 'naver')));
    } catch (err) {
      setError(err.message || '연결하지 못했어요. 잠시 뒤에 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('네이버 캘린더 연결을 끊을까요? Tachyon에 넣어 둔 네이버 일정도 함께 지워져요.')) return;
    setBusy(true);
    try {
      const { feeds } = await saveFeeds({ naver: null });
      onFeeds(feeds);
      setLine(null);
      setError(null);
      setId('');
      setPassword('');
    } catch (err) {
      setError(err.message || '연결을 끊지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  if (saved?.set && !editing && !error)
    return (
      <div className="feed">
        <div className="feed-saved">
          <span className="name">{NAVER.label}</span>
          <span className="tag ok">연결됨</span>
          <span className="addr">{saved.hint}</span>
        </div>
        {shown && (
          <p className={shown.ok ? 'hint' : 'error'} role="status">
            {shown.text}
          </p>
        )}
        <div className="feed-acts">
          <button type="button" className="btn-text quiet" disabled={busy || disabled} onClick={() => setEditing(true)}>
            비밀번호 바꾸기
          </button>
          <button type="button" className="btn-text quiet" disabled={busy || disabled} onClick={remove}>
            연결 끊기
          </button>
        </div>
      </div>
    );

  return (
    <div className="feed">
      <div className="feed-head">
        <label className="feed-name" htmlFor="feed-naver-id">
          {NAVER.label}
        </label>
        <button type="button" className="how-toggle" aria-expanded={howOpen} aria-controls="feed-naver-how" onClick={() => setHowOpen(!howOpen)}>
          찾는 법
        </button>
      </div>
      <input
        id="feed-naver-id"
        className="input"
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        placeholder="네이버 아이디"
        value={id}
        onChange={(e) => setId(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
      />
      <input
        id="feed-naver-password"
        className="input"
        type="password"
        autoComplete="new-password"
        autoCapitalize="off"
        spellCheck="false"
        placeholder="애플리케이션 비밀번호"
        aria-label="네이버 애플리케이션 비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={howOpen ? 'feed-naver-how' : undefined}
        aria-invalid={error ? 'true' : undefined}
      />
      <div className="how-panel" id="feed-naver-how" hidden={!howOpen}>
        <ol>
          {NAVER.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a className="feed-open" href={NAVER.open} target="_blank" rel="noreferrer">
          네이버 내정보 열기 ↗
        </a>
      </div>
      {error && <p className="error">{error}</p>}
      {!error && shown && (
        <p className={shown.ok ? 'hint' : 'error'} role="status">
          {shown.text}
        </p>
      )}
      <p className="hint">네이버 로그인 비밀번호가 아니라 ‘애플리케이션 비밀번호’를 넣어요. 일정을 읽기만 하고 네이버 캘린더에 쓰거나 지우지 않아요.</p>
      <div className="feed-acts">
        {saved?.set && (
          <button
            type="button"
            className="btn-text quiet"
            onClick={() => {
              setEditing(false);
              setError(null);
              setPassword('');
            }}
          >
            그대로 두기
          </button>
        )}
        <button type="button" className="btn-line" disabled={busy || disabled} onClick={connect}>
          {busy ? '연결해 보는 중…' : '연결'}
        </button>
      </div>
    </div>
  );
}
