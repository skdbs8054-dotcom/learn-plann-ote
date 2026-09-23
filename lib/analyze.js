// Local, model-free text statistics shown next to the editor.
// These are writing-quality signals (monotony, clichés), not a detector score.

const CLICHES = [
  // Korean
  "결론적으로", "요약하자면", "종합적으로", "다양한 측면에서", "중요한 역할을 합니다",
  "살펴보겠습니다", "알아보겠습니다", "라고 할 수 있습니다", "것이 중요합니다",
  "뿐만 아니라", "이를 통해", "또한,", "더불어", "나아가",
  // English
  "in conclusion", "delve", "it is important to note", "furthermore", "moreover",
  "in today's fast-paced world", "plays a crucial role", "a testament to",
  "navigate the complexities", "unlock the potential", "in summary", "tapestry",
];

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?。？！])\s+|(?<=다\.)\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function analyze(text) {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.length);
  const n = lengths.length;
  const mean = n ? lengths.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
  const stdev = Math.sqrt(variance);

  const lower = text.toLowerCase();
  const cliches = CLICHES
    .map((phrase) => ({ phrase, count: lower.split(phrase.toLowerCase()).length - 1 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Share of sentences that start with the same first word as the previous one.
  const starts = sentences.map((s) => s.split(/\s+/)[0]);
  let repeatedStarts = 0;
  for (let i = 1; i < starts.length; i++) if (starts[i] === starts[i - 1]) repeatedStarts++;

  return {
    chars: text.length,
    sentences: n,
    avgSentenceLength: Math.round(mean),
    // Coefficient of variation: low values mean every sentence is about the same length.
    lengthVariation: mean ? Number((stdev / mean).toFixed(2)) : 0,
    repeatedStarts,
    cliches,
  };
}
