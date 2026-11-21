// '활동' 쪽(11-19 사람 "서울대 비교과나 … 활동 / 행사 안내들을 내가 신청할 수 있거나 관심사에 맞춰서 모아볼 수 있는 섹션", 메일은 보류).
// 서버(worker/15_activities.js)가 SNU 캘린더 · 일반공지(공개 페이지)에서 모은 카드를 보여 주고, 이 기기에서 거른다(activities.js):
// 탭 전체 · 신청 가능 · 관심사 · 별표, 종류 칩, '시간 되는 것만'(행사 시각이 내 일정과 안 겹침).
// 카드: 종류 · 마감 · 이름(원문 링크) · 한 줄 · 행사 때 · 대상(+ 안 맞으면 까닭) · 단추(별표 · 신청 마감 할 일로 · 일정에 넣기 · 숨기기).
// 서버가 새 글을 읽는 중이면(refreshing) 10초 뒤 다시 받는다(최대 12번).
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import { deadlineText, eventFor, fitFor, freeAt, loadPrefs, matchesInterest, parseWords, periodText, savePrefs, taskFor, toggle, view, whenText } from '../activities.js';
import { kst } from '../time.js';

const TABS = [
  ['all', '전체'],
  ['can', '신청 가능'],
  ['mine', '관심사'],
  ['star', '별표'],
];

const updatedText = (iso) => {
  if (!iso) return null;
  const p = kst(iso);
  return `${p.m}/${p.d} ${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')} 기준`;
};

function InterestEditor({ kinds, prefs, onSave, onClose }) {
  const [chosen, setChosen] = useState(() => new Set(prefs.kinds));
  const [words, setWords] = useState(prefs.words.join(', '));
  return (
    <section className="card act-interest" aria-label="관심사 고르기">
      <p className="act-interest-title">관심 있는 종류</p>
      <div className="act-chips" role="group" aria-label="관심 종류">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className="act-chip"
            aria-pressed={chosen.has(k)}
            onClick={() =>
              setChosen((s) => {
                const next = new Set(s);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
              })
            }
          >
            {k}
          </button>
        ))}
      </div>
      <label className="act-interest-title" htmlFor="act-words">
        관심 키워드 <small>쉼표로 나눠요 · 제목 · 태그 · 요약에서 찾아요</small>
      </label>
      <input id="act-words" className="input" value={words} maxLength={200} placeholder="예: 바이오, AI, 글쓰기, 해외" onChange={(e) => setWords(e.target.value)} />
      <div className="act-interest-actions">
        <button type="button" className="btn" onClick={() => onSave({ kinds: [...chosen], words: parseWords(words) })}>
          저장
        </button>
        <button type="button" className="btn-text" onClick={onClose}>
          닫기
        </button>
      </div>
    </section>
  );
}

