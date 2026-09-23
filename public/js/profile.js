// Writing Profile built from the user's own samples, the Style Match Score,
// and the "current text vs my writing" comparison.

import { analyzeText, topEntries, describeShape, ENDING_TYPES, styleDifferences } from "./korean.js";

export const MIN_SAMPLES = 3;

function add(map, obj, weight = 1) {
  for (const [k, v] of Object.entries(obj)) map[k] = (map[k] ?? 0) + v * weight;
}

function mostCommon(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function buildProfile(samples) {
  const analyses = samples.map((s) => analyzeText(s.text)).filter((a) => a.stats.sentences > 0);
  if (analyses.length < MIN_SAMPLES) return null;

  const all = analyzeText(samples.map((s) => s.text).join("\n"));
  const sentences = analyses.reduce((s, a) => s + a.stats.sentences, 0);
  const avg = (f) => {
    const xs = analyses.map(f).filter((x) => x != null);
    return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  };

  const endingFreq = {}, connectorFreq = {}, particleFreq = {}, types = {}, styleMix = {};
  for (const a of analyses) {
    add(endingFreq, a.endingFreq);
    add(connectorFreq, a.connectorFreq);
    add(particleFreq, a.particleFreq);
    add(types, a.endingTypes);
    add(styleMix, a.styleMix, 1 / analyses.length);
  }

  // Expressions that recur across different samples are the most "personal".
  const exprSamples = new Map();
  for (const a of analyses) {
    const seen = new Set([...a.connectors.map((c) => c.key), ...a.endings.map((e) => `~${e.key}`)]);
    for (const [w, c] of a.internal.wordCounts) if (c >= 2) seen.add(w);
    for (const e of seen) exprSamples.set(e, (exprSamples.get(e) ?? 0) + 1);
  }
  const topExpressions = [...exprSamples.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([key, count]) => ({ key, count }));

  const typeTotal = Object.values(types).reduce((a, b) => a + b, 0) || 1;
  const connectorPer100 = Object.fromEntries(Object.entries(connectorFreq).map(([k, v]) => [k, Math.round((v / sentences) * 1000) / 10]));

  return {
    createdAt: new Date().toISOString(),
    sampleCount: analyses.length,
    totalChars: analyses.reduce((s, a) => s + a.stats.chars, 0),
    avgSentenceLength: all.stats.avgSentenceLength,
    sentenceLengthStdev: all.stats.sentenceLengthStdev,
    avgParagraphLength: avg((a) => a.stats.avgParagraphLength),
    avgSentencesPerParagraph: avg((a) => a.stats.avgSentencesPerParagraph),
    commasPerSentence: all.stats.commasPerSentence,
    parenthesesPer1000: all.stats.parenthesesPer1000,
    spokenRatio: all.stats.spokenRatio,
    writtenRatio: all.stats.writtenRatio,
    honorificScore: all.stats.honorificScore,
    honorificLabel: all.honorificLabel,
    passiveRatio: all.stats.passiveRatio,
    activeRatio: 100 - all.stats.passiveRatio,
    nominalPer100Words: all.stats.nominalPer100Words,
    introShare: avg((a) => a.stats.introShare),
    explanationOrder: mostCommon(analyses.map((a) => a.explanationOrder)),
    conclusionStyle: mostCommon(analyses.map((a) => a.conclusionStyle)),
    topEndings: topEntries(new Map(Object.entries(endingFreq)), 8).filter((e) => e.key),
    endingFreq,
    endingTypes: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, Math.round((v / typeTotal) * 100)])),
    topConnectors: topEntries(new Map(Object.entries(connectorFreq)), 8),
    connectorFreq,
    connectorPer100,
    topParticles: topEntries(new Map(Object.entries(particleFreq)), 8),
    particleFreq,
    topExpressions,
    styleMix: normalizeMix(styleMix),
    repeatedStructures: all.shapes.slice(0, 3).map((s) => ({ ...s, label: describeShape(s.key) })),
  };
}

function normalizeMix(mix) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, Math.round((v / total) * 100)]));
}

// ---------- Style Match Score ----------

function similarity(a, b) {
  if (!a && !b) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  return max ? Math.max(0, 1 - Math.abs(a - b) / max) : 1;
}

