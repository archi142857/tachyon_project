// 테마 = 색·모서리·글꼴 값 묶음. 화면 구조는 건드리지 않는다.
// 들어 있는 테마의 값은 styles.css(기본)와 themes.css에 있고, 여기서는 고르기 · 기억하기 · 가져오기만 한다.
// 고른 테마와 가져온 테마는 이 기기(localStorage)에만 둔다. 서버에는 아무것도 안 보낸다.

export const DEFAULT = '바우하우스'; // 11-11 22:42 사람이 ③을 기본으로. 그 전 기본 '차분한 종이'는 테마로 남는다
export const BUILT_IN = [DEFAULT, '차분한 종이', '입자 밤', '입자 낮', '벤토 위젯', '조용한 갤러리', '호박색 터미널'];
// 화면까지 바뀌는 테마(시연 9판의 화면, src/ours/). 이름 → 같이 입힐 색 값 묶음. 고르면 <html data-skin>에 이름이 적힌다.
export const SKINS = { 입자: '입자 밤', 종이: '입자 낮' };

// 테마가 바꿀 수 있는 값의 이름. 가져온 테마에서 이 밖의 이름은 버린다.
export const KEYS = `--bg --card --inset --raised --heading --text --text2 --text3 --line --grid --line-strong --fill --bubble
  --accent --accent-press --accent-text --on-accent --focus --warn --warn-bg --danger
  --stamp --highlight --postit --postit-text2 --postit-unknown --now --dot-off --today-wash
  --ev-class --ev-ics --ev-memo --ev-deadline --ev-text --ev-important --mark-class --mark-task --ev-mine-line --together --together-bg
  --snack-bg --snack-text --snack-action --scrim --shadow
  --r-chip --r-postit --r-card --r-btn --r-bubble --r-sheet --font --font-head
  --map-bg --map-dot --map-halo --map-route --map-pin --map-pin-text --map-label`.split(/\s+/);

const PICK = 'tachyon_theme'; // 고른 테마 이름(테마 창에서 고를 때만 적는다)
const PICK_V = 'tachyon_theme_v'; // 기본 바꿈을 지나 온 기기 표시. '2' = 바우하우스가 기본이 된 뒤(11-11)
const OLD_DEFAULT = '차분한 종이';
const MINE = 'tachyon_themes'; // 가져온 테마 목록
export const MAX_MINE = 20;

// 값에 쓸 수 있는 글자만 받는다. 바깥 주소를 부르는 값(url 등)은 안 받는다.
const SAFE = /^[#\w\s.,%()'"/-]+$/;
const UNSAFE = /url|image|expression|@|\\/i;

// 붙여 넣은 글 → { name, dark, vars, dropped(버린 값 수) }. 잘못된 글이면 까닭을 적은 Error를 던진다.
export function parseTheme(text) {
  if (String(text).length > 20000) throw new Error('글이 너무 길어요');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('글을 읽지 못했어요. { 로 시작해서 } 로 끝나는지 봐 주세요');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('테마 글이 아니에요');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 20) throw new Error('이름(name)을 1~20자로 적어 주세요');
  if (BUILT_IN.includes(name) || Object.hasOwn(SKINS, name)) throw new Error(`'${name}'은 이미 있는 테마 이름이에요. 다른 이름을 적어 주세요`);
  if (!raw.vars || typeof raw.vars !== 'object' || Array.isArray(raw.vars)) throw new Error('값 묶음(vars)이 없어요');
  const vars = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(raw.vars)) {
    if (!KEYS.includes(key)) dropped += 1;
    else if (typeof value !== 'string' || !value.trim() || value.length > 300 || !SAFE.test(value) || UNSAFE.test(value)) throw new Error(`${key} 값을 쓸 수 없어요`);
    else vars[key] = value.trim();
  }
  if (!Object.keys(vars).length) throw new Error('쓸 수 있는 값이 하나도 없어요');
  return { name, dark: raw.dark === true, vars, dropped };
}

export function loadThemes() {
  try {
    const list = JSON.parse(localStorage.getItem(MINE) || '[]');
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === 'string' && t.vars && typeof t.vars === 'object') : [];
  } catch {
    return [];
  }
}

export function saveThemes(list) {
  try {
    localStorage.setItem(MINE, JSON.stringify(list));
  } catch {
    // 저장이 막힌 브라우저에서는 이번에 열어 둔 동안만 쓴다
  }
}

export function currentTheme() {
  try {
    // 11-11까지는 앱을 열 때마다 그때 기본('차분한 종이')을 적어 두었다. 그런 기기는 한 번만 새 기본으로 옮긴다.
    // 테마 창에서 다시 고르면 그 이름이 남는다.
    if (!localStorage.getItem(PICK_V)) {
      if (localStorage.getItem(PICK) === OLD_DEFAULT) localStorage.removeItem(PICK);
      localStorage.setItem(PICK_V, '2');
    }
    return localStorage.getItem(PICK) || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

// 테마를 화면에 입히고, 고른 것이면(save) 기억한다. 없는 이름이면 기본 테마로. 돌려주는 값 = 실제로 입힌 이름.
// 앱을 열 때 입히는 것은 기억하지 않는다 — 기본 이름을 적어 두면 다음에 기본이 바뀌어도 옛 옷으로 남는다.
export function applyTheme(name, mine = loadThemes(), { save = true } = {}) {
  const root = document.documentElement;
  const own = mine.find((t) => t.name === name);
  const skin = !own && Object.hasOwn(SKINS, name) ? name : '';
  if (!own && !skin && !BUILT_IN.includes(name)) name = DEFAULT;
  for (const key of KEYS) root.style.removeProperty(key);
  root.style.colorScheme = '';
  if (own) {
    // 가져온 테마: 기본 테마 위에 적힌 값만 덮는다
    delete root.dataset.theme;
    for (const key of KEYS) if (typeof own.vars[key] === 'string') root.style.setProperty(key, own.vars[key]);
    root.style.colorScheme = own.dark ? 'dark' : 'light';
  } else if (name === DEFAULT) delete root.dataset.theme;
  else root.dataset.theme = skin ? SKINS[name] : name;
  if (skin) root.dataset.skin = skin;
  else delete root.dataset.skin;
  window.dispatchEvent(new Event('tachyon-skin')); // 화면 쪽(ours/skin.jsx)이 듣는다
  // 폰 주소창 색도 바탕색에 맞춘다(기본 테마는 index.html에 적힌 값 그대로)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.dataset.base ??= meta.content;
    meta.content = name === DEFAULT ? meta.dataset.base : getComputedStyle(root).getPropertyValue('--bg').trim();
  }
  if (save) {
    try {
      localStorage.setItem(PICK, name);
    } catch {
      // 못 적어도 이번 화면에는 입혀졌다
    }
  }
  return name;
}

// 지금 화면에 입혀진 값을 테마 글로. 새 테마를 만들 때 본으로 쓴다.
export function themeText() {
  const cs = getComputedStyle(document.documentElement);
  const vars = {};
  for (const key of KEYS) {
    const value = cs.getPropertyValue(key).trim();
    if (value) vars[key] = value;
  }
  return JSON.stringify({ name: '내 테마', dark: cs.colorScheme === 'dark', vars }, null, 1);
}
