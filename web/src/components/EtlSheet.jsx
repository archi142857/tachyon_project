// eTL 연결(선택)과 강의자료·공지 목록 (서버 worker/9_etl.js).
// 토큰은 학생이 eTL에서 직접 만든다: eTL → 계정 → 설정 → '승인된 통합' → '+ 새 액세스 토큰'.
// '이건 eTL 비밀번호가 아니에요'를 크게 보인다(비밀번호를 넣을 뻔한 일이 있었음 — 팀원 11-10). 서버도 짧은 글은 eTL에 보내지 않는다.
// 강의자료는 목록 + eTL 링크만(앱 서버에 복사하지 않음, 11-10). 링크는 eTL에 로그인해야 열린다.
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { kst } from '../time.js';
import Sheet from './Sheet.jsx';

const SETTINGS_URL = 'https://myetl.snu.ac.kr/profile/settings';
const TAG = { exam: '시험', cancel: '휴강', makeup: '보강' };

// '11월 10일 16:05'
function when(iso) {
  if (!iso) return '';
  const p = kst(iso);
  return `${p.m}월 ${p.d}일 ${p.h}:${String(p.min).padStart(2, '0')}`;
}

function errorText(err) {
  if (err && err.status === 503) return 'eTL 연결은 준비 중이에요. 곧 열려요';
  return (err && err.message) || '하지 못했어요. 다시 해 주세요';
}

function ConnectForm({ busy, onConnect }) {
  const [token, setToken] = useState('');
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) onConnect(token.trim());
      }}
    >
      <p style={{ fontSize: 16, lineHeight: '24px' }}>eTL의 과제·공지·강의자료를 자동으로 가져와요. 하지 않아도 돼요(선택).</p>
      <p className="warn-box" role="note">
        이건 eTL 비밀번호가 아니에요. 비밀번호는 넣지 마세요.
      </p>
      <ol className="etl-steps">
        <li>
          PC 웹에서{' '}
          <a href={SETTINGS_URL} target="_blank" rel="noopener noreferrer">
            eTL 설정
          </a>{' '}
          열기(왼쪽 ‘계정’ → ‘설정’)
        </li>
        <li>아래쪽 ‘승인된 통합’에서 ‘+ 새 액세스 토큰’</li>
        <li>용도에 ‘Tachyon’, 만료일은 비우거나 학기 끝 날짜 → ‘토큰 생성’</li>
        <li>나온 긴 글(숫자~영문)을 복사해 아래에 붙여 넣기</li>
      </ol>
      <label className="field">
        <span>eTL 액세스 토큰</span>
        <input
          className="input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="예: 1234~AbCd…"
        />
      </label>
      <p className="hint">토큰은 잠가서 저장하고 다시 보이지 않아요. ‘연결 끊기’를 누르거나 eTL 설정에서 토큰을 지우면 바로 끊겨요.</p>
      <div className="sheet-actions">
        <button type="submit" className="btn" disabled={busy || !token.trim()}>
          {busy ? '확인하는 중…' : '연결'}
        </button>
      </div>
    </form>
  );
}

function ItemList({ items, empty, notices }) {
  if (!items.length) return <p className="hint">{empty}</p>;
  return (
    <ul className="etl-list">
      {items.map((it) => (
        <li key={it.id}>
          <a href={it.url || SETTINGS_URL} target="_blank" rel="noopener noreferrer">
            <span className="etl-title">
              {notices && TAG[it.tag] && <span className={`etl-tag ${it.tag}`}>{TAG[it.tag]}</span>}
              {it.title}
            </span>
            <span className="hint">
              {it.course}
              {it.posted_at ? ` · ${when(it.posted_at)}` : ''}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function EtlSheet({ onClose, onChanged }) {
  const [state, setState] = useState(null);
  const [items, setItems] = useState({ notices: [], files: [] });
  const [tab, setTab] = useState('files');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [sure, setSure] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.getEtl();
      setState(s);
      if (s.connected) setItems(await api.getEtlItems());
    } catch (err) {
      setState({ connected: false });
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(job, done) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await job();
      if (done) setNote(done(r));
      await load();
      onChanged && onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setSure(false);
    }
  }

  const resultText = (r) => {
    const x = r && r.result;
    if (!x) return null;
    if (x.recent) return '방금 받았어요';
    if (!x.ok) return x.error || null;
    return `과목 ${x.courses}개 · 과제 ${x.tasks}개 · 공지 ${x.notices}개 · 강의자료 ${x.files}개를 받았어요`;
  };

  return (
    <Sheet title="eTL 연결" onClose={onClose}>
      {!state && <p className="hint">불러오는 중…</p>}
      {state && (!state.connected || state.dead) && (
        <>
          {state.dead && (
            <p className="error" role="alert">
              {state.last_error || 'eTL 연결이 끊겼어요. 새 토큰으로 다시 연결해 주세요'}
            </p>
          )}
          <ConnectForm busy={busy} onConnect={(token) => run(() => api.connectEtl(token), resultText)} />
        </>
      )}
      {state && state.connected && !state.dead && (
        <div className="form-grid">
          <p style={{ fontSize: 15, lineHeight: '22px' }}>
            연결됨{state.last_ok_at ? ` · 마지막으로 받은 때 ${when(state.last_ok_at)}` : ''}
          </p>
          {state.last_error && <p className="error">{state.last_error}</p>}
          <div className="seg" role="tablist" aria-label="eTL 목록">
            <button type="button" role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'on' : undefined} onClick={() => setTab('files')}>
              강의자료 <span className="num">{state.counts?.file ?? items.files.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'notices'} className={tab === 'notices' ? 'on' : undefined} onClick={() => setTab('notices')}>
              공지 <span className="num">{state.counts?.notice ?? items.notices.length}</span>
            </button>
          </div>
          {tab === 'files' ? (
            <ItemList items={items.files} empty="이번 학기 강의자료가 아직 없어요" />
          ) : (
            <ItemList items={items.notices} empty="최근 30일 공지가 없어요" notices />
          )}
          <p className="hint">눌러서 eTL에서 열어요(eTL에 로그인돼 있어야 해요). 공지에서 찾은 시험·휴강·보강은 달력에 넣었어요 — 틀리면 달력에서 고치거나 지우세요.</p>
          <div className="sheet-actions">
            <button type="button" className="btn-text danger" disabled={busy} onClick={() => (sure ? run(() => api.disconnectEtl(), () => '연결을 끊고 받은 목록을 지웠어요') : setSure(true))}>
              {sure ? '한 번 더 누르면 끊어요' : '연결 끊기'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.collectEtl(), resultText)}>
              {busy ? '받는 중…' : '지금 받기'}
            </button>
          </div>
        </div>
      )}
      {note && <p className="hint" role="status">{note}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
