// TT Wizard 시간표(11-11 사람 "가능하면 TT Wizard랑 연동", 컨셉): TT Wizard의 시간표 링크를 붙여 넣으면 이번 학기 수업을 달력에 넣고,
// 반대로 Tachyon의 수업을 TT Wizard에서 연다(그 학기 편람으로 걷는 길·지각 확인). 서버는 worker/9_etl.js + worker/ttwizard.js.
// TT Wizard의 'Tachyon으로 보내기'(…/#ttw=…)로 들어오면 initialLink에 그 글이 온다.
import { useEffect, useState } from 'react';
import * as api from '../api.js';
import Sheet from './Sheet.jsx';

const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// [{ day, start, end, place }] → '월·수 10:00–11:15 · 26동 101' (같은 시각·장소끼리 묶는다)
function timesText(times) {
  const groups = new Map();
  for (const t of times) {
    const key = `${t.start}-${t.end}-${t.place || ''}`;
    groups.set(key, { ...t, days: [...(groups.get(key)?.days || []), t.day] });
  }
  return [...groups.values()].map((g) => `${g.days.join('·')} ${hm(g.start)}–${hm(g.end)}${g.place ? ` · ${g.place}` : ''}`).join(', ');
}

function openOutside(url) {
  const browser = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser; // 안드로이드 앱 안에서는 폰 브라우저 창으로
  if (browser) browser.open({ url }).catch(() => window.open(url, '_blank', 'noopener'));
  else window.open(url, '_blank', 'noopener');
}

export default function TtwSheet({ initialLink, onClose, onSaved }) {
  const [link, setLink] = useState(initialLink || '');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [out, setOut] = useState(null); // 내보내기 결과 한 줄

  async function look(value = link) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await api.ttwizardPreview(value.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // TT Wizard에서 보내 온 링크면 바로 살펴본다
  useEffect(() => {
    if (initialLink) look(initialLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.ttwizardSave(link.trim());
      onSaved(r);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function exportLink() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.ttwizardExport();
      openOutside(r.link);
      setOut(`수업 ${r.count}개를 TT Wizard로 보냈어요${r.count > r.matched ? ` (수강편람에서 못 찾은 ${r.count - r.matched}개는 '직접 넣은 일정'으로)` : ''}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const missing = preview ? preview.classes.filter((c) => !c.times.length) : [];
  return (
    <Sheet title="TT Wizard 시간표" onClose={onClose}>
      <p className="hint">TT Wizard에서 만든 시간표를 달력에 넣어요. TT Wizard → 공유 → 링크 복사 → 아래에 붙여 넣기.</p>
      <label className="field">
        <span>TT Wizard 시간표 링크</span>
        <input
          className="input"
          value={link}
          placeholder="https://archi142857.github.io/tt-wizard/#t=…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setLink(e.target.value);
            setPreview(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && look()}
        />
      </label>
      {!preview && (
        <div className="sheet-actions">
          <button type="button" className="btn" disabled={busy || !link.trim()} onClick={() => look()}>
            {busy ? '읽는 중…' : '살펴보기'}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {preview && (
        <>
          <p className="setup-intro num">
            {preview.sem} {preview.title && `‘${preview.title}’`} · 수업 {preview.classes.length - missing.length}개
          </p>
          <ul className="ttw-list">
            {preview.classes.map((c, i) => (
              <li key={i} className={c.times.length ? undefined : 'none'}>
                <span className="ttw-title">{c.title}</span>
                <span className="hint num">{c.times.length ? timesText(c.times) : '수강편람에 없어 시각을 몰라요 — 넣지 않아요'}</span>
              </li>
            ))}
          </ul>
          <p className="hint num">
            오늘부터 학기 끝({preview.until.slice(5).replace('-', '/')})까지 매주 넣어요.
            {preview.replaces > 0 && ` 지금 달력의 앞으로 수업 ${preview.replaces}칸(시간표 사진·eTL로 넣은 것)은 이걸로 바뀌어요.`}
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn-text quiet" onClick={() => setPreview(null)}>
              다시
            </button>
            <button type="button" className="btn" disabled={busy || preview.classes.length === missing.length} onClick={save}>
              {busy ? '넣는 중…' : '달력에 넣기'}
            </button>
          </div>
        </>
      )}

      <div className="ttw-out">
        <p className="hint">거꾸로, 지금 달력의 수업을 TT Wizard에서 열어 걷는 길과 지각을 볼 수 있어요.</p>
        <button type="button" className="btn-line" disabled={busy} onClick={exportLink}>
          TT Wizard에서 열기
        </button>
        {out && <p className="hint">{out}</p>}
      </div>
    </Sheet>
  );
}
