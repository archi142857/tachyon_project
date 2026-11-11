// '같이' 쪽(11-11 사람 "친구 추가·그룹 만들기·그룹별 when2meet", 서버 10_together.js).
// 넓은 화면 = 왼쪽 친구·그룹, 오른쪽 고른 그룹이나 모임 시간표. 폰 = 목록 → 그룹 → 모임 차례로(뒤로).
// 친구·그룹은 초대 링크로만 맺는다. 남에게는 빈/바쁨만 보인다. 표가 없으면(503) 서버 문장만 보인다.
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { addDays, dateInput, dayStart, shortDate, toKstIso } from '../time.js';
import { bestTimes } from '../meet.js';
import MeetGrid from './MeetGrid.jsx';

const hm = (iso) => iso.slice(11, 16);

// 두 번 눌러야 하는 단추(끊기·나가기·지우기)
function TwoStep({ label, sure, onGo, className = 'btn-text danger' }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" className={className} onClick={() => (armed ? onGo() : setArmed(true))}>
      {armed ? sure : label}
    </button>
  );
}

// 초대 링크 한 칸: 복사·보내기(폰은 공유 창)
function InviteLink({ link, what }) {
  const [note, setNote] = useState(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setNote('복사했어요');
    } catch {
      setNote('주소를 길게 눌러 복사해 주세요');
    }
  }
  async function share() {
    try {
      await navigator.share({ title: 'Tachyon', text: what, url: link.url });
    } catch {
      /* 닫음 */
    }
  }
  return (
    <div className="invite">
      <input className="input" readOnly value={link.url} aria-label="초대 링크" onFocus={(e) => e.target.select()} />
      <div className="invite-actions">
        <button type="button" className="btn-text" onClick={copy}>
          복사
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="btn-text" onClick={share}>
            보내기
          </button>
        )}
        <span className="hint num">
          {link.example ? '예시 링크(받을 수 없어요)' : `${shortDate(link.expiresAt)}까지 · 여러 사람이 써도 돼요`}
          {note ? ` · ${note}` : ''}
        </span>
      </div>
    </div>
  );
}

