# 자연스러운 글 다듬기 (humanize-writer)

AI가 쓴 듯한 딱딱한 초안을 Claude로 **사람이 쓴 것 같은 자연스러운 글**로 고쳐 주는 웹 앱입니다.

- 글투(일상체 / 블로그 / 업무 / 학술)와 수정 강도(가볍게 / 보통 / 과감하게) 선택
- 결과를 실시간 스트리밍으로 표시
- 원문·결과의 문체 분석: 문장 수, 평균 길이, 문장 길이 변화(단조로움 지표), 상투어 목록
- 원문의 사실·수치는 유지하고 새 내용을 지어내지 않도록 프롬프트 구성

## 실행

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # 또는 `ant auth login`
npm start                             # http://localhost:3000
```

환경 변수: `PORT`(기본 3000), `CLAUDE_MODEL`(기본 `claude-opus-5`).

## 테스트

```bash
npm test
```

## 구조

| 파일 | 역할 |
|---|---|
| `server.js` | 정적 파일 서빙, `/api/rewrite`(스트리밍 재작성), `/api/analyze`(문체 분석) |
| `lib/prompt.js` | 시스템 프롬프트, 글투·강도 옵션 |
| `lib/analyze.js` | 모델 없이 계산하는 문체 통계 |
| `public/index.html` | UI |

## 참고

AI 탐지기는 오탐이 많고 판정이 제각각이라, 이 앱은 특정 탐지기 점수를 보장하지 않습니다.
과제·시험·공모전처럼 AI 사용 규정이 있는 곳에서는 그 규정을 따르세요.
