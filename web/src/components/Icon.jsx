// 선 아이콘(24 격자, 2px, 둥근 끝). 이모지는 쓰지 않는다.
const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  send: 'M12 19V5M6 11l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11l2.5 7v6H4z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};

export default function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
