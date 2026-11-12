// 테마 = 색·모서리·글꼴 값 묶음. 화면 구조는 건드리지 않는다.
// 들어 있는 테마의 값은 styles.css(기본)와 themes.css에 있고, 여기서는 고르기 · 기억하기 · 가져오기만 한다.
// 고른 테마와 가져온 테마는 이 기기(localStorage)에만 둔다. 서버에는 아무것도 안 보낸다.

export const DEFAULT = '바우하우스'; // 11-11 22:42 사람이 ③을 기본으로
// 사람 11-13 01:15 "친구꺼랑 내꺼 디자인 말고는 일단 다 없애주고, 내 시안의 라이트/다크 전환하는건 남겨줘"
// → 테마는 둘: 바우하우스(친구) · 입자(dhsrua555 시연 9판). 입자는 밤 · 낮을 해·달 단추로 바꾼다.
export const BUILT_IN = [DEFAULT, '입자 밤', '입자 낮'];
export const PARTICLE = { night: '입자 밤', day: '입자 낮' };
// 예전 이름을 골라 둔 기기: '화면까지 바뀌던 테마'는 같은 색으로, 뺀 테마는 기본으로
const RENAMED = { 입자: '입자 밤', 종이: '입자 낮', '차분한 종이': DEFAULT, '벤토 위젯': DEFAULT, '조용한 갤러리': DEFAULT, '호박색 터미널': DEFAULT };

// 테마가 바꿀 수 있는 값의 이름. 가져온 테마에서 이 밖의 이름은 버린다.
export const KEYS = `--bg --card --inset --raised --heading --text --text2 --text3 --line --grid --line-strong --fill --bubble
  --accent --accent-press --accent-text --on-accent --focus --warn --warn-bg --danger
  --stamp --highlight --postit --postit-text2 --postit-unknown --now --dot-off --today-wash
  --ev-class --ev-ics --ev-memo --ev-deadline --ev-text --ev-important --mark-class --mark-task --ev-mine-line --together --together-bg
  --snack-bg --snack-text --snack-action --scrim --shadow
  --r-chip --r-postit --r-card --r-btn --r-bubble --r-sheet --font --font-head
  --map-bg --map-dot --map-halo --map-route --map-pin --map-pin-text --map-label`.split(/\s+/);

const PICK = 'tachyon_theme'; // 고른 테마 이름(테마 창에서 고를 때만 적는다)
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
  if (BUILT_IN.includes(name)) throw new Error(`'${name}'은 이미 있는 테마 이름이에요. 다른 이름을 적어 주세요`);
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
    const name = localStorage.getItem(PICK) || DEFAULT;
    return RENAMED[name] ?? name;
  } catch {
    return DEFAULT;
  }
}

