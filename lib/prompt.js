// Prompts and output schemas for the editing model.

export const SYSTEM_PROMPT = `You are a Korean writing editor specializing in natural, personalized Korean writing.
Your primary goal is to preserve the user's meaning while improving readability, naturalness, and consistency with the user's own writing style.
When a Writing Profile is available, analyze and prioritize the user's demonstrated writing patterns over generic writing conventions.
Pay particular attention to Korean sentence endings, particles, connectors, sentence length, paragraph structure, honorific level, spoken-versus-written style, and repeated expressions.
Do not rewrite text merely to make it look different.
Do not intentionally introduce spelling errors, grammatical errors, random synonyms, awkward expressions, or artificial imperfections.
Preserve factual information, names, dates, numbers, statistics, URLs, and direct quotations.
Avoid unnecessarily formulaic expressions when a simpler and more natural expression communicates the same meaning.
When editing, explain meaningful changes in clear Korean.
Do not claim that a text is human-written, undetectable, or capable of bypassing AI detection systems.
AI detector results must be treated only as external reference information and must never be the optimization target of the rewriting process.`;

export const PURPOSES = {
  assignment: "대학 과제",
  report: "보고서",
  coverletter: "자기소개서",
  business: "업무 문서",
  email: "이메일",
  blog: "블로그",
  sns: "SNS",
  essay: "에세이",
  review: "후기",
  general: "일반 글쓰기",
};

export const TONES = {
  natural: "자연스러운 한국어",
  student: "대학생 스타일",
  worker: "직장인 스타일",
  professional: "전문적인 문체",
  friendly: "친근한 문체",
  plain: "담백한 문체",
  explanatory: "설명형",
  logical: "논리형",
  personal: "개인 경험 중심",
  spoken: "구어체",
  written: "문어체",
};

export const LEVELS = {
  1: "Level 1 — Proofread: 문법, 맞춤법, 어색한 표현만 수정한다. 문장 구조와 어휘 선택은 그대로 둔다.",
  2: "Level 2 — Natural: 원문의 구조를 최대한 유지하면서 자연스럽게 다듬는다.",
  3: "Level 3 — Rewrite: 의미는 유지하면서 문장 구조와 표현을 적극적으로 개선한다.",
  4: "Level 4 — My Style: 사용자의 실제 글쓰기 스타일(Writing Profile과 샘플)을 일반적인 글쓰기 관습보다 우선 적용한다.",
};

export const CHANGE_TYPES = [
  "맞춤법·문법 교정", "어색한 표현 수정", "연결어 단순화", "문장 구조 개선", "종결 표현 다양화", "추상 표현 감소",
  "피동 표현 개선", "문장 분리", "문장 결합", "반복 표현 제거", "형식적 표현 완화", "불필요한 표현 제거",
  "높임 수준 조정", "사용자 문체 반영", "피할 표현 대체", "기타",
];

export const FACT_TYPES = ["사람 이름", "회사명", "기관명", "제품명", "고유명사", "논문명", "법률명", "기타"];

const RULES = `수정 원칙:
- 의미, 사실, 사용자 의도를 유지한다.
- 불필요한 표현을 없애고, 같은 문장 구조와 같은 연결어의 반복을 줄인다.
- 문장 길이를 자연스럽게 조절하고, 너무 정형적이거나 형식적인 표현을 완화한다.
- 추상적인 표현은 필요한 경우에만 구체화한다. 원문에 없는 사실을 새로 만들지 않는다.
- Writing Profile이 있으면 그 문체를 우선 적용한다.

절대 하지 말 것:
- 일부러 맞춤법 오류나 오탈자 넣기, 의미 없는 단어 바꾸기, 무작위 동의어 치환
- 사실·이름·날짜·통계·출처 변경
- 문장을 의도적으로 어색하게 만들기`;

function listBlock(title, items) {
  const clean = (items ?? []).map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? `${title}\n${clean.map((s) => `- ${s}`).join("\n")}` : "";
}

