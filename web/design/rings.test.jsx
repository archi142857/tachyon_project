// 고리 시안 넷이 '고리 약속'의 기능 쪽을 지키는지: 일정마다 누르는 띠 하나, 그림은 화면 읽기에서 뺌, 좌표가 숫자.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RINGS } from '../src/components/art/index.js';
import { DAYS } from './days.js';
import Backdrop from '../src/components/art/Backdrop.jsx';
import { ART_THEMES } from '../src/themes.js';

test.each(RINGS)('$name 고리: 일정마다 누르는 띠, aria-hidden, 좌표에 NaN 없음', ({ Ring }) => {
  for (const day of Object.values(DAYS)) {
    for (const nowMin of [0, 880, 1435]) {
      const html = renderToStaticMarkup(
        <Ring arcs={day.arcs} nowMin={nowMin} sel={day.arcs[1].key} onPick={() => {}}>
          가운데
        </Ring>,
      );
      expect(html.match(/class="hit"/g)).toHaveLength(day.arcs.length);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('가운데');
      expect(html).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
});

test.each(RINGS)('$name 테마 앱 화면: 그려지고 일정 수만큼 시간표 칸', async ({ id }) => {
  const { default: MockApp } = await import('./app.jsx');
  const day = DAYS.many;
  const html = renderToStaticMarkup(<MockApp theme={id} day={day} nowMin={880} sel={null} onPick={() => {}} done={{}} onDone={() => {}} uid="t" />);
  expect(html).toContain(`t-${id}`);
  expect(html.match(/class="tl-ev /g)).toHaveLength(day.arcs.length);
  expect(html).not.toMatch(/NaN|undefined|Infinity/);
});

// 앱 테마와 그림이 같은 이름으로 이어지는지(사람 11-13 02:47 실제 앱 테마로): 테마 이름 = 고리 이름, 바탕 그림은 이름으로 찾는다
test('앱의 그림 테마 이름 = 고리 이름, 바탕 그림은 테마 이름으로', () => {
  expect(RINGS.map((r) => r.name)).toEqual(ART_THEMES);
  expect(renderToStaticMarkup(<Backdrop theme="태양계" />)).toContain('class="backdrop solar"');
  expect(renderToStaticMarkup(<Backdrop theme="뉴모피즘" />)).toBe(''); // 뉴모피즘은 그림 없이 판의 빛과 그림자만
  expect(renderToStaticMarkup(<Backdrop theme="바우하우스" />)).toBe('');
});
