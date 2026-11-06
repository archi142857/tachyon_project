# Research 03 — AI 지시·수정 요청·실제 발송 원문

- 날짜: 2026-11-07
- 출처 분류: AI 세션 간 작업 지시·수정 요청·결과 보고. 사용자의 말을 인용한 AI 전달도 이 분류에 속한다.
- 사용자 직접 지시는 [Research-01](Research-01-졸업요건-초안-검토.md), Concept 실행 배정과 Planner 질문의 수신 원문2건은 [Research-02](Research-02-2C해석과-구조화제안.md)에 있다.
- 공개본 처리: 내부 채팅·메시지 UUID는 `[내부 식별자 생략]`, 실명 사용자 경로가 있는 경우 `[개인 사용자 경로 생략]`으로 바꾼다. 이 생략 외 발송 원문의 수치·띄어쓰기·문장을 고치지 않는다. Git 커밋 및 공개 과목 ID는 내부 채팅 식별자와 구분한다.
- 원문 확보: 실제 발송 도구 인자와 현재 대화에 남은 하위 작업 도구 인자를 사용했다. 원래 딥 리서치 프롬프트를 재구성한 기록이 아니다.
- 결과 기준: 전달 성공은 수신자의 구현·배포 완료와 다르다. 이전 보고의 당시 수치(84/6 등)는 이후85/5로 고쳐진 이력이므로 원문 그대로 둔다.

## 수신 기록 — AI 내부 지시

### IN-1. 종료 안내 규칙 통지

- 발신: Project / Concept → 수신: Project / Research
- 결과·미완료: 규칙 확인 완료. 당시 새 개발·공통 문서 편집·재전송 없음.
- 관련 파일: [Research 인수인계](../docs/sessions/Research.md), 이 파일

```text
사용자가 Project / Concept 세션에서 다음과 같이 공통 지시했습니다: “앞으로 작업을 끝낼 때마다 어떤 세션한테 무슨 작업을 시킬지 마지막에 알려줘. 다른 세션도 마찬가지”

이를 반영해 작업 저장소 D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition 의 AGENTS.md ‘모든 세션의 마지막 안내’, docs/세션_운영.md ‘작업 종료 시 마지막 안내’, 역할별 시작 프롬프트를 갱신했습니다. 최신 지침을 읽고 앞으로 적용해 주세요.

최종 응답 맨 마지막에 최우선 다음 담당의 정확한 전체 세션명, 지금 진행 가능/선행 조건, 그 세션에 복사할 요청을 써 주세요. 요청에는 인수인계·입력, 할 일·산출물, 완료 기준을 넣습니다. 독립적으로 병행할 일만 두 번째로 추가하고, Document를 매번 필수 선행 단계로 삼지 않습니다. 자기 후속이면 자기 이름을, 바로 할 일이 없으면 없음과 재개 조건을 적습니다. 검증·커밋 정보는 이 마지막 안내 앞에 둡니다.

이번 통지는 응답 규칙 적용 요청입니다. 규칙 확인만 하고 짧게 답해 주세요. 이 통지로 새 기능 개발이나 공통 문서 편집을 시작하지 말고 다른 채팅으로 재전송하지 마세요. 별도 회신 메시지를 Concept에 보내지 않아도 됩니다.
```

### IN-2. 통합 커밋 준비·쓰기 동결 지시

- 발신: Project / Concept → 수신: Project / Research
- 결과·미완료: 산출물3파일 보고 후 쓰기 중단. 아래 기록 보완 지시에 한해 다시 기록을 편집함. Research는 커밋·푸시하지 않음.
- 관련 파일: [Research 인수인계](../docs/sessions/Research.md), 이 파일