export default function TogetherPage({ example, now, onSnack }) {
  const [data, setData] = useState(null); // { friends, groups }
  const [error, setError] = useState(null);
  const [view, setView] = useState({ kind: 'home' }); // home | group | meet
  const [friendLink, setFriendLink] = useState(null);
  const [newGroup, setNewGroup] = useState(null); // 만들 그룹 이름(null = 닫힘)

  const load = useCallback(() => {
    api
      .getTogether()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || '같이 쓰기를 불러오지 못했어요'));
  }, []);
  useEffect(load, [load]);
  // 아래 칸들에 넘기는 '뒤로'는 늘 같은 함수여야 다시 불러오기가 되풀이되지 않는다
  const goHome = useCallback(() => setView({ kind: 'home' }), []);
  const backToGroup = useCallback(() => setView((v) => ({ kind: 'group', id: v.groupId, groupId: v.groupId })), []);

  const run = async (job, done) => {
    try {
      const res = await job();
      done?.(res);
    } catch (err) {
      onSnack(err.message || '하지 못했어요. 다시 해 주세요');
    }
  };

  if (error && !data)
    return (
      <div className="together">
        <section className="card together-wait">
          <h2 className="card-title">같이</h2>
          <p className="hint">{error}</p>
          <p className="hint">준비가 끝나면 친구 초대 링크·그룹·모임 시간표가 여기에 생겨요.</p>
        </section>
      </div>
    );
  if (!data) return <div className="together" aria-busy="true" />;

  const side = (
    <div className="together-side">
      <section className="card t-card" aria-labelledby="t-friends">
        <div className="tasks-head">
          <h2 id="t-friends" className="card-title">
            친구
          </h2>
          <span className="tag num">{data.friends.length}</span>
          <span className="grow" />
          <button type="button" className="btn-text" onClick={() => run(api.inviteFriend, setFriendLink)}>
            친구 초대
          </button>
        </div>
        {friendLink && <InviteLink link={friendLink} what="Tachyon에서 친구 해요" />}
        <ul className="t-list">
          {data.friends.map((f) => (
            <li key={f.id}>
              <span className="t-name">{f.name}</span>
              <TwoStep label="끊기" sure="한 번 더 누르면 끊어요" onGo={() => run(() => api.removeFriend(f.id), load)} />
            </li>
          ))}
        </ul>
        {data.friends.length === 0 && <p className="empty">초대 링크를 보내 받은 사람이 열면 친구가 돼요.</p>}
      </section>

      <section className="card t-card" aria-labelledby="t-groups">
        <div className="tasks-head">
          <h2 id="t-groups" className="card-title">
            그룹
          </h2>
          <span className="tag num">{data.groups.length}</span>
          <span className="grow" />
          <button type="button" className="btn-text" onClick={() => setNewGroup(newGroup === null ? '' : null)}>
            {newGroup === null ? '그룹 만들기' : '닫기'}
          </button>
        </div>
        {newGroup !== null && (
          <form
            className="t-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newGroup.trim()) return;
              run(
                () => api.createGroup(newGroup.trim()),
                (res) => {
                  setNewGroup(null);
                  load();
                  setView({ kind: 'group', id: res.group.id });
                },
              );
            }}
          >
            <input className="input" value={newGroup} maxLength={40} placeholder="예: 화학 스터디" aria-label="그룹 이름" onChange={(e) => setNewGroup(e.target.value)} />
            <button type="submit" className="btn" disabled={!newGroup.trim()}>
              만들기
            </button>
          </form>
        )}
        <div className="t-list">
          {data.groups.map((g) => (
            <button key={g.id} type="button" className={`t-row${view.kind !== 'home' && view.groupId === g.id ? ' on' : ''}`} onClick={() => setView({ kind: 'group', id: g.id, groupId: g.id })}>
              <span className="t-name">{g.name}</span>
              <span className="hint num">
                {g.members}명{g.owner ? ' · 방장' : ''}
              </span>
            </button>
          ))}
        </div>
        {data.groups.length === 0 && <p className="empty">그룹을 만들고 초대 링크를 보내면 모임 시간을 같이 골라요.</p>}
      </section>
    </div>
  );

  return (
    <div className={`together view-${view.kind}`}>
      {side}
      <div className="together-main">
        {view.kind === 'home' && (
          <section className="card t-card together-empty">
            <p className="hint">그룹을 고르면 멤버와 모임 시간표가 여기에 보여요. 남에게는 내 일정이 '바쁨'으로만 보이고 이름은 안 보여요.</p>
          </section>
        )}
        {view.kind === 'group' && (
          <GroupPanel
            key={view.id}
            id={view.id}
            friends={data.friends}
            now={now}
            run={run}
            onBack={goHome}
            onChanged={load}
            onMeet={(meetId) => setView({ kind: 'meet', id: meetId, groupId: view.id })}
          />
        )}
        {view.kind === 'meet' && <MeetPanel key={view.id} id={view.id} now={now} run={run} onBack={backToGroup} />}
      </div>
      {example && <p className="sr-only">예시 자료예요. 실제 친구·그룹이 아니에요.</p>}
    </div>
  );
}

