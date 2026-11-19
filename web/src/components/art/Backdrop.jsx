// 그림 테마마다 화면 뒤 꾸밈(레퍼런스 그림의 바탕을 옮김). 뜻 없는 그림이라 화면 읽기에서 뺀다. theme = 테마 이름(태양계 …).
// 앱은 ThemeBackdrop(Dashboard 맨 뒤), 시안 쪽은 앱 모형(web/design/app.jsx)이 부른다. 색은 art.css의 .backdrop.이름.
//  태양계 = 성운 위 별(밝기 세 겹)과 먼 고리 행성 · 오선지 = 흰 종이를 가로지르는 검은 오선 띠와 흰 음표
//  뉴모피즘 = 없음
import { seeded, f1 } from './common.jsx';
import { RINGS } from './index.js';
import { useThemeName } from '../../themeName.js';

const sparkle = (s) => `M0 ${-s}L${s * 0.14} ${-s * 0.14}L${s} 0L${s * 0.14} ${s * 0.14}L0 ${s}L${-s * 0.14} ${s * 0.14}L${-s} 0L${-s * 0.14} ${-s * 0.14}Z`;

function Solar() {
  const rand = seeded('sky');
  const dots = Array.from({ length: 260 }, (_, i) => <circle key={i} cx={f1(rand() * 1000)} cy={f1(rand() * 1000)} r={f1(0.4 + rand() * 1.1)} className="dot" />);
  return (
    <>
      {dots}
      {/* 큰 별 세 무리(밝기 세 겹, art.css). 11-19 렉: 화면 뒤 별은 반짝이지 않는다 — 반짝임은 고리 안 별만 */}
      {[0, 1, 2].map((k) => (
        <g key={k} className={`tw tw${k + 1}`}>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={sparkle(3 + rand() * 9)} transform={`translate(${f1(rand() * 1000)} ${f1(rand() * 1000)})`} className="sp" />
          ))}
        </g>
      ))}
      <g transform="translate(930 900) rotate(-20)" className="far-planet">
        <circle r="70" />
        <ellipse rx="150" ry="34" />
      </g>
    </>
  );
}

function Staff() {
  const glyphs = ['♪', '♫', '♩', '♬'];
  const band = (y, rot, seed) => {
    const rand = seeded(seed);
    return (
      <g key={seed} transform={`rotate(${rot} 500 500)`}>
        <rect x="-600" y={y} width="2200" height="120" className="rib" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="-600" x2="1600" y1={y + 24 + i * 18} y2={y + 24 + i * 18} className="rib-line" />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <text key={i} x={-200 + i * 110 + rand() * 30} y={y + 70 + (rand() - 0.5) * 50} className="rib-note">
            {glyphs[i % 4]}
          </text>
        ))}
      </g>
    );
  };
  return [band(60, -24, 'a'), band(640, -24, 'b'), band(380, 18, 'c')];
}

const ART = { solar: Solar, staff: Staff }; // 뉴모피즘은 그림 없이 판의 빛과 그림자만

export default function Backdrop({ theme, className = '' }) {
  const id = RINGS.find((r) => r.name === theme)?.id;
  const Art = ART[id];
  if (!Art) return null;
  return (
    <svg className={`backdrop ${id} ${className}`.trim()} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <Art />
    </svg>
  );
}

// 앱: 화면 맨 뒤(Dashboard .shell 첫 칸, 자리는 art.css .theme-backdrop). 그림 테마가 아니면 아무것도 안 그린다.
export function ThemeBackdrop() {
  return <Backdrop theme={useThemeName()} className="theme-backdrop" />;
}
