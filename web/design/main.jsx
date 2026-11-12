// 테마 시안 쪽(개발자용, 앱 화면과 따로). npm run dev → http://localhost:5173/design/#solar
// 사람 11-13: 01:54 레퍼런스를 테마마다 화면 전체에 입히기, 02:10 '새'는 뉴모피즘만으로 · 실제 앱에 들어간 것처럼 보이는 시안, 02:25 테마마다 어울리는 글꼴, 02:41 글자가 테마와 따로 놀지 않게(제목 · 이름 · 숫자 한 글꼴 + 테마 빛).
// 위 = 고르는 줄(테마 · 기기 · 예시 하루 · 지금), 가운데 = 고른 테마를 입힌 앱 화면, 아래 = 네 테마를 폰으로 나란히 + 테마마다 바뀐 것.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/jost';
import './design.css';
import { RINGS } from './rings/index.js';
import { DAYS } from './days.js';
import { hm } from './rings/common.jsx';
import MockApp, { TASKS } from './app.jsx';

const START = 14 * 60 + 40; // 처음 보이는 '지금'(오후, 지난 일정과 남은 일정이 같이 보이게)
const themeOf = () => RINGS.find((r) => `#${r.id}` === location.hash)?.id ?? RINGS[0].id;

const LOOKS = {
  solar: ['성운이 번진 깊은 우주 바탕에 반짝이는 별', '유리처럼 비치는 어두운 칸, 금빛 제목 · 단추 · 글꼴 함렛 세리프 하나(제목 · 일정 · 숫자), 은은한 금빛', '고리: 빛나는 해 · 하얀 궤도 · 금빛 소행성대 · 그늘진 행성'],
  staff: ['흰 종이를 비스듬히 가로지르는 검은 오선 띠와 흰 음표', '각진 검은 테와 엇갈린 그림자, 비스듬한 리본 단추 · 글꼴 바로 선 본명조 하나(제목 · 일정 · 숫자), 인쇄물처럼', '고리: 굵은 검은 띠 위 흰 오선 · 흰 음표, 빨간 재생 줄'],
  atom: ['남색 바탕에 기울어진 주황 · 하늘색 네온 궤도', '빛나는 테두리와 단추, 전자 모양 표시 · 글꼴 오르빗 하나(제목 · 일정 · 숫자), 네온 빛', '고리: 주황 플라스마 원자핵 · 네온 껍질 · 오가는 전자'],
  soft: ['그림 · 무늬 없이 연회색 판 하나, 선 대신 그림자로 칸을 가름', '볼록한 칸 · 눌린 입력 칸과 고른 탭, 파랑 하나 · 글꼴 프리텐다드 하나, 판에 눌러 찍은 듯한 흰 빛', '고리: 볼록한 캡슐 · 구슬 · 오목한 보조개, 진행 줄과 손잡이'],
};

function Page() {
  const [theme, setTheme] = useState(themeOf);
  const [device, setDevice] = useState('wide');
  const [dayKey, setDayKey] = useState('many');
  const [nowMin, setNow] = useState(START);
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [still, setStill] = useState(false);
  const [done, setDone] = useState(() => Object.fromEntries(TASKS.filter((t) => t.done).map((t) => [t.id, true])));
  const day = DAYS[dayKey];

  useEffect(() => {
    const on = () => setTheme(themeOf());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.still = still ? '1' : '0';
  }, [still]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow((m) => (m + 5) % 1440), 60);
    return () => clearInterval(t);
  }, [playing]);

  const pick = (key) => setSel((s) => (s === key ? null : key));
  const common = { day, nowMin, sel, onPick: pick, done, onDone: (id, v) => setDone((d) => ({ ...d, [id]: v })) };
  const cur = RINGS.find((r) => r.id === theme);

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>Tachyon 테마 시안</h1>
        <p>
          실제 앱의 &lsquo;오늘&rsquo; 화면에 테마 넷을 입혀 본 시안이다. 자리와 기능(메뉴 · 시간표 · 하루 고리 · 할 일 · 메모 · 적기 칸)은 그대로 두고
          모양만 바꿨다. 고리나 시간표의 일정을 누르면 같이 골라진다. 일정과 할 일은 모두 지어낸 것이다.
        </p>
      </header>

      <section className="pick" aria-label="보기 고르기">
        <div className="seg themes" role="group" aria-label="테마">
          {RINGS.map((r) => (
            <a key={r.id} href={`#${r.id}`} aria-current={r.id === theme ? 'true' : undefined} className={`sw-${r.id}`}>
              <i aria-hidden="true" />
              {r.name}
            </a>
          ))}
        </div>
        <div className="seg" role="group" aria-label="기기">
          {[
            ['wide', '넓은 화면'],
            ['phone', '폰'],
          ].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={device === k} onClick={() => setDevice(k)}>
              {t}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="예시 하루">
          {Object.entries(DAYS).map(([k, d]) => (
            <button key={k} type="button" aria-pressed={k === dayKey} onClick={() => (setDayKey(k), setSel(null))}>
              {d.label}
            </button>
          ))}
        </div>
        <label className="now-ctl" htmlFor="now">
          지금 <output className="num">{hm(nowMin)}</output>
          <input id="now" type="range" min="0" max="1435" step="5" value={nowMin} onChange={(e) => setNow(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '멈추기' : '하루 돌려 보기'}
        </button>
        <label className="check" htmlFor="still">
          <input id="still" type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> 움직임 끄기
        </label>
      </section>

      <section className={`stage ${device}`} aria-label={`${cur.name} 테마 · ${device === 'wide' ? '넓은 화면' : '폰'}`}>
        <div className={device === 'wide' ? 'device browser' : 'device phone'}>
          {device === 'wide' && (
            <div className="chrome" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>tachyon.app</span>
            </div>
          )}
          <MockApp theme={theme} uid="main" {...common} />
        </div>
        <ul className="looks" aria-label={`${cur.name} 테마에서 바뀐 것`}>
          <li className="looks-name">
            <b>{cur.name}</b> {cur.idea}
          </li>
          {LOOKS[theme].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="gallery" aria-labelledby="h-all">
        <h2 id="h-all">네 테마를 폰으로 나란히</h2>
        <div className="phones">
          {RINGS.map((r) => (
            <figure key={r.id} className={r.id === theme ? 'on' : ''}>
              <div className="device phone small">
                <MockApp theme={r.id} uid={`g-${r.id}`} {...common} />
              </div>
              <figcaption>
                <a href={`#${r.id}`}>{r.name}</a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="same" aria-labelledby="h-same">
        <h2 id="h-same">모든 테마가 같은 것</h2>
        <ul>
          <li>자리: 넓은 화면은 왼쪽 메뉴 · 위 날짜 줄 · 세 칸(오늘 일정 | 하루 고리와 할 일 | 메모) · 아래 적기 칸. 폰은 탭 · 하루 고리 · 할 일 · 아래 적기 칸.</li>
          <li>고리: 한 바퀴 = 오늘, 0시가 맨 위, 시계 방향, 3시간마다 시각. 수업 · 내 일정 · 할 일 자리는 색만이 아니라 모양으로도 갈린다.</li>
          <li>지금은 빨간 계열로 표시하고, 지난 일정은 흐리게. 붙은 두 일정은 눈으로 갈라진다.</li>
          <li>일정을 누르는 자리와 가운데 글자 칸(남은 빈 시간 · 고른 일정)은 모든 테마가 같다.</li>
        </ul>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
