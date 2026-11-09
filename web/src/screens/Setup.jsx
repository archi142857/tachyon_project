// 첫 설정: 학과·학년 + 캘린더(ICS) 주소 칸 3개(eTL·구글·애플, 찾는 법 한 줄씩과 '자세히'). 모두 건너뛸 수 있다.
// 메뉴에서 다시 열면(again) '건너뛰기' 대신 '닫기'이고, 저장된 주소는 끝 4자만 보인다.
// 저장하면 서버가 주소를 바로 한 번 받아 보고 칸마다 결과를 준다('과제 3개를 찾았어요').
// 저장하지 못한 칸(saved: false)은 주소를 남겨 두고 까닭을 칸 아래에 그대로 보인다.
import { useEffect, useState } from 'react';
import { collectFeeds, getFeeds, markSetupSkipped, saveFeeds, saveProfile } from '../api.js';
import TopBar from '../components/TopBar.jsx';
import { FEEDS, YEARS, feedResult, normalizeIcs, resultLine, unsavedErrors } from '../setup.js';

const EMPTY = { etl: '', google: '', apple: '' };

export default function Setup({ user, example, again, onDone }) {
  const [dept, setDept] = useState(user.dept || '');
  const [year, setYear] = useState(user.year || null);
  const [urls, setUrls] = useState(EMPTY);
  const [feeds, setFeeds] = useState([]);
  const [errors, setErrors] = useState({});
  const [lines, setLines] = useState({}); // 방금 저장·다시 받기 한 칸의 결과 한 줄
  const [checked, setChecked] = useState(false); // 저장해서 받아 본 결과를 보이는 중
  const [busy, setBusy] = useState(false);
  const feedOf = (kind) => feeds.find((f) => f.kind === kind);

  useEffect(() => {
    getFeeds()
      .then(setFeeds)
      .catch(() => {});
  }, []);

  const typed = FEEDS.some((f) => urls[f.key].trim());
  const failed = FEEDS.some((f) => errors[f.key]) || Object.values(lines).some((l) => l && !l.ok);

  // 서버 결과 → 칸마다 한 줄. 저장 못 한 칸은 오류로, 그 칸의 주소는 그대로 둔다.
  // raw(붙인 주소)를 주면 저장된 칸은 비우고 저장 못 한 칸만 남긴다. 다시 받기에서는 칸을 건드리지 않는다.
  function showResults(results, raw) {
    const bad = unsavedErrors(results);
    setErrors(bad);
    setLines((old) => {
      const next = { ...old };
      for (const r of results) next[r.kind] = r.kind in bad ? null : resultLine(r);
      return next;
    });
    if (raw) setUrls({ ...EMPTY, ...Object.fromEntries(Object.keys(bad).map((k) => [k, raw[k] || ''])) });
    setChecked(true);
  }

  async function save() {
    const errs = {};
    const clean = {};
    for (const feed of FEEDS) {
      const r = normalizeIcs(feed.key, urls[feed.key]);
      if (r.error) errs[feed.key] = r.error;
      else if (r.url) clean[feed.key] = r.url;
    }
    const wantsProfile = dept.trim() || year;
    if (wantsProfile && !(dept.trim() && year)) errs.profile = '학과와 학년을 둘 다 넣어 주세요';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      if (wantsProfile) await saveProfile({ dept: dept.trim(), year });
      else if (!again) markSetupSkipped(user.id);
      if (!Object.keys(clean).length) {
        onDone();
        return;
      }
      const { results, feeds: next } = await saveFeeds(clean);
      setFeeds(next);
      showResults(results, urls);
    } catch (err) {
      setErrors({ form: err.message || '저장하지 못했어요. 잠시 뒤에 다시 해 주세요' });
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    setBusy(true);
    try {
      const { results, feeds: next } = await collectFeeds();
      setFeeds(next);
      showResults(results);
    } catch (err) {
      setErrors({ form: err.message || '다시 받지 못했어요. 잠시 뒤에 다시 해 주세요' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind) {
    try {
      const { feeds: next } = await saveFeeds({ [kind]: null });
      setFeeds(next);
      setLines((l) => ({ ...l, [kind]: null }));
      setErrors((e) => ({ ...e, [kind]: undefined }));
    } catch (err) {
      setErrors({ [kind]: err.message || '지우지 못했어요' });
    }
  }

  function skip() {
    if (!again) markSetupSkipped(user.id);
    onDone();
  }

  // 아래 버튼. 첫 설정: 저장 전 [건너뛰기][저장] → 받아 본 뒤 [다음](못 읽은 칸이 있으면 [그대로 두고 넘어가기]도)
  // 메뉴에서 다시 열면 늘 [닫기][저장]
  const saveButton = { label: busy ? '받아 보는 중…' : '저장', onClick: save };
  const primary = again || typed || !checked ? saveButton : { label: '다음', onClick: onDone };
  const secondary = again ? { label: '닫기', onClick: onDone } : !checked ? { label: '건너뛰기', onClick: skip } : failed ? { label: '그대로 두고 넘어가기', onClick: onDone } : null;
  const anySaved = feeds.some((f) => f.set);

  return (
    <>
      <TopBar example={example} />
      <main className="setup">
        <section className="card" aria-labelledby="setup-me">
          <h2 id="setup-me">학과·학년</h2>
          <label className="field">
            <span>학과</span>
            <input className="input" value={dept} maxLength={60} placeholder="예: 경제학부" autoComplete="off" onChange={(e) => setDept(e.target.value)} />
          </label>
          <div className="field">
            <span>학년</span>
            <div className="years" role="group" aria-label="학년">
              {YEARS.map((y) => (
                <button key={y.value} type="button" aria-pressed={year === y.value} onClick={() => setYear(year === y.value ? null : y.value)}>
                  {y.label}
                </button>
              ))}
            </div>
          </div>
          {errors.profile && <p className="error">{errors.profile}</p>}
        </section>

        <section className="card" aria-labelledby="setup-feeds">
          <h2 id="setup-feeds">캘린더 주소 (고를 것만)</h2>
          <p className="hint">이 주소를 아는 사람은 누구나 그 일정을 볼 수 있어요. 다른 사람에게 보여 주지 마세요.</p>
          {FEEDS.map((feed) => {
            const saved = feedOf(feed.key);
            const line = lines[feed.key] !== undefined ? lines[feed.key] : again ? feedResult(saved) : null;
            return (
              <div className="feed" key={feed.key}>
                <label className="field" htmlFor={`feed-${feed.key}`}>
                  <span>{feed.label}</span>
                </label>
                <input
                  id={`feed-${feed.key}`}
                  className="input"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  placeholder={saved?.set ? `저장됨 · ${saved.hint}` : 'https:// 주소 붙여넣기'}
                  value={urls[feed.key]}
                  onChange={(e) => setUrls({ ...urls, [feed.key]: e.target.value })}
                  aria-describedby={`feed-${feed.key}-how`}
                  aria-invalid={errors[feed.key] ? 'true' : undefined}
                />
                <p className="hint" id={`feed-${feed.key}-how`}>
                  {feed.how}
                </p>
                <details className="how">
                  <summary>자세히</summary>
                  <ol>
                    {feed.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
                {errors[feed.key] && <p className="error">{errors[feed.key]}</p>}
                {!errors[feed.key] && line && (
                  <p className={line.ok ? 'hint' : 'error'} role="status">
                    {line.text}
                  </p>
                )}
                {again && saved?.set && (
                  <button type="button" className="btn-text quiet" style={{ justifySelf: 'start', height: 36, padding: '0 4px' }} onClick={() => remove(feed.key)}>
                    저장된 주소 지우기
                  </button>
                )}
              </div>
            );
          })}
          {again && anySaved && (
            <button type="button" className="btn-text" style={{ justifySelf: 'start' }} disabled={busy} onClick={collect}>
              지금 다시 받기
            </button>
          )}
        </section>

        {errors.form && <p className="error">{errors.form}</p>}
        <div className="actions">
          {secondary && (
            <button type="button" className="btn-text quiet" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={primary.onClick}>
            {primary.label}
          </button>
        </div>
      </main>
    </>
  );
}
