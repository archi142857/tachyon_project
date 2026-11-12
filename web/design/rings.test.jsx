// 고리 시안 넷이 '고리 약속'의 기능 쪽을 지키는지: 일정마다 누르는 띠 하나, 그림은 화면 읽기에서 뺌, 좌표가 숫자.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RINGS } from './rings/index.js';
import { DAYS } from './days.js';

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
