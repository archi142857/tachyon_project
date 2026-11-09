# Tachyon · 컨셉 09 · GitHub 토큰 넣기, 화면 색 설명, 팀원에게 보낼 메시지

- 날짜: 2026-11-09
- 도구: Claude (claude.ai 프로젝트 세션, Claude Opus 5.5), GitHub REST API(gh), Google Drive 연결, Artifact 읽기
- 기록 유형: 사용자 직접 지시
- 목적: 사용자에게 걸린 일을 쉽게 다시 알리고, 의견 버튼용 GitHub 토큰을 앱에 넣는 과정을 돕고, 팀원에게 보낼 메시지를 쓴다.

## 프롬프트 원문

````text
엥 뭐 하라고?
````

(23:33) 사용자가 GitHub 'New fine-grained personal access token' 화면 캡처를 보냄. 글은 없음.

````text
no Expiration해도 됨?
````

````text
했음
````

````text
했음
````

(23:46) 사용자가 Cloudflare `tachyon` → Settings 화면 캡처를 보냄. 오른쪽 목록에서 Builds가 선택된 상태이고, 그 안의 'Variables and secrets' 칸에 `GITHUB_TOKEN`(Secret)과 `SKIP_DEPENDENCY_INSTALL`이 있음. 캡처의 계정 이메일은 기록에서 뺀다.

````text
???
````

````text
했음
````

````text
화면 색 번호는 뭐임
````

````text
디자인은 좀 나중에 정하기로 했음.
팀원한테 전할 메세지만 남겨줘봐
````

## 결과 요약

- 사용자에게 걸린 일을 코드(A-1 같은 번호) 없이 급한 순서로 다시 적어 줬다.
- GitHub 토큰: 이름 `tachyon-feedback`, 저장소 `tachyon_project`만, 권한 Issues 읽기·쓰기만. 만료는 'Custom 1년'을 추천했고 '만료 없음'도 괜찮다고 답했다(권한이 좁아서, 대신 앱을 그만 쓰면 지운다).
- 처음 넣은 곳이 Settings → Builds의 변수 칸이라 앱이 못 읽었다(`/api/health`가 계속 `GITHUB_TOKEN` 없음). 캡처로 원인을 찾아 위쪽 런타임 'Variables and Secrets'로 옮기게 했다.
- 확인: `/api/health` 빠진 비밀값 없음(23:47). `/api/feedback/error`로 시험 보고 → 이슈 #1이 라벨 '오류·자동'과 함께 만들어짐 → 확인 글을 달고 닫음.
- 화면 색 3안(1 코코넛 밝게, 2 그래파이트 어둡게, 3 짝 색 진한 칸)을 시안 파일에서 읽어 설명했다. 사용자가 디자인은 나중에 정한다고 해서 화면 세션에 쪽지로 알렸다(기한 없이 미룸).
- 팀원에게 보낼 메시지(사람이 직접 보냄, 사용자 계정 칸은 비워 둠):

````text
[Tachyon] 오늘 밤 정리 + 부탁 몇 개

부탁
1. 구글 로그인 테스트 사용자에 내 계정 넣어 줘: ________
   (Google Cloud 콘솔 → Google 인증 플랫폼 → 대상 → 테스트 사용자 → 추가)
   이게 돼야 나도 로그인해서 폰으로 확인할 수 있어.
2. Claude API 키가 console.anthropic.com에서 만든 키 맞는지, 월 지출 상한 걸었는지 알려 줘. 개인정보처리방침이랑 계획에 적으려고.
3. 11/13 전에 숫자 두 개만 (어림이면 돼): 하루에 일정·과제 옮기고 확인하는 데 몇 분 쓰는지, 지난 2주에 놓치거나 늦게 안 마감이 몇 개인지. 신청서 '효과' 칸 전후 비교용이야.
4. 시간 될 때 학교 ChatGPT Edu 설정(앱 → 고급 설정, 또는 보안 및 로그인)에 '개발자 모드' 칸 있는지 봐 줘. 이게 있어야 ChatGPT Edu에서 Tachyon 부르기(MCP)를 할 수 있대.

알림
- 이제 main에 올리면 자동 배포돼. Cloudflare 빌드 변수 SKIP_DEPENDENCY_INSTALL은 지우면 빌드가 깨지니까 그대로 둬 줘.
- 의견 버튼용 GITHUB_TOKEN 넣었고, 이슈 만들어지는 것까지 확인했어.
- 소통판 11/9 17:52 네 글에 네 gmail 주소가 그대로 있어. 나중에 레포 공개하면 보이니까 원하면 그 줄만 가려 줘.
- 디자인(색·브리핑 시안)은 나중에 같이 정하자.
````

## 바뀐 파일

- [docs/tachyon/계획.md](../docs/tachyon/계획.md)(의견 버튼 줄 메모), [docs/tachyon/소통.md](../docs/tachyon/소통.md)(GITHUB_TOKEN 완료 글), [docs/작업_기록.md](../docs/작업_기록.md), [prompts/README.md](README.md)
