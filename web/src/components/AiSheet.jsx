// AI 에이전트 연결(11-19 사람 "타키온이 정리해둔 항목들을 클로드, gpt, gemini가 읽고 답변"): 주소 하나를 AI 앱에 넣으면
// 그 앱이 Tachyon 허락 화면을 띄우고, 허락하면 일정·빈 시간·할 일·eTL·브리핑을 읽고 일정·할 일을 넣는다(worker/13_mcp.js).
// 연결된 앱은 여기서 끊는다(끊으면 그 앱의 토큰이 바로 안 먹는다).
import { useEffect, useRef, useState } from 'react';
import { getAiLinks, unlinkAi } from '../api.js';
import Sheet from './Sheet.jsx';

export default function AiSheet({ onClose }) {
  const [st, setSt] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(null);
  const input = useRef(null);

  const load = () =>
    getAiLinks()
      .then(setSt)
      .catch((err) => setNote(err.message || '불러오지 못했어요'));
  useEffect(() => {
    load();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(st.mcp);
      setNote('주소를 복사했어요');
    } catch {
      input.current?.select();
      setNote('주소를 골라 두었어요. 길게 눌러 복사해 주세요');
    }
  }

  async function unlink(link) {
    setBusy(link.id);
    try {
      await unlinkAi(link.id);
      setNote(`${link.client} 연결을 끊었어요`);
      await load();
    } catch (err) {
      setNote(err.message || '끊지 못했어요. 다시 해 주세요');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title="AI 에이전트 연결" onClose={onClose}>
      <div className="form-grid">
        <p className="hint" style={{ fontSize: 15, lineHeight: '22px', color: 'var(--text)' }}>
          Claude · ChatGPT · Gemini가 내 일정 · 빈 시간 · 할 일 · eTL 공지와 강의자료 · 오늘 브리핑을 읽고, 일정 · 할 일을 넣을 수 있어요. 과목마다 공부방도 열려서 그 AI가 시험 범위의 eTL 자료로 문제를 내며 빈틈을 채워 줘요. 예: “이번 주에 2시간 빈 때 찾아서 스터디 넣어 줘” · “공부방 열어 줘”
        </p>
        <label className="field">
          <span>연결 주소{st?.example ? ' (예시)' : ''}</span>
          <input ref={input} className="input" readOnly value={st?.mcp || ''} onFocus={(e) => e.target.select()} />
        </label>
        {note && (
          <p className="hint" role="status" style={{ color: 'var(--accent-text)' }}>
            {note}
          </p>
        )}
        <ul className="hint" style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Claude(웹 · 데스크톱): 설정 › 커넥터 › 사용자 지정 커넥터 추가 → 주소 붙여 넣기 → 연결. 폰 앱에서도 바로 쓸 수 있어요.</li>
          <li>ChatGPT(웹): 설정 › 앱 › 고급 설정 › 개발자 모드 켜기 → 앱 만들기 → 주소, 인증은 OAuth. 학교 ChatGPT Edu는 관리자가 개발자 모드를 켜야 보여요.</li>
          <li>Gemini CLI: ~/.gemini/settings.json의 mcpServers에 {'{'}"tachyon": {'{'}"httpUrl": "주소"{'}'}{'}'} → /mcp auth tachyon</li>
          <li>Claude Code: claude mcp add --transport http tachyon 주소</li>
        </ul>
        <p className="hint">연결하면 Tachyon 허락 화면이 떠요. 허락하면 AI 앱이 부를 때마다 그 내용이 그 앱의 대화로 가요. 고치기 · 지우기는 못 해요.</p>
        {st?.ready === false && <p className="hint">AI 앱 연결은 아직 준비 중이에요. 곧 열려요.</p>}
        {st?.links?.length > 0 && (
          <>
            <p className="hint" style={{ color: 'var(--text)', fontWeight: 700, marginTop: 8 }}>연결된 앱</p>
            <div className="menu-list">
              {st.links.map((link) => (
                <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {link.client}
                    <span className="hint" style={{ display: 'block' }}>
                      {link.host} · {link.created_at.slice(5, 10).replace('-', '/')} 연결{link.used_at ? ` · ${link.used_at.slice(5, 10).replace('-', '/')}에 씀` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn-text" disabled={busy === link.id} onClick={() => unlink(link)}>
                    끊기
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" disabled={!st} onClick={copy}>
          주소 복사
        </button>
      </div>
    </Sheet>
  );
}
