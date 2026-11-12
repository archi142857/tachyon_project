// 고리 시안 목록(사람 11-13 01:28 아이디어 넷). 새 시안 = 파일 하나 + 여기 한 줄.
import SolarRing, { legend as solar } from './태양계.jsx';
import StaffRing, { legend as staff } from './오선지.jsx';
import AtomRing, { legend as atom } from './원자.jsx';
import BirdRing, { legend as birds } from './새.jsx';

export const RINGS = [
  { id: 'solar', name: '태양계', idea: '고리에 행성들이 생긴다', Ring: SolarRing, legend: solar },
  { id: 'staff', name: '오선지', idea: '고리에 음표들이 생긴다', Ring: StaffRing, legend: staff },
  { id: 'atom', name: '원자 모형', idea: '고리에 전자들이 생긴다', Ring: AtomRing, legend: atom },
  { id: 'birds', name: '새', idea: '새들이 무리 지어 날아다닌다', Ring: BirdRing, legend: birds },
];
