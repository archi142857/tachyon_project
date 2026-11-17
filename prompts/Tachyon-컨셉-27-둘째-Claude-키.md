# Tachyon · 컨셉 27 · 둘째 Claude 키 넣기(API 나눠 쓰기)

- 날짜: 2026-11-17
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Claude in Chrome(사람 크롬에서 Claude Console · Cloudflare 대시보드 칸 채우기), 웹 검색(Claude 공식 도움말 · 문서), curl(`/api/health`), git, Node(node:test · vitest), faketime(시계 옮겨 시험)
- 기록 유형: 사용자 직접 지시
- 목적: 11-17 목록 첫 줄 'Claude API 나눠 쓰기'를 끝내기 — 사람의 구독 월 API 크레딧으로 둘째 키를 만들어 서버에 넣는다.

## 프롬프트 원문

(11-17 22:13)

````text
그래서 내 API는 공유 된 거지?
````

(22:14)

````text
뭐야 알려줘봐 하게
````

(22:17)

````text
너가 해줘. secret 빼고
````

(22:24)

````text
다 했음. 일단 그냥 개인 조직 만들었음.
````

(22:26)

````text
아 만료일같은 건 그냥 다 무제한으로 해줘
````

(22:28)

````text
팀원 초대는 되어 있음 그다음 어케 함?
````

(22:32)

````text
했음
````

## 한 일

- 22:13 질문에는 "아직 아님"(`/api/health`의 `ai_keys`가 1)으로 답하고, 남은 사람 손 세 단계를 알렸다.
- '너가 해줘. secret 빼고' → 키 값(비밀)만 빼고 Claude in Chrome으로 사람 크롬에서 진행했다.
  - 구독 월 API 크레딧을 받을 Console 조직: 사람이 개인 조직을 만들어 연결했다(22:24, 한 번 연결하면 직접 못 바꾼다).
  - Claude Console → API keys → 새 키 칸(이름 Tachyon, 만료 없음 — 22:26 '무제한')까지 채워 두었다. 키 만들기 · 복사는 사람이 했다.
  - 소통판 22:19로 dhsrua555에게 Cloudflare 멤버 초대를 부탁 → 22:28 초대 받음.
  - 사람이 Cloudflare에 직접 로그인 → tachyon → Settings → Variables and secrets → Add variable: 이름 `ANTHROPIC_API_KEY_2`, Secret, Production까지 채웠다. 값 붙여 넣기와 'Add variable and deploy'는 사람이 했다.
- 22:35 `/api/health` → `"ai_keys":2`. 다른 변수(빌드 변수 `SKIP_DEPENDENCY_INSTALL` 포함)는 건드리지 않았다.
- 키 값은 Claude가 만들거나 옮기지 않았다. 칸을 확인하려고 찍은 화면에 사람이 붙여 넣은 값이 함께 찍혀서, 바로 사람에게 알리고 그 캡처 파일을 지웠다(저장소 · 기록 · 드라이브 어디에도 없음).
- 서버 코드는 바꾸지 않았다: `worker/llm.js`가 이미 두 키를 번갈아 쓰고, 한 키가 키 오류(401 · 403)나 크레딧 부족이면 다른 키로 한 번 더 부른다.

## 이어서: 서버 시험 빨간불 고치기 (22:43)

컨셉이 "빨간불 테스트 한 줄 고쳐도 될까?"(사용자 확인 B-21)를 묻자:

````text
응 ㄱㄱ
````

- 원인: `worker/test/11_admin.test.js` '합계'가 `Date.now`를 11-13으로 고정해도, 시험 사용자의 가입 시각은 DB 기본값(SQLite 진짜 시계)이라 11-14부터 '11-13 새 사용자 1'이 0이 됐다(앱 동작 문제 아님).
- 고침: 그 사용자의 `created_at`을 시험 날짜로 적는 한 줄. 서버 212/212, 화면 198.
- 더 확인: faketime으로 시계를 11-25 · 11-30 23:30 · 12-15로 옮겨 서버 시험을, 11-25 · 11-30으로 옮겨 화면 시험을 돌려 봄 → 날짜 때문에 깨지는 시험 없음(동결 · 제출까지).

## 사람이 확인할 것

- 며칠 뒤 Claude Console → API keys → Tachyon 키의 Cost(또는 Usage)가 0보다 크면 둘째 키도 실제로 쓰이는 것이다. 안 먹는 키면 서버가 첫째 키로 넘어가 앱은 멈추지 않으므로, 이 칸으로만 알 수 있다.