function ActivityCard({ item, me, events, now, starred, onStar, onHide, onTask, onEvent, added }) {
  const fit = fitFor(item, me, now);
  const due = deadlineText(item, now);
  const when = whenText(item);
  const { free, clash } = freeAt(item, events);
  const task = taskFor(item);
  const event = eventFor(item);
  return (
    <article className={`card act-card${fit.ok ? '' : ' act-off'}`}>
      <div className="act-top">
        <span className="tag">{item.kind || item.src}</span>
        {due && <span className={`act-due${/^(오늘|내일|D-[1-3] )/.test(due) ? ' soon' : ''}`}>{due}</span>}
        <span className="grow" />
        <button type="button" className="act-star" aria-pressed={starred} aria-label={starred ? '별표 빼기' : '별표'} title={starred ? '별표 빼기' : '별표'} onClick={onStar}>
          {starred ? '★' : '☆'}
        </button>
      </div>
      <h3 className="act-title">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}
        </a>
      </h3>
      {item.summary && item.summary !== item.title && <p className="act-summary">{item.summary}</p>}
      <dl className="act-rows">
        {when ? (
          <>
            <dt>행사</dt>
            <dd>
              {when}
              {item.place ? ` · ${item.place}` : ''}
              {free === true && <span className="act-free"> · 시간 돼요</span>}
              {free === false && <span className="act-clash"> · ‘{clash}’와 겹쳐요</span>}
            </dd>
          </>
        ) : (
          periodText(item) && (
            <>
              <dt>기간</dt>
              <dd>
                {periodText(item)}
                {item.place ? ` · ${item.place}` : ''}
              </dd>
            </>
          )
        )}
        {(item.who || !fit.ok) && (
          <>
            <dt>대상</dt>
            <dd>
              {item.who || '원문 확인'}
              {!fit.ok && <span className="act-why"> · {fit.why}</span>}
            </dd>
          </>
        )}
      </dl>
      <div className="act-actions">
        {task && (
          <button type="button" className="btn-text" disabled={added.task} onClick={onTask}>
            {added.task ? '할 일에 넣음' : '마감을 할 일에 넣기'}
          </button>
        )}
        {event && (
          <button type="button" className="btn-text" disabled={added.event} onClick={onEvent}>
            {added.event ? '일정에 넣음' : '일정에 넣기'}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn-text quiet" onClick={onHide}>
          숨기기
        </button>
      </div>
      <p className="act-src">
        {item.src} · <a href={item.url} target="_blank" rel="noopener noreferrer">원문 보기</a>
      </p>
    </article>
  );
}

export default function ActivitiesPage({ events = [], now = new Date(), onSnack, onChanged }) {
  const [data, setData] = useState(null); // { items, kinds, updated_at, refreshing, waiting }
  const [error, setError] = useState(null);
  const [me, setMe] = useState({});
  const [prefs, setPrefs] = useState(loadPrefs);
  const [tab, setTab] = useState('all');
  const [kind, setKind] = useState(null);
  const [free, setFree] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [added, setAdded] = useState({}); // id → { task, event } — 이번에 넣은 것(단추를 '넣음'으로)

  const load = useCallback(() => api.getActivities().then(setData, (err) => setError(err.message || '활동을 불러오지 못했어요')), []);
  useEffect(() => {
    load();
    api.getMe().then((u) => setMe({ dept: u?.dept || null, year: Number.isInteger(u?.year) ? u.year : null }), () => {});
  }, [load]);
  // 서버가 새 글을 읽는 중이면 10초 뒤 다시(최대 12번 — 처음 모을 때 2분쯤)
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!data?.refreshing || polls >= 12) return undefined;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, 10000);
    return () => clearTimeout(t);
  }, [data, polls, load]);

  const save = (next) => {
    setPrefs(next);
    savePrefs(next);
  };
  const items = data?.items || [];
  const shown = useMemo(() => view(items, { tab, kind, free }, { prefs, me, events, now }), [items, tab, kind, free, prefs, me, events, now]);
  const hidden = items.filter((i) => prefs.hide.includes(i.id));
  const counts = useMemo(
    () => ({ can: items.filter((i) => !prefs.hide.includes(i.id) && fitFor(i, me, now).ok).length, mine: items.filter((i) => !prefs.hide.includes(i.id) && matchesInterest(i, prefs)).length, star: prefs.star.filter((id) => items.some((i) => i.id === id)).length }),
    [items, prefs, me, now],
  );

  async function addTask(item) {
    try {
      await api.createTask(taskFor(item));
      setAdded((a) => ({ ...a, [item.id]: { ...a[item.id], task: true } }));
      onSnack?.(`‘${item.title}’ 신청 마감을 할 일에 넣었어요`);
      onChanged?.('tasks');
    } catch (err) {
      onSnack?.(err.message || '할 일에 넣지 못했어요');
    }
  }
  async function addEvent(item) {
    try {
      await api.createEvent(eventFor(item));
      setAdded((a) => ({ ...a, [item.id]: { ...a[item.id], event: true } }));
      onSnack?.(`‘${item.title}’ 일정에 넣었어요`);
      onChanged?.('events');
    } catch (err) {
      onSnack?.(err.message || '일정에 넣지 못했어요');
    }
  }

  if (error) {
    return (
      <div className="activities">
        <section className="card act-empty">
          <h2 className="card-title">활동</h2>
          <p>{error}</p>
          <button type="button" className="btn-text" onClick={() => (setError(null), load())}>
            다시 시도
          </button>
        </section>
      </div>
    );
  }

  const kinds = data?.kinds || [];
  return (
    <div className="activities" aria-busy={!data}>
      <header className="act-head">
        <div>
          <h2 className="card-title">활동</h2>
          <p className="act-note">
            SNU 캘린더 · 일반공지에서 모아요{data?.updated_at ? ` · ${updatedText(data.updated_at)}` : ''}
            {data?.refreshing ? ` · 새 글 읽는 중${data.waiting ? `(${data.waiting}개 남음)` : ''}…` : ''}
          </p>
        </div>
        <button type="button" className="btn-text" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          관심사{prefs.kinds.length + prefs.words.length ? ` ${prefs.kinds.length + prefs.words.length}` : ''}
        </button>
      </header>

      {editing && (
        <InterestEditor
          kinds={kinds}
          prefs={prefs}
          onClose={() => setEditing(false)}
          onSave={(p) => {
            save({ ...prefs, ...p });
            setEditing(false);
            setTab('mine');
          }}
        />
      )}

      <nav className="act-tabs" aria-label="활동 필터">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
            {key !== 'all' && counts[key] > 0 && <span className="count num">{counts[key]}</span>}
          </button>
        ))}
        <label className="act-free-toggle">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
          시간 되는 것만
        </label>
      </nav>
      <div className="act-chips act-kinds" role="group" aria-label="종류">
        <button type="button" className="act-chip" aria-pressed={!kind} onClick={() => setKind(null)}>
          모든 종류
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" className="act-chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
            {k}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="act-note">불러오는 중…</p>
      ) : tab === 'mine' && !prefs.kinds.length && !prefs.words.length ? (
        <section className="card act-empty">
          <p>관심사를 고르면 맞는 것만 모아 보여요.</p>
          <button type="button" className="btn-text" onClick={() => setEditing(true)}>
            관심사 고르기
          </button>
        </section>
      ) : shown.length === 0 ? (
        <section className="card act-empty">
          <p>{items.length ? '여기에 맞는 활동이 없어요. 필터를 바꿔 보세요.' : data.refreshing ? '서울대 게시판에서 활동을 모으는 중이에요. 잠시 뒤 채워져요.' : '아직 모은 활동이 없어요.'}</p>
        </section>
      ) : (
        <div className="act-list">
          {shown.map((item) => (
            <ActivityCard
              key={item.id}
              item={item}
              me={me}
              events={events}
              now={now}
              starred={prefs.star.includes(item.id)}
              added={added[item.id] || {}}
              onStar={() => save(toggle(prefs, 'star', item.id))}
              onHide={() => {
                save(toggle(prefs, 'hide', item.id));
                onSnack?.('숨겼어요 — 맨 아래 ‘숨긴 것’에서 되돌려요');
              }}
              onTask={() => addTask(item)}
              onEvent={() => addEvent(item)}
            />
          ))}
        </div>
      )}

      {hidden.length > 0 && (
        <section className="act-hidden">
          <button type="button" className="btn-text quiet" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
            숨긴 것 {hidden.length}
          </button>
          {showHidden && (
            <ul>
              {hidden.map((i) => (
                <li key={i.id}>
                  <span>{i.title}</span>
                  <button type="button" className="btn-text" onClick={() => save(toggle(prefs, 'hide', i.id))}>
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className="act-foot">
        AI가 본문에서 읽은 대상 · 마감이라 틀릴 수 있어요. 신청 전에 원문을 꼭 확인해 주세요. 학교 SNU비교과(extra.snu.ac.kr) 프로그램은 로그인이 필요해 여기 모으지 않아요.
      </p>
    </div>
  );
}