function cosine(x, y) {
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  let dot = 0, nx = 0, ny = 0;
  for (const k of keys) {
    const a = x[k] ?? 0, b = y[k] ?? 0;
    dot += a * b; nx += a * a; ny += b * b;
  }
  if (!nx && !ny) return 1;
  if (!nx || !ny) return 0.5;
  return dot / Math.sqrt(nx * ny);
}

function mean(xs) {
  const v = xs.filter((x) => x != null);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

const pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100);

// Similarity to the user's existing writing. Not an AI-detection probability.
export function styleMatch(analysis, profile) {
  if (!profile || !analysis.stats.sentences) return null;
  const s = analysis.stats;
  const sentenceLength = 0.7 * similarity(s.avgSentenceLength, profile.avgSentenceLength)
    + 0.3 * similarity(s.sentenceLengthStdev, profile.sentenceLengthStdev);
  const typeShares = Object.fromEntries(Object.entries(analysis.endingTypes).map(([k, v]) => [k, v / s.sentences * 100]));
  const endings = 0.5 * cosine(analysis.endingFreq, profile.endingFreq) + 0.5 * cosine(typeShares, profile.endingTypes);
  const vocabulary = 0.45 * cosine(analysis.connectorFreq, profile.connectorFreq)
    + 0.35 * cosine(analysis.particleFreq, profile.particleFreq)
    + 0.2 * similarity(s.spokenRatio + 1, profile.spokenRatio + 1);
  const paragraph = s.paragraphs < 2 && profile.avgSentencesPerParagraph >= 2
    ? 0.6 * similarity(s.avgSentenceLength, profile.avgSentenceLength)
    : mean([
      similarity(s.avgSentencesPerParagraph, profile.avgSentencesPerParagraph),
      similarity(s.avgParagraphLength, profile.avgParagraphLength),
      s.introShare != null && profile.introShare != null ? similarity(s.introShare + 1, profile.introShare + 1) : null,
    ]);
  const overall = 0.3 * sentenceLength + 0.3 * endings + 0.2 * vocabulary + 0.2 * paragraph;
  return {
    overall: pct(overall),
    sentenceLength: pct(sentenceLength),
    endings: pct(endings),
    vocabulary: pct(vocabulary),
    paragraph: pct(paragraph),
  };
}

// ---------- Current text vs my writing ----------