function GroupPanel({ id, friends, now, run, onBack, onChanged, onMeet }) {
  const [g, setG] = useState(null);
  const [link, setLink] = useState(null);
  const [rename, setRename] = useState(null);
  const [pickFriend, setPickFriend] = useState('');
  const [form, setForm] = useState(null); // 모임 시간표 만들기
  const load = useCallback(() => {
    api.getGroup(id).then(setG, () => onBack());
  }, [id, onBack]);
  useEffect(load, [load]);
  if (!g) return <section className="card t-card" aria-busy="true" />;

  const inGroup = new Set(g.members.map((m) => m.id));
  const addable = friends.filter((f) => !inGroup.has(f.id));
  const today = dayStart(now);
  const openForm = () => setForm({ title: '모임', from: dateInput(today), to: dateInput(addDays(today, 6)), dayStart: '09:00', dayEnd: '22:00', slot: 30, length: 60 });

  return (
    <section className="card t-card t-panel" aria-labelledby="t-group-name">
      <div className="tasks-head">
        <button type="button" className="btn-text quiet t-back home" onClick={onBack}>
          ← 목록
        </button>
        {rename === null ? (
          <h2 id="t-group-name" className="card-title">
            {g.group.name}
          </h2>
        ) : (
          <form
            className="t-form grow"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => api.renameGroup(id, rename.trim()),
                () => {
                  setRename(null);
                  load();
                  onChanged();
                },
              );
            }}
          >
            <input className="input" value={rename} maxLength={40} aria-label="그룹 이름" onChange={(e) => setRename(e.target.value)} />
            <button type="submit" className="btn" disabled={!rename.trim()}>
              바꾸기
            </button>
          </form>
        )}
        <span className="grow" />
        {g.group.owner && rename === null && (
          <button type="button" className="btn-text quiet" onClick={() => setRename(g.group.name)}>
            이름 바꾸기
          </button>
        )}
      </div>

      <div className="list-scroll">
        <h3 className="group-title">멤버 {g.members.length}</h3>
        <ul className="t-list">
          {g.members.map((m) => (
            <li key={m.id}>
              <span className="t-name">
                {m.name}
                {m.me && <span className="tag">나</span>}
                {m.owner && <span className="tag">방장</span>}
              </span>
              {g.group.owner && !m.me && <TwoStep label="내보내기" sure="한 번 더 누르면 내보내요" onGo={() => run(() => api.removeMember(id, m.id), load)} />}
            </li>
          ))}
        </ul>
        <div className="t-actions">
          <button type="button" className="btn-text" onClick={() => run(() => api.inviteToGroup(id), setLink)}>
            초대 링크
          </button>
          {addable.length > 0 && (
            <span className="t-pick">
              <select className="input" value={pickFriend} aria-label="넣을 친구" onChange={(e) => setPickFriend(e.target.value)}>
                <option value="">친구 넣기…</option>
                {addable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-text"
                disabled={!pickFriend}
                onClick={() =>
                  run(
                    () => api.addFriendToGroup(id, Number(pickFriend)),
                    () => {
                      setPickFriend('');
                      load();
                      onChanged();
                    },
                  )
                }
              >
                넣기
              </button>
            </span>
          )}
          <TwoStep
            label="나가기"
            sure="한 번 더 누르면 나가요"
            onGo={() =>
              run(
                () => api.leaveGroup(id),
                () => {
                  onChanged();
                  onBack();
                },
              )
            }
          />
        </div>
        {link && <InviteLink link={link} what={`Tachyon 그룹 '${g.group.name}'에 들어와요`} />}

        <h3 className="group-title">모임 시간표 {g.meets.length}</h3>
        <div className="t-list">
          {g.meets.map((m) => (
            <button key={m.id} type="button" className="t-row" onClick={() => onMeet(m.id)}>
              <span className="t-name">{m.title}</span>
              <span className="hint num">
                {shortDate(`${m.from}T00:00:00+09:00`)}–{shortDate(`${m.to}T00:00:00+09:00`)} · {m.length}분
              </span>
            </button>
          ))}
        </div>
        {form === null ? (
          <button type="button" className="btn-text" onClick={openForm}>
            모임 시간표 만들기
          </button>
        ) : (
          <form
            className="t-meet-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => api.createMeet(id, { ...form, slot: Number(form.slot), length: Number(form.length) }),
                (res) => {
                  setForm(null);
                  onMeet(res.meet.id);
                },
              );
            }}
          >
            <label className="field">
              <span>이름</span>
              <input className="input" value={form.title} maxLength={40} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>첫날</span>
                <input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </label>
              <label className="field">
                <span>끝날(14일까지)</span>
                <input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>하루 시작</span>
                <input className="input" type="time" step="1800" value={form.dayStart} onChange={(e) => setForm({ ...form, dayStart: e.target.value })} />
              </label>
              <label className="field">
                <span>하루 끝</span>
                <input className="input" type="time" step="1800" value={form.dayEnd} onChange={(e) => setForm({ ...form, dayEnd: e.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>칸</span>
                <select className="input" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>
                  <option value="15">15분</option>
                  <option value="30">30분</option>
                  <option value="60">60분</option>
                </select>
              </label>
              <label className="field">
                <span>모임 길이(분)</span>
                <input className="input" type="number" min={form.slot} step={form.slot} value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} />
              </label>
            </div>
            <div className="t-actions">
              <button type="button" className="btn-text quiet" onClick={() => setForm(null)}>
                닫기
              </button>
              <button type="submit" className="btn" disabled={!form.title.trim()}>
                만들기
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function MeetPanel({ id, now, run, onBack }) {
  const [m, setM] = useState(null);
  const [paint, setPaint] = useState(false);
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    api.getMeet(id).then(setM, () => onBack());
  }, [id, onBack]);
  if (!m) return <section className="card t-card" aria-busy="true" />;

  const nameOf = new Map(m.members.map((x) => [x.id, x.me ? '나' : x.name]));
  const nowMs = new Date(now).getTime();
  // 서버 후보에 이미 지난 시각이 섞여 있으면 같은 규칙으로 지금부터 다시 고른다
  const best = m.best.every((b) => Date.parse(b.start) >= nowMs) ? m.best : bestTimes(m.slots, m.meet, nowMs).map((b) => ({ ...b, end: toKstIso(b.end) }));
  const pickedSlot = picked && m.slots.find((s) => s.start === picked);
  const myMarks = m.slots.filter((s) => s.mark);

  return (
    <section className="card t-card t-panel meet" aria-labelledby="t-meet-title">
      <div className="tasks-head">
        <button type="button" className="btn-text quiet t-back" onClick={onBack}>
          ← {m.meet.group}
        </button>
        <h2 id="t-meet-title" className="card-title">
          {m.meet.title}
        </h2>
        <span className="grow" />
        {m.meet.canDelete && <TwoStep label="지우기" sure="한 번 더 누르면 지워요" onGo={() => run(() => api.deleteMeet(id), onBack)} />}
      </div>
      <div className="meet-best">
        <span className="group-title">이때 어때요</span>
        {best.length ? (
          best.map((b) => (
            <span key={b.start} className="best num">
              {shortDate(b.start)} {hm(b.start)}–{hm(b.end)} · {b.free}명
            </span>
          ))
        ) : (
          <span className="hint">다 같이 되는 때가 아직 없어요</span>
        )}
        {m.unknown > 0 && <span className="hint">아직 안 칠한 사람 {m.unknown}명</span>}
      </div>
      <div className="meet-tools">
        <div className="segmented" role="group" aria-label="모임 시간표 보기">
          <button type="button" aria-pressed={!paint} onClick={() => setPaint(false)}>
            보기
          </button>
          <button type="button" aria-pressed={paint} onClick={() => setPaint(true)}>
            내 칸 칠하기
          </button>
        </div>
        <span className="hint">{paint ? '누르거나 끌어서 되는 칸·안 되는 칸을 바꿔요' : '칸을 누르면 되는 사람이 보여요'}</span>
        {paint && myMarks.length > 0 && (
          <button type="button" className="btn-text quiet" onClick={() => run(() => api.markMeet(id, myMarks.map((s) => ({ start: s.start, state: null }))), setM)}>
            달력대로 되돌리기
          </button>
        )}
      </div>
      <div className="list-scroll meet-scroll">
        <MeetGrid slots={m.slots} known={m.known} paint={paint} picked={picked} now={now} onPaint={(marks) => run(() => api.markMeet(id, marks), setM)} onPick={setPicked} />
      </div>
      {!paint && pickedSlot && (
        <p className="meet-who num" role="status">
          {shortDate(pickedSlot.start)} {hm(pickedSlot.start)} · 되는 사람 {pickedSlot.free}/{m.known}
          {pickedSlot.who.length ? `: ${pickedSlot.who.map((w) => nameOf.get(w) || '?').join(', ')}` : ''}
        </p>
      )}
      <p className="hint meet-key">진할수록 되는 사람이 많아요 · 노란 점 = 내가 되는 칸 · 남에게는 내 일정이 이름 없이 '바쁨'으로만 보여요</p>
    </section>
  );
}
