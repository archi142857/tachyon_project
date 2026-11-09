# Tachyon · 컨셉 07 · 자동 배포 빌드 실패 원인 찾기와 크롬 확장용 프롬프트

- 날짜: 2026-11-09
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), Claude in Chrome(대시보드 열기 시도), GitHub REST API(gh), 웹 검색
- 기록 유형: 사용자 직접 지시
- 목적: Cloudflare Workers Builds(main에 올리면 자동 배포)가 계속 실패하는 원인을 찾고, 사용자가 크롬의 Claude 확장에 맡길 수 있게 고치는 순서를 프롬프트로 만든다.

## 프롬프트 원문

(18:18·20:23) 사용자가 Cloudflare 대시보드 화면 캡처를 보냄. 글은 없음. 캡처의 계정 번호·이메일은 기록에서 뺀다.

(20:28) 사용자가 실패한 빌드의 로그를 붙여 넣음. 요지: 초기화·복제·`npm clean-install`은 성공, 이어서 `pip install .`의 'Getting requirements to build wheel'에서 실패.

````text
그 크롬 확장 프로그램한테 줄 프롬프트 줘봐
````

## 결과 요약

- 18:18 캡처는 사용자 개인 계정에 tachyon을 새로 만드는 화면이라 Deploy를 누르지 않게 막고, 팀원 계정의 기존 tachyon에 연결하는 길을 알렸다(이후 팀 계정에 연결됨).
- 빌드 로그로 원인을 찾았다: 저장소 맨 위의 앞 출품작 `pyproject.toml`(pytest 설정) 때문에 Workers Builds가 `pip install .`을 돌리다 실패. 고침은 대시보드에서 빌드 변수 `SKIP_DEPENDENCY_INSTALL=true`(Cloudflare 공식 설정)와 Build command `npm ci`. `pyproject.toml`은 앞 출품작 시험이 쓰므로 그대로 둔다.
- 처음에 '0초 실패 → 빌드 토큰'으로 짐작한 것은 GitHub 기록을 잘못 읽은 것이라 소통판에 정정했다.
- 컨셉이 크롬 확장 패널에서 대시보드를 직접 읽으려 했으나 페이지가 응답하지 않아 멈췄고, 사용자 요청으로 확장에 줄 프롬프트를 아래처럼 썼다(계정 이메일은 기록에서 가림).

````text
Cloudflare 대시보드에서 Worker 'tachyon'의 자동 배포(Workers Builds) 빌드 설정을 고쳐 줘.

배경: 저장소 맨 위에 pyproject.toml(옛 pytest 설정)이 있어서 Workers Builds가 자동으로 `pip install .`을 돌리다 실패한다. 자동 의존성 설치를 끄고 npm만 직접 설치하게 바꾸면 된다.

먼저 확인:
- 왼쪽 위 계정 이름이 (팀원 계정)인지 확인. (내 개인 계정)이면 그 계정 이름을 눌러 팀원 계정으로 바꾼다. 개인 계정에는 아무것도 만들거나 바꾸지 마.

할 일:
1. Workers & Pages → tachyon → Settings 탭 → Build 칸으로 간다.
2. Build configuration을 열어(연필/Edit) 아래처럼 맞추고 저장한다.
   - Build command: npm ci
   - Deploy command: npx wrangler deploy (이미 이 값이면 그대로)
   - Root directory: / (그대로)
   - API token(빌드 토큰): 바꾸지 마.
3. 같은 Build 칸 안의 "Build variables and secrets"(빌드용 변수)에 하나를 추가하고 저장한다.
   - 이름: SKIP_DEPENDENCY_INSTALL
   - 값: true
   - 종류: 일반 텍스트(Text) 변수
   주의: Settings 위쪽의 런타임 "Variables and Secrets"(APP_SECRET, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID 같은 것이 있는 곳)는 절대 건드리지 마. 빌드용 변수 칸에만 넣는다.
4. Deployments 탭 → 맨 아래 "View build history" → 가장 최근 실패한 빌드의 ⋯ → Retry build.
5. 빌드가 끝날 때까지 기다린 뒤 결과를 알려 줘.
   - 성공이면: "성공"과 배포된 버전/커밋.
   - 실패면: 어느 단계(Initializing/Cloning/Installing/Building/Deploying)에서 멈췄는지와 빨간 오류 첫 5줄.

하지 말 것: 빌드·배포·Worker·변수 지우기, API 토큰 만들기·바꾸기, 런타임 비밀값 보기·바꾸기, 결제·멤버 설정. 이 목록에 없는 버튼을 눌러야 하거나 화면이 설명과 다르면 멈추고 물어봐.
````

## 바뀐 파일

- [소통판](../docs/tachyon/소통.md), [계획](../docs/tachyon/계획.md), [인수인계](../docs/tachyon/인수인계.md), [README](../README.md), [작업 기록](../docs/작업_기록.md), [프롬프트 목록](README.md)
