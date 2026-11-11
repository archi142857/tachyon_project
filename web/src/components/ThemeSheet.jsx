// 테마 고르기 · 새 테마 가져오기(메뉴 → 테마). 화면 구조는 그대로이고 색·모서리·글꼴 값만 바뀐다(themes.js).
import { useState } from 'react';
import { BUILT_IN, DEFAULT, MAX_MINE, applyTheme, currentTheme, loadThemes, parseTheme, saveThemes, themeText } from '../themes.js';
import Sheet from './Sheet.jsx';

// 색 견본: 바탕 위에 카드 · 강조 · 수업 색
const Swatch = (props) => (
  <span className="swatch" aria-hidden="true" {...props}>
    <i />
    <i />
    <i />
  </span>
);

export default function ThemeSheet({ onClose }) {
  const [mine, setMine] = useState(loadThemes);
  const [now, setNow] = useState(currentTheme);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const use = (name, list = mine) => setNow(applyTheme(name, list));
  function keep(list) {
    saveThemes(list);
    setMine(list);
  }

  function add() {
    try {
      const { dropped, ...theme } = parseTheme(text);
      const list = [...mine.filter((t) => t.name !== theme.name), theme];
      if (list.length > MAX_MINE) throw new Error(`가져온 테마는 ${MAX_MINE}개까지 둘 수 있어요. 안 쓰는 것을 지워 주세요`);
      keep(list);
      use(theme.name, list);
      setText('');
      setError('');
      setNote(`'${theme.name}' 테마를 넣고 바꿨어요.${dropped ? ` 모르는 값 ${dropped}개는 뺐어요.` : ''}`);
    } catch (e) {
      setError(e.message);
      setNote('');
    }
  }

  function remove(name) {
    const list = mine.filter((t) => t.name !== name);
    keep(list);
    if (now === name) use(DEFAULT, list);
  }

  return (
    <Sheet title="테마" onClose={onClose}>
      <div className="theme-list">
        {BUILT_IN.map((name) => (
          <button key={name} type="button" className="theme" aria-pressed={now === name} onClick={() => use(name)}>
            <Swatch data-theme={name} />
            {name}
            {name === DEFAULT && <span className="tag">기본</span>}
          </button>
        ))}
        {mine.map((t) => (
          <div key={t.name} className="theme-row">
            <button type="button" className="theme" aria-pressed={now === t.name} onClick={() => use(t.name)}>
              <Swatch style={t.vars} />
              {t.name}
              <span className="tag">가져옴</span>
            </button>
            <button type="button" className="btn-text danger" aria-label={`${t.name} 테마 지우기`} onClick={() => remove(t.name)}>
              지우기
            </button>
          </div>
        ))}
      </div>
      <label className="field">
        <span>새 테마 가져오기</span>
        <textarea
          className="input theme-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'{ "name": "내 테마", "dark": false, "vars": { "--bg": "#ffffff", "--accent": "#0b57d0" } }'}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      <p className="hint">테마 글은 이름과 색 값을 적은 짧은 글이에요. ‘지금 값 채우기’로 본을 받아 색만 고쳐도 돼요. 가져온 테마는 이 기기에만 저장돼요.</p>
      <div className="sheet-actions">
        <button type="button" className="btn-text" onClick={() => (setText(themeText()), setError(''), setNote(''))}>
          지금 값 채우기
        </button>
        <button type="button" className="btn" disabled={!text.trim()} onClick={add}>
          가져오기
        </button>
      </div>
    </Sheet>
  );
}