export function compareWithProfile(analysis, profile) {
  const s = analysis.stats;
  const rows = [
    { label: "평균 문장 길이", current: `${s.avgSentenceLength}자`, mine: `${profile.avgSentenceLength}자` },
    { label: "문장 길이 편차", current: `${s.sentenceLengthStdev}`, mine: `${profile.sentenceLengthStdev}` },
    { label: "문단당 문장 수", current: `${s.avgSentencesPerParagraph}`, mine: `${profile.avgSentencesPerParagraph}` },
    { label: "주요 종결 표현", current: list(analysis.endings.map((e) => `~${e.key}`)), mine: list(profile.topEndings.map((e) => `~${e.key}`)) },
    { label: "주요 연결어", current: list(analysis.connectors.map((c) => c.key)), mine: list(profile.topConnectors.map((c) => c.key)) },
    { label: "자주 쓰는 조사", current: list(analysis.particles.map((p) => p.key)), mine: list(profile.topParticles.map((p) => p.key)) },
    { label: "구어체 비율", current: `${s.spokenRatio}%`, mine: `${profile.spokenRatio}%` },
    { label: "높임 수준", current: analysis.honorificLabel, mine: profile.honorificLabel },
    { label: "명사형 표현 (100어절당)", current: `${s.nominalPer100Words}`, mine: `${profile.nominalPer100Words}` },
    { label: "쉼표 (문장당)", current: `${s.commasPerSentence}`, mine: `${profile.commasPerSentence}` },
  ];

  const messages = [];
  const delta = (x, y) => (y ? Math.round(((x - y) / y) * 100) : 0);
  const len = delta(s.avgSentenceLength, profile.avgSentenceLength);
  if (Math.abs(len) >= 10) messages.push(`현재 글은 평소 사용자보다 문장이 평균 ${Math.abs(len)}% ${len > 0 ? "길어졌습니다" : "짧아졌습니다"}.`);
  for (const c of analysis.connectors) {
    const mineRate = profile.connectorPer100[c.key] ?? 0;
    const rate = (c.count / s.sentences) * 100;
    if (c.count >= 2 && rate > mineRate * 1.5 + 5) messages.push(`'${c.key}' 사용 빈도가 사용자의 기존 글보다 높습니다.`);
  }
  if (s.nominalPer100Words > profile.nominalPer100Words * 1.3 + 1) messages.push("평소보다 명사형 표현이 많이 사용되었습니다.");
  const spoken = s.spokenRatio - profile.spokenRatio;
  if (Math.abs(spoken) >= 20) messages.push(`평소보다 ${spoken > 0 ? "구어체" : "문어체"} 비중이 높습니다.`);
  const para = delta(s.avgSentencesPerParagraph, profile.avgSentencesPerParagraph);
  if (s.paragraphs >= 2 && Math.abs(para) >= 30) messages.push(`문단이 평소보다 ${para > 0 ? "깁니다" : "짧습니다"} (문단당 ${s.avgSentencesPerParagraph}문장, 평소 ${profile.avgSentencesPerParagraph}문장).`);
  if (analysis.honorificLabel.split(" ")[0] !== profile.honorificLabel.split(" ")[0]) {
    messages.push(`높임 수준이 평소(${profile.honorificLabel})와 다릅니다.`);
  }
  if (s.passiveRatio > profile.passiveRatio + 15) messages.push("평소보다 피동 표현이 많습니다.");
  for (const m of styleDifferences(analysis, profile)) if (m.includes("종결")) messages.push(m);
  if (!messages.length) messages.push("현재 글은 평소 문체와 비슷합니다.");
  return { rows, messages };
}

function list(xs) {
  return xs.slice(0, 4).join(", ") || "-";
}

// Compact profile summary sent to the model for Level 4 (My Style).
export function profileForPrompt(profile) {
  if (!profile) return null;
  const types = Object.entries(profile.endingTypes)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${ENDING_TYPES[k]} ${v}%`)
    .join(", ");
  return [
    `- 평균 문장 길이: ${profile.avgSentenceLength}자 (편차 ${profile.sentenceLengthStdev})`,
    `- 문단당 평균 문장 수: ${profile.avgSentencesPerParagraph}`,
    `- 종결 유형 분포: ${types}`,
    `- 자주 쓰는 종결 표현: ${profile.topEndings.slice(0, 6).map((e) => `~${e.key}`).join(", ")}`,
    `- 자주 쓰는 연결어: ${profile.topConnectors.slice(0, 6).map((c) => c.key).join(", ") || "적음"}`,
    `- 자주 쓰는 조사: ${profile.topParticles.slice(0, 6).map((p) => p.key).join(", ")}`,
    `- 반복해서 쓰는 표현: ${profile.topExpressions.slice(0, 8).map((e) => e.key).join(", ") || "없음"}`,
    `- 쉼표: 문장당 ${profile.commasPerSentence}개, 괄호: 1000자당 ${profile.parenthesesPer1000}개`,
    `- 구어체 ${profile.spokenRatio}% / 문어체 ${profile.writtenRatio}%`,
    `- 높임 수준: ${profile.honorificLabel}`,
    `- 능동문 ${profile.activeRatio}% / 피동 포함 ${profile.passiveRatio}%`,
    `- 설명 순서: ${profile.explanationOrder}, ${profile.introShare != null ? `서론 비중: 전체의 약 ${profile.introShare}%, ` : ""}결론 방식: ${profile.conclusionStyle}`,
  ].join("\n");
}

// A few short excerpts from the samples so the model can hear the user's voice.
export function styleExcerpts(samples, maxChars = 2400) {
  const out = [];
  let used = 0;
  for (const s of [...samples].sort((a, b) => b.text.length - a.text.length)) {
    const excerpt = s.text.trim().slice(0, 800);
    if (used + excerpt.length > maxChars) break;
    out.push(excerpt);
    used += excerpt.length;
    if (out.length >= 3) break;
  }
  return out;
}
