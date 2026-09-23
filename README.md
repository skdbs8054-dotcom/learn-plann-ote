# Korean Natural Writer

사용자의 글을 **그 사용자가 실제로 쓸 법한 한국어**로 다듬는 개인화 글쓰기 편집기입니다.
직접 쓴 글을 분석해 Writing Profile을 만들고, 수정본이 평소 문체와 얼마나 비슷한지 보여 줍니다.

AI 탐지기를 우회하거나 탐지 점수를 낮추는 것은 목표가 아닙니다. 외부 탐지 서비스 결과는
사용자가 직접 기록·비교하는 참고 데이터로만 다루며, 그 수치를 목표로 글을 수정하는 기능은 없습니다.

## 실행

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # 또는 export ANTHROPIC_API_KEY=... (.env는 git에 올라가지 않음)
npm start                             # http://localhost:3000
```

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `CLAUDE_MODEL` | `claude-opus-5` | 편집에 쓰는 Claude 모델 |

```bash
npm test   # 한국어 분석, 프로필/유사도, Facts Lock, diff, 프롬프트 단위 테스트
```

## 화면 구성

- **작업 화면**: Original Text | Writing Settings | Revised Text, 하단에 Korean Writing Analysis · My Style Match · Pattern Analysis
- **대시보드**: 문서 수, 총 어절 수, 샘플 수, 평균 Style Match, 반복 표현, 자주 쓰는 종결 표현, 평균 문장 길이
- **내 문체 (My Style)**: 직접 쓴 글 등록(최소 3개, 권장 5~20개), My Style Dashboard, 현재 글 vs 내 실제 글 비교
- **탐지 결과 기록**: GPTZero · Copyleaks · Originality.ai · Pangram 결과 직접 입력, 버전별 비교 기록
- **기록 (History)**: 제목, 날짜, 목적, Style, My Style Match, 버전 수
- **설정**: Personal Dictionary, Avoid Words, Preserve Words, 저장 방식, 샘플·프로필·기록 삭제

## 주요 기능

- **Writing Purpose / Tone / Custom Style / Custom Instructions**: 목적을 고르면 추천 문체와 수정 강도가 자동 적용됩니다.
- **Rewrite Level 1~4**: Proofread, Natural, Rewrite, My Style(프로필이 있을 때).
- **문장별 수정 이유**: 문장을 누르면 Original / Revised / Reason / Change Type을 보여 주고, 수정안 A(원문 최대 유지), B(가장 자연스럽게), C(사용자 문체 우선)를 받아 적용할 수 있습니다.
- **Facts Lock**: 이름, 기관·회사명, 날짜, 숫자, 금액, 통계, 제품명·고유명사, URL, 직접 인용, 논문·법률명을 찾아 고정하고, 수정본에서 바뀌거나 빠지면 경고합니다. Preserve Words는 항상 검사합니다.
- **비교와 버전**: 추가(+)·삭제(−)·변경 하이라이트, 버전 간 비교, Undo, Save Version, TXT/DOCX 다운로드.
- **한국어 분석** (브라우저에서 계산): 조사, 종결 표현, 존댓말/반말, 높임 수준, 연결어, 명사형·추상 표현, 서술어 반복, 문장·문단 길이, 구어체/문어체, 괄호·쉼표, 반복 표현, 형식적 표현, 불필요한 피동.
- **Pattern Analysis**: 12개 패턴을 Low / Medium / High로 표시하고 예시 문장과 제안을 보여 줍니다.
- **Style Match Score**: 문장 길이, 종결 표현, 어휘(연결어·조사), 문단 구조 일치도를 합산합니다. AI 탐지 확률이 아니라 **등록한 내 글과의 유사도**입니다.

## 개인정보와 데이터 흐름

- 처음 실행하면 "이 브라우저에 저장" / "저장하지 않음" 중 하나를 고릅니다. 문서, 샘플, 프로필, 탐지 기록은 서버에 저장하지 않습니다.
- Rewrite / 수정안 요청 때만 원문, 설정, 프로필 통계 요약이 Claude API로 전송됩니다. Level 4에서는 샘플 일부(최대 3개 발췌)도 전송되며, 설정에서 끌 수 있습니다.
- 설정 화면에서 Delete Writing Samples, Delete Writing Profile, Clear History, 모든 데이터 삭제를 제공합니다.

## 구조

| 경로 | 역할 |
|---|---|
| `server.js` | 정적 파일, `POST /api/rewrite`, `POST /api/alternatives`, `POST /api/docx` |
| `lib/prompt.js` | 시스템 프롬프트, 설정별 지시문, 구조화 출력 스키마 |
| `public/js/korean.js` | 한국어 문체 분석과 패턴 분석 (형태소 분석기 없이 규칙 기반) |
| `public/js/profile.js` | Writing Profile, Style Match Score, 내 글과의 비교 |
| `public/js/facts.js` | Facts Lock 추출·검사 |
| `public/js/diff.js` | 문단 정렬 후 어절 단위 diff |
| `public/js/store.js` | 저장 동의에 따른 localStorage / 메모리 저장 |
| `public/js/workspace.js`, `pages.js`, `app.js` | 화면 |

## 한계

- 분석은 규칙 기반 휴리스틱이라 조사·피동 판별에 오탐이 있을 수 있습니다.
- UI는 한국어만 제공합니다. 영어 글도 다듬을 수 있지만 분석 항목은 한국어에 맞춰져 있습니다.
- 사람 이름은 규칙으로 찾기 어려워 모델이 알려 준 목록으로 보완합니다.
