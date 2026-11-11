import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILT_IN, DEFAULT, KEYS, parseTheme } from './themes.js';

// 블록 글 → { '--이름': '값' }
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const paper = decls(read('./styles.css').split(`[data-theme='${DEFAULT}'] {`)[1].split('\n}')[0]);
// 다른 테마는 기본 테마 위에 덮인다
const themes = { [DEFAULT]: paper };
for (const m of read('./themes.css').matchAll(/, \[data-theme='([^']+)'\] \{([^}]*)\}/g)) themes[m[1]] = { ...paper, ...decls(m[2]) };

// WCAG 대비(1~21). var(--x)는 한 번 풀고, #rrggbb만 잰다.
const value = (vars, key) => vars[/^var\((--[\w-]+)\)$/.exec(vars[key] || '')?.[1] ?? key];
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [글자, 바탕, 최소 대비]. 글자는 4.5, 선·표시는 3. 지금(--now)은 시각 글자에도 쓰여 4.5(디자인 11-11 23:25).
const PAIRS = [
  ['--text', '--bg', 4.5], ['--text', '--card', 4.5], ['--heading', '--card', 4.5], ['--text', '--fill', 4.5],
  ['--text2', '--bg', 4.5], ['--text2', '--card', 4.5], ['--text2', '--fill', 4.5], ['--text2', '--inset', 4.5], ['--text3', '--card', 4.5],
  ['--accent-text', '--bg', 4.5], ['--accent-text', '--card', 4.5], ['--on-accent', '--accent', 4.5],
  ['--danger', '--card', 4.5], ['--warn', '--warn-bg', 4.5],
  ['--ev-text', '--ev-class', 4.5], ['--ev-text', '--ev-ics', 4.5], ['--ev-text', '--ev-memo', 4.5], ['--ev-text', '--ev-deadline', 4.5],
  ['--snack-text', '--snack-bg', 4.5], ['--snack-action', '--snack-bg', 4.5],
  ['--map-pin-text', '--map-pin', 4.5], ['--map-label', '--map-bg', 4.5],
  ['--line-strong', '--card', 3], ['--focus', '--card', 3], ['--now', '--card', 4.5], ['--mark-class', '--card', 3],
];

describe('테마 값', () => {
  it('themes.css의 블록과 BUILT_IN의 이름이 같다', () => {
    expect(Object.keys(themes)).toEqual(BUILT_IN);
  });

  it('KEYS의 이름은 기본 테마에 있다(지도 색은 테마에만 있어도 된다)', () => {
    expect(KEYS.filter((k) => !k.startsWith('--map-') && !(k in paper))).toEqual([]);
  });

  for (const [name, vars] of Object.entries(themes)) {
    it(`${name}: 기본 테마의 색을 빠짐없이 정하고, 모르는 이름이 없다`, () => {
      const own = name === DEFAULT ? paper : decls(read('./themes.css').split(`, [data-theme='${name}'] {`)[1].split('}')[0]);
      const colors = Object.keys(paper).filter((k) => paper[k].startsWith('#'));
      expect(colors.filter((k) => !(k in own))).toEqual([]);
      if (name !== DEFAULT) expect(Object.keys(own).filter((k) => !KEYS.includes(k))).toEqual([]);
    });

    it(`${name}: 글자가 바탕 위에서 읽힌다`, () => {
      const low = PAIRS.filter(([fg, bg]) => value(vars, fg) && value(vars, bg))
        .map(([fg, bg, min]) => [fg, bg, min, contrast(value(vars, fg), value(vars, bg))])
        .filter(([, , min, c]) => c < min)
        .map(([fg, bg, min, c]) => `${fg} / ${bg} = ${c.toFixed(2)} (최소 ${min})`);
      expect(low).toEqual([]);
    });
  }
});

describe('가져온 테마 글', () => {
  const text = (theme) => JSON.stringify(theme);

  it('맞는 글은 받고, 모르는 이름은 버리고 센다', () => {
    const got = parseTheme(text({ name: ' 내 테마 ', dark: true, vars: { '--bg': '#000000', '--font': "'D2Coding', monospace", '--nope': '#fff' } }));
    expect(got).toEqual({ name: '내 테마', dark: true, vars: { '--bg': '#000000', '--font': "'D2Coding', monospace" }, dropped: 1 });
  });

  it('들어 있는 테마의 값을 그대로 적은 글은 받는다(지금 값 채우기 → 가져오기)', () => {
    for (const vars of Object.values(themes)) {
      const own = Object.fromEntries(KEYS.filter((k) => vars[k]).map((k) => [k, vars[k]]));
      expect(parseTheme(text({ name: '본', vars: own })).vars).toEqual(own);
    }
  });

  it('잘못된 글은 받지 않는다', () => {
    const bad = [
      '{ 깨진 글',
      text([]),
      text({ vars: { '--bg': '#000' } }), // 이름 없음
      text({ name: DEFAULT, vars: { '--bg': '#000' } }), // 들어 있는 테마 이름
      text({ name: '가', vars: {} }),
      text({ name: '가', vars: { '--nope': '#000' } }), // 쓸 값이 없음
      text({ name: '가', vars: { '--bg': 'url(https://example.com/a.png)' } }), // 바깥 주소
      text({ name: '가', vars: { '--bg': 'red; } body { display: none' } }),
      text({ name: '가', vars: { '--bg': 7 } }),
      text({ name: '가', vars: { '--bg': '#'.padEnd(400, '0') } }),
    ];
    for (const b of bad) expect(() => parseTheme(b), b).toThrow();
  });
});
