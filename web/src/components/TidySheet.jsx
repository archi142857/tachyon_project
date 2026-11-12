// 지금 정리(11-13 사람 피드백 10 '할 일 바로 정리' · 15 '메모 더 똑똑하게 정리', AI 0ea4fff, 시연 9판 '지금 정리 · 정리 보기 · 이대로 정리하기').
// 밤 정리(01:30)를 기다리지 않고 지금: 창을 열면 정리 보기(아무것도 안 바뀜) → 줄마다 넣을지 고르고 → '이대로 정리하기'.
// 할 일이 될 메모는 줄마다 '그대로(AI 마감) · 오늘 · 내일 · 일주일 안 · 빼기'(결정 '메모 정리', 9판). 고른 마감은 서버가 그대로 넣는다(worker 4_night keepDue).
// AI 한 번이라 몇 초~수십 초 걸린다. 10분에 5번까지(429) · AI 없음(503) · 실패(502)는 서버 문장 그대로.
import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { minutesLabel } from '../tasks.js';
import { dateKey } from '../density.js';
import { addDays, hhmm, shortDate } from '../time.js';
import Sheet from './Sheet.jsx';

const WHEN = [
  ['ai', '그대로'],
  [0, '오늘'],
  [1, '내일'],
  [7, '일주일 안'],
  ['skip', '빼기'],
];
const dueText = (due) => (!due ? '마감 없음' : due.length <= 10 ? `마감 ${shortDate(`${due}T23:59:00+09:00`)}` : `마감 ${shortDate(due)} ${hhmm(due)}`);

export default function TidySheet({ onClose, onDone }) {
  const [res, setRes] = useState(null); // { plan, summary }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState(() => new Set()); // 뺄 줄: 'm<id>' | 't<id>'
  const [when, setWhen] = useState({}); // 할 일 메모 id → 0 | 1 | 7(오늘부터 며칠 뒤까지). 없으면 AI가 읽은 마감

  useEffect(() => {
    let live = true;
    api.tidyNow().then(
      (r) => live && setRes(r),
      (err) => live && setError(err.message || '정리하지 못했어요. 잠시 뒤에 다시 해 주세요'),
    );
    return () => {
      live = false;
    };
  }, []);

  const plan = res?.plan;
  const rows = plan ? plan.memos.length + plan.tasks.length : 0;
  const toggle = (key) =>
    setSkip((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const dueOf = (m) => (m.task && when[m.id] != null ? dateKey(addDays(new Date(), when[m.id])) : m.due);
      const chosen = { memos: plan.memos.filter((m) => !skip.has(`m${m.id}`)).map((m) => ({ ...m, due: dueOf(m) })), tasks: plan.tasks.filter((t) => !skip.has(`t${t.id}`)) };
      const r = await api.tidyApply(chosen);
      onDone(r.summary || '정리했어요');
    } catch (err) {
      setError(err.message || '정리하지 못했어요. 다시 해 주세요');
      setBusy(false);
    }
  }

  return (
    <Sheet title="지금 정리" onClose={onClose} front>
      {!res && !error && (
        <p className="hint" aria-live="polite">
          아직 정리 안 한 메모와 걸리는 시간을 모르는 할 일을 살펴보는 중이에요. 몇 초~수십 초 걸려요…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {res && (
        <>
          <p className="tidy-summary">{res.summary}</p>
          {rows > 0 && <p className="hint">할 일은 언제까지 할지 고르고, 빼고 싶은 줄은 ‘빼기’나 체크를 풀어요. 뺀 메모는 그대로 남아요.</p>}
          {rows > 0 && (
            <ul className="tidy-list">
              {plan.memos.map((m) => (
                <li key={`m${m.id}`}>
                  {m.task ? (
                    <div className="tidy-row">
                      <span className="tidy-text">
                        <span className="tidy-from">‘{m.text}’</span>
                        <span className="tidy-to">
                          할 일 <b>{m.title}</b> · {when[m.id] != null ? `마감 ${shortDate(addDays(new Date(), when[m.id]))}` : dueText(m.due)} · {minutesLabel(m.minutes)}
                          {m.ready === 'after' ? ' · 수업·자료 뒤' : ''}
                        </span>
                        <span className="seg" role="group" aria-label={`‘${m.title}’ 언제까지`}>
                          {WHEN.map(([k, label]) => {
                            const on = skip.has(`m${m.id}`) ? k === 'skip' : k === 'ai' ? when[m.id] == null : when[m.id] === k;
                            const pick = () => {
                              setSkip((s0) => {
                                const next = new Set(s0);
                                if (k === 'skip') next.add(`m${m.id}`);
                                else next.delete(`m${m.id}`);
                                return next;
                              });
                              if (k !== 'skip') setWhen((w) => ({ ...w, [m.id]: k === 'ai' ? undefined : k }));
                            };
                            return (
                              <button key={k} type="button" aria-pressed={on} onClick={pick}>
                                {label}
                              </button>
                            );
                          })}
                        </span>
                      </span>
                    </div>
                  ) : (
                  <label className="tidy-row">
                    <input type="checkbox" checked={!skip.has(`m${m.id}`)} onChange={() => toggle(`m${m.id}`)} />
                    <span className="tidy-text">
                      <span className="tidy-from">‘{m.text}’</span>
                      <span className="tidy-to">
                        {m.answered === false ? (
                          '이번엔 못 읽었어요 — 밤 정리가 다시 봐요'
                        ) : (
                          '그냥 메모로 둬요'
                        )}
                      </span>
                    </span>
                  </label>
                  )}
                </li>
              ))}
              {plan.tasks.map((t) => (
                <li key={`t${t.id}`}>
                  <label className="tidy-row">
                    <input type="checkbox" checked={!skip.has(`t${t.id}`)} onChange={() => toggle(`t${t.id}`)} />
                    <span className="tidy-text">
                      <span className="tidy-from">할 일 ‘{t.title}’</span>
                      <span className="tidy-to">걸리는 시간 {minutesLabel(t.minutes)}로 채워요</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="sheet-actions">
            {rows > 0 && (
              <button type="button" className="btn" disabled={busy || skip.size === rows} onClick={apply}>
                {busy ? '정리하는 중…' : '이대로 정리하기'}
              </button>
            )}
            <button type="button" className="btn-text quiet" onClick={onClose}>
              {rows > 0 ? '그만두기' : '닫기'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