```text
Concept에서 통합 커밋을 준비합니다. 사용자가 방금 이 채팅에서 '커밋 메세지 작성해서 푸시하는 것까지 그냥 너가 해줄 수 있음?'이라고 직접 요청해 이번 결과의 커밋·푸시를 승인했습니다. 기존 사용자 직접 커밋 규칙은 이번 승인 범위에서 Concept이 수행하며, 여러분은 git add/commit/push를 하지 마세요. 현재 배정받은 첫 산출물과 검증·기록을 완료하고, 다음 기능은 아직 시작하지 말고 이번 커밋에 포함 가능한 담당 파일과 테스트 결과를 Concept에 보고해 주세요. 보고 후 해당 파일 쓰기는 통합 커밋 완료 통지까지 멈춰 주세요. 아직 시간이 오래 필요한 파일은 미완료 파일 목록을 알려 주면 이번 커밋에서 제외하겠습니다. Document는 최신 수신 결과를 통합하되 미완료를 완료로 표시하지 마세요. 단순 수신 확인 회신은 필요 없습니다.
```

### IN-3. 출처 분류·실제 발송 원문 보완 지시

- 발신: Project / Concept → 수신: Project / Research
- 결과·미완료: Research-01·02의 출처 분류와 비공개 식별자 생략, 이 원문 기록과 인수인계 보완. 기능 개발은 대기.
- 관련 파일: [Research 인수인계](../docs/sessions/Research.md), 이 파일

```text
Concept 추가 지시입니다. 사용자가 방금 '물론 하고 있겠지만 작업들 다 기록 잘 해둬야 함. 내가 작성한 명령이 아니더라도 다 기록해둬야 함. 대신 내가 내린 명령이랑 분류만 해둬줘'라고 직접 요청했습니다. 이번 커밋에 포함해 prompts 기록에 출처 구분을 명시하세요: 사용자 직접 지시 / AI 세션 간 작업 지시·수정 요청·결과 보고 / 미실행 제안. 인간의 말을 인용한 내부 전달도 발신자가 AI이면 내부 기록입니다. 본인이 이번에 실제 보낸 요청·보고를 모두 원문과 수신 담당·결과/미완료·관련 파일로 남기고, 받은 지시도 기존 자기 프롬프트 기록에서 분류하세요. 새로 파일을 추가해도 됩니다. 원문에서 내부 채팅·메시지 식별자, 실명 개인 경로, 토큰 등 공개할 필요 없는 값은 [내부 식별자 생략]처럼 가리고 그 사실을 명시하세요. 특히 일부 새 프롬프트에 Concept 채팅 ID가 그대로 있어 수정이 필요합니다. 수신 확인만 반복 발송하지 말고 기록 보완 후 포함파일 목록과 완료 보고를 한 번만 주세요. 이 기록 보완은 통합 커밋 전 허용하며 다음 기능 개발은 계속 대기합니다.
```

## 발신 기록 — 기존 프로젝트 세션

### OUT-1. Project / Backend / Planner

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Backend / Planner
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
Research 해석 입력(자료1.0 변경 없음): 자동5개는 biology-main-R06→생명과학부/주전공, biology-double-R05→생명과학부/복수전공(두 항목 모두 M1410.000100·M1410.000200·3346.328 전부, 합5학점), chemical-main-R03/R04/R05→화학생물공학부/주전공만(각각5중3·9학점,2중1·1학점,개론9중1·3학점)입니다. 화생 복수전공에는 주전공3개를 부과하지 않습니다. 동물 주/복수 및 화생 복수 자동 항목은0개이며 빈 결과를 졸업충족으로 보지 마세요. common은 선택한 주전공 소속의 규정 요약이며 타소속 복수전공만으로 붙이지 않습니다. 전공간 중복 인정은 승인연도+공통인정과목+실제승인 미확정이므로 승인5개는 항목별 과목대조만 허용, 전체 이수학점 합산/다전공 공동배정은 확정하지 않습니다. docs/졸업요건_검토.md에 상세 대응표·교양·중복경계와 다음1.1 제안을 보완 중입니다. 기존2-C를 계속 진행하세요. 필요한 계약 질문만 알려주시면 됩니다.
```

### OUT-2. Project / Backend / Planner

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Backend / Planner
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
그 해석은 1.0/이수내역v1의 보수적 임시 처리로 적절합니다. 다전공 존재 자체가 학교 규정상 모든 과목의 인정 불가를 뜻하지 않으므로, '목록 대조 결과(참고)'와 '과목 귀속·공통인정·승인정보 부족으로 최종 인정 확인 필요'를 구분해 주세요. 승인연도만 추가돼도 자동해결되지는 않습니다(공통 인정 과목과 실제 승인 필요). 관련 명시목록의 관측 학점/과목수는 보여줄 수 있으나 전공별 확정 인정학점·졸업충족으로 합산하지 마세요. partial/unknown 입력의 차이는 '관측상 부족량'이며 실제 남은학점으로 단정하지 않는 처리도 타당합니다. common을 지원 주전공1개일 때만 연결하고 타소속 복수전공만으로 부과하지 않는 방식에 동의합니다. docs/졸업요건_검토.md의 이번 후속절에 이 해석과 한계를 명시하고 완료본 경로를 다시 보내겠습니다. 2-C 진행을 기다릴 필요는 없습니다.
```