// 테마를 화면에 입히고, 고른 것이면(save) 기억한다. 없는 이름이면 기본 테마로. 돌려주는 값 = 실제로 입힌 이름.
// 앱을 열 때 입히는 것은 기억하지 않는다 — 기본 이름을 적어 두면 다음에 기본이 바뀌어도 옛 옷으로 남는다.
export function applyTheme(name, mine = loadThemes(), { save = true } = {}) {
  const root = document.documentElement;
  const own = mine.find((t) => t.name === name);
  if (!own && Object.hasOwn(RENAMED, name)) name = RENAMED[name];
  if (!own && !BUILT_IN.includes(name)) name = DEFAULT;
  // 고를 때만 색이 천천히 넘어간다(9판의 밤 ↔ 낮 전환). 앱을 열 때는 바로
  if (save && typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-fade');
    clearTimeout(applyTheme.fade);
    applyTheme.fade = setTimeout(() => root.classList.remove('theme-fade'), 700);
  }
  // 입자 테마는 9판 글꼴(Inter · Noto Sans KR, 9판과 같은 곳에서)을 처음 고를 때 한 번 받는다. 받는 동안은 비슷한 Pretendard로 보인다
  if (name.startsWith('입자') && typeof document !== 'undefined' && !document.getElementById('nine-font')) {
    const link = Object.assign(document.createElement('link'), { id: 'nine-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Noto+Sans+KR:wght@300;400;500&display=swap' });
    document.head.append(link);
  }
  for (const key of KEYS) root.style.removeProperty(key);
  root.style.colorScheme = '';
  if (own) {
    // 가져온 테마: 기본 테마 위에 적힌 값만 덮는다
    delete root.dataset.theme;
    for (const key of KEYS) if (typeof own.vars[key] === 'string') root.style.setProperty(key, own.vars[key]);
    root.style.colorScheme = own.dark ? 'dark' : 'light';
  } else if (name === DEFAULT) delete root.dataset.theme;
  else root.dataset.theme = name;
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

// 바우하우스 ↔ 입자를 오갈 때(사람 11-13 01:48 "로딩 시간이 생길 수 있으니까 각 테마별 로딩 화면을 만들고 바뀌게 해줘"):
// 넘어갈 테마의 로딩 화면(loader.css)을 먼저 덮고, 그 뒤에서 테마를 바꾸고, 글꼴까지 준비되면 걷는다. 밤 ↔ 낮은 9판처럼 바로 이어서 바뀐다.
const family = (name) => (String(name || '').startsWith('입자') ? '입자' : '바우하우스');
const DOTS = Array.from({ length: 56 }, (_, i) => {
  const a = (i / 56) * 2 * Math.PI - Math.PI / 2;
  const r = 40 + (i % 3) * 6; // 세 겹
  const x = 50 + r * Math.cos(a);
  const y = 50 + r * Math.sin(a);
  const k = ((i * 37) % 56) / 56; // 흩어진 자리 · 모이는 차례(고정된 섞기)
  const fx = Math.round(Math.cos(i * 2.39996) * 160);
  const fy = Math.round(Math.sin(i * 2.39996) * 160);
  return `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--fx:${fx}px;--fy:${fy}px;--d:${Math.round(k * 420)}ms;--c:${['#8f7bff', '#35e0c0', '#ff6fb5', '#5aa2ff', '#ffa04a', '#fff', '#fff', '#fff'][i % 8]}"></i>`;
}).join('');
const LOADER = {
  입자: `<div class="ld-ring">${DOTS}<b class="ld-ty"></b><span class="ld-name">Tachyon</span></div><p>입자로 넘어가는 중</p>`,
  바우하우스: '<div class="ld-shapes"><i class="c"></i><i class="s"></i><i class="t"></i></div><span class="ld-word">Tachyon</span><span class="ld-bar"></span><p>바우하우스로 넘어가는 중</p>',
};
export function switchTheme(name, mine = loadThemes()) {
  const root = document.documentElement;
  const to = mine.some((t) => t.name === name) ? '바우하우스' : family(name);
  if (to === family(root.dataset.theme) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return applyTheme(name, mine);
  document.querySelector('.theme-loader')?.remove();
  const cover = document.createElement('div');
  cover.className = `theme-loader ${to === '입자' ? 'nine' : 'bauhaus'}${name === PARTICLE.day ? ' day' : ''}`;
  cover.setAttribute('role', 'status');
  cover.setAttribute('aria-label', `${to} 테마로 바꾸는 중`);
  cover.innerHTML = LOADER[to];
  document.body.append(cover);
  // 열린 시트(모달)보다 위에 오게 맨 위 층(popover)에 올린다. 못 쓰는 웹뷰는 z-index로만 덮는다
  if (cover.showPopover) {
    cover.popover = 'manual';
    cover.showPopover();
  }
  setTimeout(() => applyTheme(name, mine), 380); // 덮개가 다 덮은 뒤
  const fonts = document.fonts?.ready ?? Promise.resolve();
  Promise.all([new Promise((r) => setTimeout(r, 1500)), fonts]).then(() => {
    cover.classList.add('out');
    setTimeout(() => cover.remove(), 500);
  });
  return name; // 테마 창이 고른 이름(들어 있는 것 · 가져온 것)만 넘긴다
}