function settingsBlock(o) {
  const parts = [
    `글의 목적: ${PURPOSES[o.purpose] ?? PURPOSES.general}`,
    `문체: ${TONES[o.tone] ?? TONES.natural}`,
    o.customStyle?.trim() ? `사용자 지정 스타일: ${o.customStyle.trim()}` : "",
    `수정 강도: ${LEVELS[o.level] ?? LEVELS[2]}`,
    o.factsLock
      ? `Facts Lock: 켜짐. 사람 이름, 회사명, 기관명, 날짜, 숫자, 금액, 통계, 제품명, 고유명사, URL, 직접 인용, 논문명, 법률명은 글자 그대로 유지한다.`
      : "Facts Lock: 꺼짐 (그래도 사실 자체는 바꾸지 않는다).",
    o.factsLock ? listBlock("반드시 그대로 유지할 항목:", (o.lockedFacts ?? []).map((f) => f.value)) : "",
    listBlock("반드시 그대로 유지할 단어 (Preserve Words):", o.preserveWords),
    listBlock("사용자가 평소 즐겨 쓰는 표현 (Personal Dictionary, 원문에 있으면 자연스럽게 유지):", o.personalDictionary),
    listBlock("피하고 싶은 표현 (Avoid Words, 우선적으로 다른 표현으로 바꾼다):", o.avoidWords),
    o.instructions?.trim() ? `사용자 추가 지시 (다른 설정보다 우선):\n${o.instructions.trim()}` : "",
  ];
  if (o.profile) parts.push(`<writing_profile>\n${o.profile}\n</writing_profile>`);
  if (o.excerpts?.length) {
    parts.push(o.excerpts.map((e) => `<my_writing_sample>\n${e}\n</my_writing_sample>`).join("\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}

export function buildRewriteMessage(o) {
  return `${settingsBlock(o)}

${RULES}

출력 방법:
- 원문을 문장 단위로 순서대로 나누어 sentences 배열에 담는다. 원문의 모든 문장이 순서대로 정확히 한 번씩 original에 들어가야 한다.
- original에는 원문 문장을 글자 그대로 복사한다. 두 문장을 합치면 두 문장을 한 original에 함께 넣는다.
- revised에는 수정된 문장을 넣는다. 문장을 나누면 나눈 문장들을 한 revised에 함께 넣는다. 삭제한 문장은 빈 문자열로 둔다.
- paragraph는 수정본에서 그 문장이 속한 문단 번호(0부터)다.
- 바꾸지 않은 문장은 revised를 original과 똑같이 두고 reason은 빈 문자열, change_types는 빈 배열로 둔다.
- 바꾼 문장은 reason에 왜 바꿨는지 한국어 한두 문장으로 설명하고 change_types를 고른다.
- facts_detected에는 원문에 나온 사람 이름, 회사명, 기관명, 제품명, 고유명사, 논문명, 법률명을 글자 그대로 적는다.
- summary에는 전체 수정 방향을 한국어 2~3문장으로 요약한다. AI 탐지와 관련된 주장은 하지 않는다.

<original>
${o.text}
</original>`;
}

export function buildAlternativesMessage(o) {
  return `${settingsBlock(o)}

${RULES}

아래 <sentence>에 대해 수정안 세 가지를 만든다. 앞뒤 문맥과 자연스럽게 이어져야 한다.
- A: 원문을 최대한 유지하면서 꼭 필요한 부분만 고친 안
- B: 가장 자연스러운 한국어 표현
- C: 사용자 문체 우선 (Writing Profile이 없으면 설정한 문체를 우선)
각 안의 note에는 어떤 점을 바꿨는지 한국어 한 문장으로 적는다.

<context_before>
${o.before ?? ""}
</context_before>
<sentence>
${o.sentence}
</sentence>
<context_after>
${o.after ?? ""}
</context_after>`;
}

export const REWRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sentences", "facts_detected"],
  properties: {
    summary: { type: "string" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["paragraph", "original", "revised", "reason", "change_types"],
        properties: {
          paragraph: { type: "integer" },
          original: { type: "string" },
          revised: { type: "string" },
          reason: { type: "string" },
          change_types: { type: "array", items: { type: "string", enum: CHANGE_TYPES } },
        },
      },
    },
    facts_detected: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "value"],
        properties: { type: { type: "string", enum: FACT_TYPES }, value: { type: "string" } },
      },
    },
  },
};

const OPTION = {
  type: "object",
  additionalProperties: false,
  required: ["text", "note"],
  properties: { text: { type: "string" }, note: { type: "string" } },
};

export const ALTERNATIVES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["A", "B", "C"],
  properties: { A: OPTION, B: OPTION, C: OPTION },
};