### OUT-3. Project / Backend / Planner

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Backend / Planner
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
공식 원문 재확인 중 교양 적용의 중요한 예외를 확인했습니다. 생명과학부 교과과정(https://biosci.snu.ac.kr/academics/curriculum/undergraduate, 2025~2026학번 첫 문단)은 자유전공학부의 생명과학 주전공생은 교양을 자유전공 기준으로 적용하고 생물학1·2/실험만 필수라고 명시합니다. 이수내역v1의 name/kind만으로 소속 단과대학을 구별할 수 없습니다. 따라서 common을 지원 주전공1개에 연결하더라도 '세 소속 일반학생 기준의 참고 묶음/소속 확인 필요'로 표시하고, 이 연결을 교양 적용범위 확정으로 표현하지 마세요(현1.0 common 전항목manual인 점과 일치). 프로그램 이름만으로 소속을 추정하는 계약은 향후 home_unit/입학경로 최소 필드 검토가 필요합니다. 자유전공 생명 주전공의 전공부분 조건은 동일하다는 문구도 있으나 교양46학점 자동 부과는 안 됩니다.
```

### OUT-4. Project / Backend / Planner

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Backend / Planner
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
Research 해석 보완 완료: docs/졸업요건_검토.md의 '2-C 해석 보완과 다음 구조화 제안' A~C절과 docs/sessions/Research.md 후속절을 읽어 주세요. 입력은 고정1.0+이수내역v1 그대로입니다. 자동5개 name/kind 대응, 총량 중복가산 금지, 타소속 복수/자유전공 교양 예외, 다전공 관측값과 최종 인정 보류, partial 관측상 부족량을 명시했습니다. 2-C 완료기준에85차단 보존·5대응·다전공 입력부족 표시·자유전공 교양 자동부과 방지를 반영해 주세요. D~E의 화생 복수14자리/동시학기/동일그룹은 2-C 후1.1 제안으로 아직 적용하지 않습니다. 보호12파일 변경0, 형식검사통과, 현재 전체196+하위9통과. 단순 수신확인 회신은 필요 없습니다.
```

### OUT-5. Project / Concept

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Concept
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
Research 실행 배정 완료. docs/졸업요건_검토.md 후속 A~E절, docs/sessions/Research.md 후속 기록, prompts/Research-02-2C해석과-구조화제안.md 작성. 현행data/requirements+검증코드/테스트 보호12파일 SHA256변경0; 자동5/수동85유지. Planner에5항목name/kind·교양범위·다전공보류 해석을 직접 전달했고 질문에도 회신했습니다. 새 확인: 자유전공 생명 주전공은 교양이 자유전공기준이어서 입력name/kind만으로 자연대46 자동부과 금지. 동물 복수교양의 참조웹은2017년도이므로2025미확정 유지. 다음1.1 제안 우선순위: (1)화생복수14필수자리와 응용생화학1 구/신코드의 해당행 한정OR, (2)생물학 이론/실험 두쌍 동일학기, (3)생명 전필6중4 동일그룹·전필전선배정, (4)화생주전공 신코드12목록. 사실확정/구조화부족/적용미확정을 나누고 경계사례를 문서화했습니다. 1.1은미구현이며2-C고정계약 검증 후 별도변경묶음으로 범위확정 제안합니다. 전체196 passed+하위9(실행시점 공유폴더),형식통과. 커밋·푸시없음. 새 JSON변경은 시작하지 않았습니다. 다음 조율 때 D~E의 우선순위·버전경계를 확정해 주세요. 단순 확인회신은 필요 없습니다.
```

### OUT-6. Project / Document

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Document
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
Research 후속 완료 및 통합용 보고: 이번 변경3파일은 docs/졸업요건_검토.md(후속A~E절), docs/sessions/Research.md(후속결과·전달·동결), prompts/Research-02-2C해석과-구조화제안.md입니다. 1.0 데이터/검증코드/테스트 보호12파일 변경0, 현재자동5/수동85그대로. 5항목전공대응·교양소속예외·중복인정경계를 Planner에 전달했고 1.1후보4묶음은 제안으로만 정리했습니다. 1.1구현 완료로 표기하지 마세요. 전체196 passed+하위9,형식검사통과,문서링크누락0. Concept통합요청에 따라 이번보고 후3파일 쓰기를 멈춥니다. 별도 수신확인 회신은 필요 없습니다.
```

### OUT-7. Project / Concept

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Project / Concept
- 결과: 실제 발송 도구 성공 확인. 수신 담당의 구현·커밋 완료를 이 전달 결과로 주장하지 않음.
- 관련 파일·남은 일: [검토 문서](../docs/졸업요건_검토.md), [Research 인수인계](../docs/sessions/Research.md). 1.1은 미실행, 통합은 Concept 담당.

```text
Research 통합 포함파일 확정 보고: docs/졸업요건_검토.md, docs/sessions/Research.md, prompts/Research-02-2C해석과-구조화제안.md의3개입니다. 첫 배정 산출물·검증·기록 완료, 오래 걸리는 미완료 파일없음. 1.1은 제안만이며 현행1.0데이터+검증코드+테스트 보호12파일 해시변경0. 전체196 passed,9 subtests passed(6.19초),형식검사0,문서링크누락0,diff공백검사통과. Planner에 해석 입력, Document에 통합 요약 전달완료. 이 메시지 이후 통합커밋 완료 통지까지 담당3파일 쓰기와 다음기능 착수를 멈춥니다. Research는git add/commit/push 하지 않았습니다. 통합 후1.1은 문서D~E 우선순위와 버전경계에 따라 별도배정해 주세요.
```

## 발신 기록 — Research 하위 작업

하위 담당은 새 사용자 소유 세션이 아니라 Research가 사용한 조사·구현 보조 작업이다. 아래 요청들은 모두 AI가 작성했다. SUB-1~8은 앞선2-A 실행 원문을 이번에 추가 보존한 기록이며, SUB-9~10이 이번2-C 지원 추가 조사다.

### SUB-1. 2-A 조사 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 동물생명 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
Research 2-A 하위 조사. 저장소 D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition. 원본은 부모 output/snu_2025_graduation_requirements.json에 실제 있음. AGENTS 및 세션지시 따름. 동물생명공학전공 주전공/복수전공 두 묶음 공식 출처 웹 확인. 초안 사실 변경 금지, 충돌/미확인 표시. data/requirements/reviews/animal.json 파일만 작성: {reviewed_on,sets:[{set_index,summary,items:[{section:'requirements'|'other_conditions',index,status:'confirmed'|'partial'|'unverified'|'conflict',reason,evidence:[{url,title,locator,applies_to,observed}]}]}]}. 각 항목 빠짐없이 검토; 확인 못하면 명시. 원본 전문 복제 대신 사실 요약/근거. 결과 메시지로 주요 내용. 다른 파일 편집 금지.
```

### SUB-2. 2-A 조사 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 생명과학 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
Research 2-A 하위 조사. 저장소 D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition. 원본 부모 output/snu_2025_graduation_requirements.json. AGENTS 및 세션지시 따름. 생명과학부 주전공/복수전공 두 묶음 공식 출처 웹 확인. 초안 사실 변경 금지, 충돌/미확인 표시. data/requirements/reviews/biology.json만 작성: {reviewed_on,sets:[{set_index,summary,items:[{section:'requirements'|'other_conditions',index,status:'confirmed'|'partial'|'unverified'|'conflict',reason,evidence:[{url,title,locator,applies_to,observed}]}]}]}. 각 항목 빠짐없이 검토; 미확인 명시. 과목코드/학점/필수선택/권장학기/선수대체중복 규칙 세부 검증. 원본 전문 복제 대신 사실요약. 다른 파일 편집 금지.
```

### SUB-3. 2-A 조사 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 화생 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
Research 2-A 하위 조사. 저장소 D:\대학교\비교과\ChatGPT Edu 활용 상시 공모전\tt-wizard-gpt-edition. 원본 부모 output/snu_2025_graduation_requirements.json. AGENTS 및 세션지시 따름. 화학생물공학부 주전공/복수전공 두 묶음 공식 출처 웹 확인. 초안 사실 변경 금지, 충돌/미확인 표시. data/requirements/reviews/chemical.json만 작성: {reviewed_on,sets:[{set_index,summary,items:[{section:'requirements'|'other_conditions',index,status:'confirmed'|'partial'|'unverified'|'conflict',reason,evidence:[{url,title,locator,applies_to,observed}]}]}]}. 각 항목 빠짐없이 검토; 미확인 명시. 과목코드/학점/필수선택/권장학기/선수대체중복 규칙 세부 검증. 원본 전문 복제 대신 사실요약. 다른 파일 편집 금지.
```

### SUB-4. 검증기 구현 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 동물생명 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
추가 작업: scripts/validate_requirements.py와 tests/test_validate_requirements.py를 작성해 주세요. 저는 JSON/schema 생성 중. validator 표준라이브러리만 사용, schema.json 제한된 JSON Schema 키 $ref/$defs/type/enum/const/properties/required/additionalProperties/items/minItems/maxItems/minimum/maximum/minLength/pattern/anyOf 검증기(지원 외 키 조용히 무시 금지; $schema,title,description,$id 메타 허용). API validate(data, schema=None)->list[str], schema 기본 repo/data/requirements/schema.json. CLI 경로 optional 기본2025.json --strict-facts 플래그: 구조오류 exit1, needs_check 항목 있으면 strict exit2, 기본 성공0. 스키마통과와 사실확인 구분 출력. 데이터 원본 구조 basis,sets 유지 + schema_version='1.0', provenance {source_file,sha256,original_prompt_status}, 각 set id, 각 requirement/other condition id, original_pointer, draft_needs_check, needs_check, review {status,reason,evidence:[{title,url,locator,applies_to,observed}],reviewed_on}, calculation {mode:'course_list'|'manual_review',reason,selector:{kind:'course_codes'|'manual',codes:[]}}. semantic: 7 set names/kinds 정확한 구성, 중복 id/course code, needs_check false requires confirmed/nonempty source+evidence, original draft true 지우지 않음, calculation manual -> needs_check true, course_list requires 명시과목 nonempty/no course_filter/confirmed/needs_check false/선수대체 없음, min_count>course count reject, min_credits null only needs_check, all empty only needs_check+manual, 과목 코드 regex ^[A-Z]?[0-9]+\.[0-9]+[A-Z]?$; bool 숫자허용 금지. raw equivalents.accepted 는 설명문 포함 가능(원문보존); calc course_list 금지. rule all/min_count/min_credits. 테스트 unittest 기반 pytest도 실행가능, 데이터 경계 오염 오류 케이스 meaningful. 두 파일만 쓰고 끝나면 알려주세요. 스키마 제안 필요하면 메시지.
```

### SUB-5. 자료 생성 보고·검증 보강 요청

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 동물생명 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
schema.json 및 2025.json 생성 완료. 7묶음90항목 보존,84 needs_check(사실 미확인+기계화 대기),6 course_list. 스키마 날짜 source 상태 등 살펴보세요. calc code_list 과목과 selector.codes 일치도 검증. 원본 SHA256 provenance 검증 CLI에서 read bytes 후 비교 필요. 일반 validate(data) 원본 필드 보존검사 별도 함수 혹은 테스트로 검사. Python 실행 C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt/dependencies/python/python.exe ; pytest .test-tmp/research/deps 설치중. 환경 PYTHONPATH 그 경로 설정 후 실행 가능. 테스트 직접 run unittest 가능.
```

### SUB-6. 독립 검토 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 생명과학 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
독립 검토 추가: 지금 생성된 data/requirements/2025.json 및 schema.json 읽고 6개 calculation.mode course_list 안전성, 원문 필드 보존 및 확인 필요 누락 있는지 검토. 파일 편집 없이 오류/권고 메시지만. 원본 parents output, 복사본 data/requirements/source. 사실 확인과 계산가능 상태 혼동 방지에 집중. 특히 note에 필수조건 있는데 course_list로 넘어간 항목.
```

### SUB-7. 스키마 오류 수정 보고

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 동물생명 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
validator 실행 schema 에러 prereq.course 생명연구실습 설명문 2건. 원본 보존 위해 schema prerequisite.course string로 제가 변경합니다. 코드형 강제는 courses.code 및 selector.codes만, raw 관계 양쪽 설명문 허용(auto는 차단). 독립검토 biology-main-R09 note 동시수강 조건 누락 발견 manual로 제가 변경. 테스트 추가 원본 보존 케이스. pytest 설치 대상 사용자TEMP/codex-research-2a-deps 시도 중; 프로젝트 임시 권한거부.
```

### SUB-8. 최종 보강 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 동물생명 검토
- 결과·미완료: 2-A 구현·검토에 반영. 당시6개 후보 중 동시학기 조건을 발견해 최종 자동5개·수동85개로 정리했고 Research32개 테스트가 통과함. 규정 미확인 항목은 남김.
- 관련 파일: data/requirements/reviews/, scripts/validate_requirements.py, tests/test_validate_requirements.py, [인수인계](../docs/sessions/Research.md)

```text
마지막 보강 부탁. version1.0 course_list 승인 ID 5개(biology-main-R06,biology-double-R05,chemical-main-R03,chemical-main-R04,chemical-main-R05)를 validator에 explicit frozenset whitelist 두어 미승인 id를 auto로 전환 못하게. 이는 note 동시학기 등을 구조화 안 한 상태에서 자동 판정을 허용하지 않기 위함. 테스트 biology-main-R09를 confirmed+needsfalse+course_list/codes일치로 조작해도 reject 추가. tests에 needs_check.json 집합이 실제 true ID와 일치 및 reviews 4파일 90개 위치가 2025.json review와 일치 test 추가. 코드/테스트만 편집. 완료후 제가 전체 한번 재실행. docs whitelist판정 계약 반영하겠음.
```

### SUB-9. 2-C 지원 추가 조사 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 생명과학 검토
- 결과·미완료: 추가 공식 조사 결과를 받아 후속 제안에 반영. 현행1.0 파일 변경 없음. 1.1 구현은 미실행.
- 관련 파일: docs/졸업요건_검토.md 후속 D~E절, [인수인계](../docs/sessions/Research.md)

```text
새 배정 Research 후속. 현재 data/requirements/1.0와 검증코드/테스트 수정 금지, 파일 편집 없이 조사 결과만 보고. 공식 생명과학부 자료 추가 조사로 manual biology-main-R09(생물학 이론+실험 동시학기), biology-main/double 전필 선택4과목, 연구실습 중 다음 자동화 효과 큰 후보 1~2개 선정. 현재 사실확정 vs 구조화부족 vs 사실미확정 구분. 정확한URL/절, 2025적용, 코드·학점·동시학기 근거와 제안 조건/경계사례 제공. 주전공/복수전공 적용 및 기존 자동5개 중 bio 필수전선3과목 중복제한도 설명. 원문 개정하지 말고 이번 방문 확인만 보고.
```

### SUB-10. 2-C 지원 추가 조사 지시

- 출처: AI 세션 간 작업 지시·수정 요청·결과 보고
- 발신: Project / Research → 수신: Research 하위 화생 검토
- 결과·미완료: 추가 공식 조사 결과를 받아 후속 제안에 반영. 현행1.0 파일 변경 없음. 1.1 구현은 미실행.
- 관련 파일: docs/졸업요건_검토.md 후속 D~E절, [인수인계](../docs/sessions/Research.md)

```text
새 배정 Research 후속. 현행1.0 데이터·코드·테스트 수정 금지. 파일 편집 없이 조사 보고. 화생 다음 자동화 고효과 후보 chemical-double-R01 14과목42+응용생화학 코드 병기, chemical-main-R02 전필12과목33의 대체관계 조건을 공식 원문 재확인. 2026 승인연도별 중복인정3개 한도/이전9+3학점 규정과 신청승인 범위도 재확인. 정확URL/절/적용대상, 사실확정vs구조화부족vs미확정, 1.1 제안(현행 변경 없음) 및 경계사례 요약. 자동5중 chemical3개 주전공만 적용 설명 포함.
```

## 미실행 제안

- 출처 분류: 미실행 제안. Research가 작성한 [검토 문서 후속 D~E절](../docs/졸업요건_검토.md)이 원문이다.
- 내용: 화생 복수14자리, 생물학 동시학기, 생명과학 전필 동일그룹, 화생 주전공 신코드 목록과 버전1.1 구조.
- 상태: 공식 재조사·제안 작성은 완료. 자료1.1 변경·새 엔진 구현·활성화는 실행하지 않았으며 Concept의 후속 배정과 Planner의 계약 작업이 남아 있다.

## 이번 기록 보완 완료 보고

- 출처: AI 세션 간 결과 보고
- 발신: Project / Research → 수신: Project / Concept
- 관련 파일: 아래 보고의5개 파일
- 결과·미완료: 기록 보완은 완료. 동일 원문의 최종 완료 보고를 이 파일 확정 후 전송한다. 수신자의 통합 커밋·1.1 구현 완료를 의미하지 않는다. 전달 성공 여부는 대화의 실제 발송 도구 결과로 확인한다.

```text
Research 기록 보완 완료. 통합 포함파일은 docs/졸업요건_검토.md, docs/sessions/Research.md, prompts/Research-01-졸업요건-초안-검토.md, prompts/Research-02-2C해석과-구조화제안.md, prompts/Research-03-AI지시와-발송원문.md의5개입니다. Research-01은 사용자 직접 지시, Research-02의 수신 지시2건과 Research-03의 내부 통지는 AI 세션 간 기록으로 분류했습니다. 실제 외부세션 발송7건과 이번 완료보고1건, 하위 조사·구현·수정 요청10건을 원문으로 보존하고 수신담당·결과·미완료·관련파일을 붙였습니다. 1.1은 미실행 제안으로 표시했습니다. 채팅/메시지 식별자는 공개본에서 생략하고 표시했습니다. 이번 수정은 기록뿐이며 기능·자료1.0 변경없음. 기록의 분류·누락·식별자·링크 검사를 완료했고 기존 기능검증196+하위9 통과는 당시 결과로 유지했습니다. 이 보고 이후 통합 완료 통지까지 다시 파일 쓰기를 멈춥니다. Document는 위 기록을 전체목록에 반영할 수 있습니다. 단순 확인회신은 필요 없습니다.
```
