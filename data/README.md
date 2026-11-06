# GPT용 자료

TT Wizard 자료: 캠퍼스 마법 지도·© OpenStreetMap 기여자, 국토지리정보원, 서울대 수강편람

`scripts/sync_ttwizard.py`가 만드는 자료입니다. 교수 이름, 성적표, 학생 정보, 고도·등고선·경사 표·3D 지형은 저장하지 않습니다. 원본 강좌 파일은 메모리에서만 읽고 교수 열을 버립니다.

## 출처와 조건

| 출력 | 읽는 TT Wizard 파일 | 원자료와 조건 |
| --- | --- | --- |
| `offerings/{학기}.json` | `data/history/{학기}.json` | [서울대 수강편람](https://sugang.snu.ac.kr/). 정규학기 학사 강좌만 추출. 서울대학교 원자료의 조건을 유지하며 MIT 대상이 아닙니다. |
| `walk.csv` | `data/travel_slope.csv` | [캠퍼스 마법 지도](https://moreadorecampus.com/)·[© OpenStreetMap 기여자](https://www.openstreetmap.org/copyright)·[국토지리정보원](https://map.ngii.go.kr/). 계산된 분 단위 시간만 사용. OSM 부분은 ODbL 1.0, 국토지리정보원 부분은 공공누리 제1유형 출처 표시. 캠퍼스 마법 지도 부분의 별도 재사용 조건도 유지합니다. |
| `buildings.csv` | `data/buildings.csv`, `data/campus_buildings.csv`, `data/dorm_buildings.csv`, 필요한 경우 `data/buildings_for_magicmap.csv` | TT Wizard가 정리한 건물·기숙사 위치. [서울대 캠퍼스맵](https://map.snu.ac.kr/) 등 원자료별 조건을 유지합니다. 이동시간 표에 없는 지점은 내보내지 않습니다. |
| `likelihood.csv` | 이 저장소의 `offerings/` | 위 수강편람에서 계산한 같은 학기 개설 횟수. 개설 확률이나 다음 학기 개설 보장이 아닙니다. |

코드의 MIT 라이선스는 이 자료에 적용되지 않습니다. 이 프로젝트가 추가·구성한 데이터베이스는 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)로 공개하며, 원자료의 별도 권리·조건을 그대로 유지합니다. 배포 시 이 출처와 조건 안내도 함께 제공합니다.

[ODbL 전문](ODbL-1.0.txt)은 TT Wizard의 `web/licenses/odbl.txt`에서 가져왔습니다.

## 동기화

```sh
python scripts/sync_ttwizard.py
python scripts/sync_ttwizard.py --source "D:\프로젝트 폴더\코딩\TT Wizard\tt-wizard"
python scripts/sync_ttwizard.py --as-of-year 2026
```

기본 경로는 `D:\프로젝트 폴더\코딩\TT Wizard\tt-wizard`입니다. 이 저장소의 허용된 자료만 읽고 형제 폴더는 열지 않습니다. 다른 PC에서는 로컬 저장소 경로나 `https://raw.githubusercontent.com/Archi142857/tt-wizard/main/` 주소를 `--source`로 지정할 수 있습니다. 2021년부터 기준연도 다음 해까지 `1`, `2`학기 파일 이름을 만들고 존재하는 파일만 읽습니다. 계절학기 `S`, `W`는 가져오지 않습니다. 없는 학기만 건너뛰며, 다른 통신 오류나 형식 변경은 실패로 알립니다.

원본 `fields`는 과목 `id,name,dept,credit,cls,program,sections`, 분반 `no,instructor,status,meetings`, 시간 `day,start,end,building,room`과 정확히 같아야 합니다. 달라지면 임의로 해석하지 않고 중단합니다.

학사 과목의 분반은 원본 상태를 유지합니다. `폐강대상`은 삭제하지 않습니다. 이는 개설 이력 자료이며 실제 수강 가능한 분반을 확정한 목록이 아닙니다.

모든 입력과 결과를 검증한 다음 생성 파일을 갱신합니다. 형식·통신 검증 실패 시 기존 자료를 유지합니다. 같은 입력과 기준연도라면 같은 결과가 나옵니다. 더 이상 수집 목록에 없는 정규학기 생성 파일만 정리하며 졸업요건과 설명 파일은 보존합니다. 생성 파일은 직접 고치지 마세요. 자동 커밋·푸시·일일 갱신은 하지 않습니다.

교수 정보는 분반의 교수 칸과 원본 메타를 버려 제거합니다. 출력이 허용된 원본 열로만 구성됐는지 대조하고, 테스트에서는 교수 칸과 메타에 넣은 고유한 합성 표식이 파일·로그·오류에 남지 않는지 검사합니다. 실제 인명과 같은 글자가 공식 과목명의 일반 명사로 쓰일 수 있으므로, 모든 이름 문자열을 전역 검색해 과목명을 삭제하거나 바꾸지 않습니다. 공식 과목명은 원문을 보존합니다.

## 파일 형식

`offerings/{학기}.json`:

```text
{"meta": {...}, "courses": [
  [교과목번호, 과목명, 개설학과, 학점, 이수구분,
   [[강좌번호, 상태, [[요일, 시작, 끝, 동번호, 강의실], ...]], ...]], ...
]}
```

요일은 0=월요일부터 5=토요일, 시각은 자정부터의 분입니다. 모르는 칸은 빈 문자열을 유지합니다. 교수 칸과 과정 칸은 출력에서 제거합니다.

- `walk.csv`: `from,to,minutes`. 자기 자신을 제외한 135×134개 방향 쌍. 오르막·내리막을 대칭으로 바꾸지 않습니다.
- `buildings.csv`: `building,name,lat,lon`. 이동시간 표의 135개 지점 모두. 이름이 없으면 건물 번호로 표시합니다. 기본 세 좌표 파일로 부족할 때만 TT Wizard의 `data/buildings_for_magicmap.csv`를 읽습니다. 확인한 원본에서는 71-1동과 정문(`GATE`)이 여기에 있습니다. [원본 내보내기 코드의 `export_campus`](https://github.com/Archi142857/tt-wizard/blob/35f947f4f9471ac2cdae58c97361c40f6070a6fe/scripts/export_web.py)도 같은 파일로 보완합니다. 이 파일의 비고·연도 열은 버립니다. 그래도 좌표가 없으면 임의로 만들지 않고 실패로 알립니다.
- `likelihood.csv`: `course_id,name,term,years_offered,last_offered,last_sections`. 같은 과목의 여러 분반은 한 해의 개설 1회로 셉니다. 최근 5년은 기준연도-4부터 기준연도까지이며, 미래 학기는 `years_offered`에 포함하지 않습니다. `last_offered`·과목명·`last_sections`는 공개된 미래 학기를 포함해 가장 최신 편람을 따릅니다. `last_sections`는 그 학기의 분반 수입니다. 학사 과목만 셉니다.
- `source_manifest.json`: 계산 기준연도, 로컬/HTTP 구분, 읽은 파일의 상대경로와 SHA-256(파일 내용 식별값), 학기별 과목·분반 수. 시각과 개인 절대경로를 넣지 않아 같은 자료를 다시 만들었는지 확인할 수 있습니다. 개설 빈도를 사용할 때 이 파일의 기준연도도 함께 확인합니다.

## 확인 필요

2026-11-07에 다시 확인한 [TT Wizard README](https://github.com/Archi142857/tt-wizard/blob/693fe91649e3aa6cf0ac244a67d38e259fe62ff2/README.md#라이선스와-자료-조건)와 [캠퍼스 마법 지도 자료 설명](https://github.com/Archi142857/tt-wizard/blob/693fe91649e3aa6cf0ac244a67d38e259fe62ff2/data/magicmap/README.md)은 보행 그래프와 파생 이동시간을 다른 이용자가 사용할 때 **ODbL 조건을 적용**한다고 명시합니다. 허용된 로컬 원본의 해당 HEAD와 문서 고지를 확인했으며, 모든 재사용에 별도 허락이 필요하다는 이전 표현을 정정합니다. 출처·라이선스·변경 내역 등 해당 조건은 계속 따릅니다.

학교 강좌·건물 자료의 별도 이용 조건, GPT 공유에 필요한 콘텐츠 권한과 ODbL의 관계, 지형에서 계산한 분 단위 시간의 적용 범위는 각각 확인이 남아 있습니다. 이를 모든 로컬 계산의 중단 조건으로 확대하지 않습니다. 근거·미확인 범위·확인할 곳은 [Legal 검토 L01~L06](../docs/legal/검토_현황.md)에 있습니다. 이 정정은 학교 회신·개별 허가 취득 또는 실제 GPT 공유 완료를 뜻하지 않습니다.

다음 단계의 GPT 설명과 답 끝에도 위 출처 문장을 넣습니다. GPT 지식 파일에는 이 조건 안내를 포함합니다.

