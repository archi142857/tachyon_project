# 캠퍼스 자료 (수업 사이 동선)

화면이 처음 쓸 때만 따로 받는 파일들이다(첫 화면을 늦추지 않게). 모두 TT Wizard(같은 사람이 만든 앞 프로젝트, https://github.com/archi142857/tt-wizard) 자료다.

| 파일 | 내용 | 어디서 | 조건 |
| --- | --- | --- | --- |
| `campus.json` | 건물 135곳(번호·이름·좌표)과 건물 사이 걷는 분(경사 반영, 가는 방향마다 다름) | 저장소 `data/walk.csv`·`data/buildings.csv`(TT Wizard `travel_slope.csv`·건물 좌표)를 `web/scripts/campus.mjs`가 바꿈 | ODbL 1.0 — © OpenStreetMap 기여자 · © 캠퍼스 마법 지도 · 국토지리정보원(경사), `data/README.md` |
| `route_paths.json` | 건물 두 곳 사이 걷는 길 모양(Google polyline, 소수 5자리, `"a\|b"` 하나로 두 방향) | TT Wizard `data/route_paths.json`(커밋 c747fc4, 2026-11-09)을 그대로 복사 | ODbL 1.0 — © OpenStreetMap 기여자 · © 캠퍼스 마법 지도. 전문은 `data/ODbL-1.0.txt` |

- 화면에 늘 출처를 적는다(`src/campus.js`의 `CAMPUS_CREDIT`, 하루 동선 지도 아래 줄).
- TT Wizard의 바탕 지도(`basemap.json`)는 가져오지 않았다. 국토지리정보원 수치지형도에서 만든 층이 있어, 해외 서버에 올리는 일은 TT Wizard 쪽에서도 허가를 받기 전이다(TT Wizard `docs/topo.md`). 그래서 하루 동선 지도는 바탕 없이 길 선과 건물 점만 그린다.
- 자료가 바뀌면: `campus.json`은 `node web/scripts/campus.mjs`, `route_paths.json`은 TT Wizard에서 다시 복사(건물 번호가 `campus.json`과 같아야 한다 — `src/campus.test.js`가 본다).
