// Korean-first writing analysis. Pure functions, no DOM: runs in the browser and in node tests.
// Everything here is heuristic (no morphological analyzer), tuned for readable signals
// rather than linguistic precision.

const HANGUL = /[가-힣]/g;

// ---------- Splitting ----------

export function splitParagraphs(text) {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function splitSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!?。！？…][”’"'」』)\]]*)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function eojeols(sentence) {
  return sentence.split(/\s+/).filter(Boolean);
}

function stripTail(sentence) {
  return sentence.replace(/[\s.!?。！？…~”’"'」』)\]:;,·\-ㅋㅎㅠㅜ^]+$/u, "");
}

export function isMostlyKorean(text) {
  const letters = text.match(/[가-힣A-Za-z]/g) ?? [];
  if (!letters.length) return true;
  return (text.match(HANGUL) ?? []).length / letters.length >= 0.5;
}

// ---------- Sentence endings & honorifics ----------

// Longest match wins, so specific endings are listed alongside their shorter forms.
const ENDINGS = [
  "인 것 같습니다", "것 같습니다", "라고 생각합니다", "다고 생각합니다", "수 있습니다", "수 있었습니다",
  "하겠습니다", "했습니다", "었습니다", "았습니다", "였습니다", "겠습니다", "습니다", "합니다", "입니다", "됩니다", "니다",
  "습니까", "니까",
  "인 것 같아요", "것 같아요", "거든요", "는데요", "더라고요", "네요", "어요", "아요", "해요", "했어요", "었어요", "았어요",
  "예요", "이에요", "세요", "죠", "요",
  "인 것 같다", "것 같다", "라고 생각한다", "수 있다", "것이다", "했다", "었다", "았다", "였다", "한다", "된다", "이다", "는다", "ㄴ다", "다",
  "거든", "잖아", "는데", "같아", "더라", "구나", "자", "까", "했어", "었어", "았어", "해", "야", "지", "네", "어", "아",
  "했음", "있음", "없음", "함", "음", "임", "됨",
].sort((a, b) => b.length - a.length);

export const ENDING_TYPES = {
  formal: "하십시오체(~습니다)",
  polite: "해요체(~요)",
  plain: "해라체(~다)",
  casual: "반말(~어/~지)",
  nominal: "명사형 종결(~함/~음)",
  other: "기타",
};

export function sentenceEnding(sentence) {
  const s = stripTail(sentence);
  for (const e of ENDINGS) if (s.endsWith(e)) return e;
  return "";
}

export function endingType(sentence) {
  const s = stripTail(sentence);
  if (/(니다|니까|십시오|시오)$/.test(s)) return "formal";
  if (/(요|죠)$/.test(s)) return "polite";
  if (/(있음|없음|했음|였음|함|임|됨|[가-힣]음)$/.test(s) && !/(마음|처음|다음|웃음|믿음|죽음|울음|걸음|이름|요즘|지금)$/.test(s)) return "nominal";
  if (/다$/.test(s)) return "plain";
  if (/(어|아|야|지|해|네|냐|니|래|대|게|걸|거든|잖아|는데|같아|더라|구나|군|자|까|라)$/.test(s)) return "casual";
  return "other";
}

const HONORIFIC_MARKERS = /(께서|께|드립니다|드려|드리|말씀|뵙|여쭙|계시|하시|주시|으시|셨|십니다|세요)/g;

// ---------- Lexicons ----------

// startOnly: count only when the word opens a sentence (these are also common nouns/adverbs).
export const CONNECTORS = [
  { word: "또한" }, { word: "따라서" }, { word: "이러한" }, { word: "이를 통해" }, { word: "결과적으로" },
  { word: "한편" }, { word: "즉" }, { word: "특히" }, { word: "그래서" }, { word: "다만" }, { word: "실제로" },
  { word: "그러나" }, { word: "하지만" }, { word: "그리고" }, { word: "게다가" }, { word: "더불어" }, { word: "나아가" },
  { word: "그런데" }, { word: "예를 들어" }, { word: "예컨대" }, { word: "그러므로" }, { word: "그렇기 때문에" },
  { word: "이처럼" }, { word: "이와 같이" }, { word: "무엇보다" }, { word: "아울러" }, { word: "요컨대" },
  { word: "이로 인해" }, { word: "그럼에도" }, { word: "근데" }, { word: "그래도" }, { word: "그러니까" },
  { word: "물론", startOnly: true }, { word: "반면", startOnly: true }, { word: "우선", startOnly: true },
  { word: "먼저", startOnly: true }, { word: "마지막으로", startOnly: true }, { word: "결국", startOnly: true },
  { word: "사실", startOnly: true }, { word: "이에", startOnly: true }, { word: "그", startOnly: true, hidden: true },
  // English (secondary support)
  { word: "furthermore" }, { word: "moreover" }, { word: "additionally" }, { word: "however" },
  { word: "therefore" }, { word: "in addition" }, { word: "as a result" }, { word: "consequently" },
].filter((c) => !c.hidden);

// Connectors that tend to pile up in formulaic drafts (spec item 9-3).
export const WATCHED_CONNECTORS = ["또한", "따라서", "이러한", "이를 통해", "결과적으로", "한편", "즉", "특히"];

const PARTICLES = [
  "에서는", "에게서", "으로서", "으로써", "으로는", "에서", "에게", "한테", "까지", "부터", "처럼", "보다",
  "마저", "조차", "으로", "이나", "이라도", "라도", "로서", "로써", "에는", "께서",
  "은", "는", "이", "가", "을", "를", "에", "의", "로", "와", "과", "도", "만",
].sort((a, b) => b.length - a.length);

const SPOKEN_MARKERS = /(근데|그냥|진짜|되게|너무|좀|막|완전|약간|뭔가|거든|잖아|ㅋ|ㅎ|같아요|했어요|있어요|없어요|더라고|해서요|는데요|~|!)/g;
const WRITTEN_MARKERS = /(및|이러한|따라서|에 대한|에 있어|하였다|이며|으며|의 경우|에 의해|고자|하여|바와 같이|로 인해|함으로써)/g;

export const FORMAL_EXPRESSIONS = [
  "제고", "도모", "고찰", "시사한다", "시사하는", "시사점", "기인", "상기", "금번", "익일", "사료", "영위", "함양",
  "도출", "수립", "에 있어서", "에 있어", "하도록 하겠습니다", "라고 할 수 있다", "라고 할 수 있습니다",
  "것으로 판단된다", "것으로 판단됩니다", "하는 바이다", "하는 바입니다", "매우 중요하다", "매우 중요합니다",
  "필수적이다", "필수적입니다", "불가결", "지대한", "막대한 영향", "중요한 역할을",
];

const ABSTRACT_ACTION_NOUNS = [
  "향상", "개선", "증대", "제고", "강화", "도모", "확보", "구축", "활용", "실현", "달성", "극대화", "최적화",
  "고도화", "활성화", "효율화", "체계화", "내실화", "다각화", "선진화", "추진", "수행", "실시", "도입", "창출",
];
const ABSTRACT_SUFFIX = /[가-힣]{1,4}(성|화|력|율|률)(?=[을를이가은는의에과와도로으및]|\s|$)/g;
const ABSTRACT_EXCLUDE = new Set([
  "대화", "전화", "영화", "문화", "변화", "평화", "만화", "동화", "여성", "남성", "완성", "구성", "작성", "형성",
  "노력", "화", "성", "력", "지난주화", "비율", "확률",
]);
const NOMINAL_LINKERS = /(을|를) 통한|에 대한|에 있어|으?로 인한|것이다|것입니다|것으로|하는 것은|하는 것이/g;

export const ABSTRACT_TIPS = [
  { from: "효율성 향상", to: "더 빠르게(수월하게) 처리" },
  { from: "성과 개선", to: "결과가 좋아짐" },
  { from: "~을 통한", to: "~으로 / ~해서" },
  { from: "제고", to: "높이다" },
  { from: "증대", to: "늘리다" },
  { from: "활용", to: "쓰다" },
  { from: "실시", to: "하다" },
  { from: "도모", to: "꾀하다 / 힘쓰다" },
  { from: "~에 대한 이해", to: "~을 이해하는 것" },
];

// Unnecessary passives: double passives, "~게 되다", "~에 의해", hedging passives.
const PASSIVE_PATTERNS = [
  /(보여|쓰여|놓여|믿겨|잊혀|읽혀|불려|되어)지/g,
  /[가-힣]{2,}(되었|되어|된다|됩니다|되는|되며|되고|됐|되기|될|된)(?=[가-힣\s.,!?]|$)/g,
  /(여겨|주어|만들어|이루어|알려|짜여)(진|지|졌)/g,
  /게 되(었|어|었다|었습니다|는|ㄴ|며|고|면|다|ㅂ니다|네요)/g,
  /에 의해(서)?/g,
];

const STOPWORDS = new Set([
  "것", "수", "등", "이", "그", "저", "및", "더", "잘", "때", "중", "위해", "대한", "통해", "있다", "있는", "있습니다",
  "하는", "한다", "합니다", "했다", "했습니다", "하고", "하여", "그리고", "하지만", "또한", "우리", "저는", "나는",
  "제가", "내가", "것이", "것을", "것은", "있고", "없는", "같은", "the", "a", "an", "and", "of", "to", "in", "is", "it",
]);

// ---------- Helpers ----------

function countMatches(text, re) {
  return (text.match(re) ?? []).length;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function connectorRegex(c) {
  const flags = /[A-Za-z]/.test(c.word) ? "gi" : "g";
  const body = escapeRe(c.word);
  return c.startOnly
    ? new RegExp(`^${body}(?=[\\s,])`, flags)
    : new RegExp(`(?:^|[\\s,("“'‘])${body}(?=[\\s,.]|$)`, flags);
}
const CONNECTOR_RES = CONNECTORS.map((c) => ({ ...c, re: connectorRegex(c) }));

export function sentenceConnectors(sentence) {
  const found = [];
  for (const c of CONNECTOR_RES) {
    const n = countMatches(sentence, c.re);
    for (let i = 0; i < n; i++) found.push(c.word);
  }
  return found;
}

function startsWithConnector(sentence) {
  return CONNECTOR_RES.some((c) => new RegExp(`^${escapeRe(c.word)}(?=[\\s,])`, "i").test(sentence));
}

function particleOf(word) {
  const w = word.replace(/[^가-힣]+$/g, "");
  if (w.length < 2 || !/^[가-힣]+$/.test(w)) return null;
  for (const p of PARTICLES) if (w.length > p.length && w.endsWith(p)) return p;
  return null;
}

function stemOf(word) {
  let w = word.replace(/[^가-힣A-Za-z0-9]+/g, "");
  const p = particleOf(w);
  if (p) w = w.slice(0, -p.length);
  return w.toLowerCase();
}

function predicateKey(sentence) {
  const words = eojeols(stripTail(sentence));
  if (!words.length) return "";
  let w = words[words.length - 1];
  w = w.replace(/(습니다|ㅂ니다|니다|어요|아요|해요|예요|이에요|네요|죠|요|다|음|함|임|됨)$/, "");
  w = w.replace(/했$/, "하").replace(/됐$/, "되").replace(/(었|았|였|겠)$/, "");
  return w || words[words.length - 1];
}

function lengthBucket(len) {
  return len < 20 ? "짧음" : len < 50 ? "보통" : "긺";
}

function sentenceShape(sentence) {
  return [startsWithConnector(sentence) ? "연결어+" : "", endingType(sentence), lengthBucket(sentence.length)].join("|");
}

export function describeShape(shape) {
  const [conn, type, len] = shape.split("|");
  return `${conn ? "연결어로 시작 · " : ""}${ENDING_TYPES[type] ?? type} · ${len} 문장`;
}

function tally(items) {
  const m = new Map();
  for (const it of items) if (it) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}

export function topEntries(map, n = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs) {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function longestRun(keys) {
  let best = { key: null, length: 0, start: 0 };
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    if (i === keys.length || keys[i] !== keys[start]) {
      if (keys[start] && i - start > best.length) best = { key: keys[start], length: i - start, start };
      start = i;
    }
  }
  return best;
}

// ---------- Main analysis ----------

const INTRO_PATTERNS = [
  /현대 사회(에서|는|의)/, /오늘날/, /최근(\s?들어)?.{0,20}(관심|주목|화두|이슈)/, /(매우|아주|굉장히)?\s?중요한 역할을/,
  /에 대해 (알아보|살펴보|논하|이야기해 보)/, /중요성이 (대두|강조|커지)/, /급변하는/, /4차 산업혁명/,
  /이 글에서는/, /본 (보고서|과제|글|연구)(에서는|는)/, /빼놓을 수 없는/,
  /^in today's/i, /^in recent years/i, /has become increasingly/i,
];
const CONCLUSION_PATTERNS = [
  /결론적으로/, /요약하(자면|면)/, /종합하(자면|면|여|해 보면)/, /정리하(자면|면)/, /중요성을 (인식|깨닫|잊지)/,
  /앞으로(도)?.{0,30}(기대된다|기대합니다|필요할 것이다|필요할 것입니다|노력해야)/, /해야 할 것(이다|입니다)/,
  /이상으로/, /이상과 같이/, /시사하는 바가 (크다|큽니다)/, /^결국/,
  /^in conclusion/i, /^overall,/i, /^in summary/i,
];

export function level(value, medium, high) {
  return value >= high ? "high" : value >= medium ? "medium" : "low";
}

export function analyzeText(text) {
  const paragraphs = splitParagraphs(text).map((p) => ({ text: p, sentences: splitSentences(p) }));
  const sentences = paragraphs.flatMap((p) => p.sentences);
  const n = sentences.length;
  const korean = isMostlyKorean(text);
  const words = sentences.flatMap(eojeols);

  const sentenceLengths = sentences.map((s) => s.length);
  const endings = sentences.map(sentenceEnding);
  // Coarser key for repetition checks: "했습니다" and "었습니다" both count as "습니다".
  const endKeys = sentences.map((s) => stripTail(s).slice(-3));
  const types = sentences.map(endingType);
  const connectorsPerSentence = sentences.map(sentenceConnectors);
  const connectorList = connectorsPerSentence.flat();
  const particles = words.map(particleOf).filter(Boolean);

  // Spoken vs written, per sentence.
  let spoken = 0, written = 0;
  const TYPE_WEIGHT = { formal: [0, 1], polite: [1, 0], casual: [2, 0], plain: [0, 1], nominal: [0, 2], other: [0, 0] };
  sentences.forEach((s, i) => {
    const [sw, ww] = TYPE_WEIGHT[types[i]];
    const sp = countMatches(s, SPOKEN_MARKERS) + sw;
    const wr = countMatches(s, WRITTEN_MARKERS) + ww;
    if (sp > wr) spoken++;
    else if (wr > sp) written++;
  });

  // Honorific strength: 0 (반말) .. 100 (하십시오체).
  const HONOR = { formal: 100, polite: 75, nominal: 40, plain: 30, casual: 0 };
  const honorScores = types.filter((t) => t in HONOR).map((t) => HONOR[t]);
  const honorificMarkers = countMatches(text, HONORIFIC_MARKERS);

  // Nominal / abstract expressions.
  const abstractNouns = (text.match(ABSTRACT_SUFFIX) ?? []).filter((w) => !ABSTRACT_EXCLUDE.has(w));
  const actionNouns = ABSTRACT_ACTION_NOUNS.flatMap((w) => Array(countMatches(text, new RegExp(w, "g"))).fill(w));
  const nominalLinkers = text.match(NOMINAL_LINKERS) ?? [];
  const abstractSentences = sentences.filter((s) => {
    const a = (s.match(ABSTRACT_SUFFIX) ?? []).filter((w) => !ABSTRACT_EXCLUDE.has(w)).length;
    const b = ABSTRACT_ACTION_NOUNS.filter((w) => s.includes(w)).length;
    return a + b >= 3;
  });

  // Passives.
  const passiveHits = [];
  const passiveSentences = sentences.filter((s) => {
    const hits = PASSIVE_PATTERNS.flatMap((re) => s.match(re) ?? []);
    passiveHits.push(...hits);
    return hits.length > 0;
  });

  // Formal expressions.
  const formalHits = FORMAL_EXPRESSIONS.flatMap((e) => Array(countMatches(text, new RegExp(escapeRe(e), "g"))).fill(e));

  // Repetition of words and two-word expressions.
  const stems = words.map(stemOf).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const wordCounts = tally(stems);
  const bigrams = [];
  for (const s of sentences) {
    const ws = eojeols(s).map((w) => w.replace(/[.,!?]+$/, ""));
    for (let i = 0; i + 1 < ws.length; i++) {
      const bg = `${ws[i]} ${ws[i + 1]}`;
      if (bg.length >= 5 && !ws.slice(i, i + 2).every((w) => STOPWORDS.has(w))) bigrams.push(bg);
    }
  }
  const repeatedExpressions = topEntries(tally(bigrams), 10).filter((e) => e.count >= 2);
  const repeatedWords = topEntries(wordCounts, 10).filter((e) => e.count >= 3);

  // Predicates.
  const predicates = sentences.map(predicateKey);
  const predicateCounts = topEntries(tally(predicates), 5).filter((e) => e.count >= 2);

  // Structure.
  const shapes = sentences.map(sentenceShape);
  const paragraphShapes = paragraphs.map((p) =>
    [Math.min(p.sentences.length, 5), p.sentences[0] ? startsWithConnector(p.sentences[0]) : false,
      p.sentences[0] ? endingType(p.sentences[0]) : ""].join("|"),
  );

  const firstPara = paragraphs[0]?.text ?? "";
  const lastPara = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1].text : sentences.slice(-2).join(" ");
  const introHits = sentences.slice(0, 2).filter((s) => INTRO_PATTERNS.some((re) => re.test(s)));
  const conclusionHits = splitSentences(lastPara).filter((s) => CONCLUSION_PATTERNS.some((re) => re.test(s)));

  const stats = {
    chars: text.length,
    charsNoSpace: text.replace(/\s/g, "").length,
    words: words.length,
    sentences: n,
    paragraphs: paragraphs.length,
    avgSentenceLength: round1(mean(sentenceLengths)),
    sentenceLengthStdev: round1(stdev(sentenceLengths)),
    maxSentenceLength: Math.max(0, ...sentenceLengths),
    avgParagraphLength: round1(mean(paragraphs.map((p) => p.text.length))),
    avgSentencesPerParagraph: round1(paragraphs.length ? n / paragraphs.length : 0),
    commas: countMatches(text, /[,，、]/g),
    commasPerSentence: round2(n ? countMatches(text, /[,，、]/g) / n : 0),
    parentheses: countMatches(text, /[(（]/g),
    parenthesesPer1000: round2(text.length ? (countMatches(text, /[(（]/g) / text.length) * 1000 : 0),
    spokenRatio: n ? Math.round((spoken / n) * 100) : 0,
    writtenRatio: n ? Math.round((written / n) * 100) : 0,
    honorificScore: Math.round(mean(honorScores)),
    honorificMarkers,
    passiveSentences: passiveSentences.length,
    passiveRatio: n ? Math.round((passiveSentences.length / n) * 100) : 0,
    nominalCount: abstractNouns.length + actionNouns.length + nominalLinkers.length,
    nominalPer100Words: round1(words.length ? ((abstractNouns.length + actionNouns.length + nominalLinkers.length) / words.length) * 100 : 0),
    // Share of the text taken by the first paragraph; meaningless for single-paragraph text.
    introShare: paragraphs.length >= 2 ? Math.round((firstPara.length / text.length) * 100) : null,
  };

  const endingTypeCounts = Object.fromEntries(Object.keys(ENDING_TYPES).map((k) => [k, types.filter((t) => t === k).length]));

  return {
    korean,
    stats,
    paragraphs,
    sentences,
    endings: topEntries(tally(endings), 8),
    endingFreq: Object.fromEntries(tally(endings)),
    endingTypes: endingTypeCounts,
    honorificLabel: honorificLabel(endingTypeCounts),
    connectors: topEntries(tally(connectorList), 10),
    connectorFreq: Object.fromEntries(tally(connectorList)),
    particles: topEntries(tally(particles), 10),
    particleFreq: Object.fromEntries(tally(particles)),
    repeatedExpressions,
    repeatedWords,
    predicates: predicateCounts,
    formalExpressions: topEntries(tally(formalHits), 10),
    passives: topEntries(tally(passiveHits), 8),
    abstractExpressions: topEntries(tally([...abstractNouns, ...actionNouns, ...nominalLinkers]), 10),
    shapes: topEntries(tally(shapes), 5).filter((s) => s.count >= 2).map((s) => ({ ...s, label: describeShape(s.key) })),
    conclusionStyle: conclusionStyle(lastPara),
    explanationOrder: explanationOrder(paragraphs),
    styleMix: styleMix(sentences, types),
    internal: {
      sentenceLengths, endings, endKeys, types, connectorsPerSentence, shapes, paragraphShapes, predicates,
      introHits, conclusionHits, abstractSentences, passiveSentences, wordCounts,
    },
  };
}

function honorificLabel(counts) {
  const entries = Object.entries(counts).filter(([k]) => k !== "other");
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!total) return "판단 불가";
  const [top, value] = entries.sort((a, b) => b[1] - a[1])[0];
  const share = value / total;
  const name = { formal: "하십시오체 중심 (높임)", polite: "해요체 중심 (부드러운 높임)", plain: "해라체 중심 (평서·문어)", casual: "반말 중심", nominal: "명사형 종결 중심 (개조식)" }[top];
  return share < 0.6 ? `${name}, 혼용` : name;
}

function conclusionStyle(lastPara) {
  const s = lastPara.trim();
  if (!s) return "없음";
  if (CONCLUSION_PATTERNS.some((re) => re.test(s))) return "요약·정리형";
  if (/[?？]\s*$/.test(s)) return "질문형";
  if (/(생각|느꼈|같습니다|같아요|같다|싶다|싶습니다|바랍니다|바란다)/.test(s)) return "소감·의견형";
  if (/(부탁|요청|확인 부탁|검토 부탁|감사합니다)/.test(s)) return "요청·인사형";
  return "자연 종료형";
}

function explanationOrder(paragraphs) {
  const CLAIM = /(생각|중요|필요|핵심|결론|요점|주장|문제는|이유는|목표는|해야)/;
  const EXAMPLE = /(예를 들어|예컨대|실제로|가령|이를테면|경험)/;
  let head = 0, tail = 0, example = 0;
  for (const p of paragraphs) {
    if (p.sentences.length < 2) continue;
    if (CLAIM.test(p.sentences[0])) head++;
    if (CLAIM.test(p.sentences[p.sentences.length - 1])) tail++;
    if (p.sentences.some((s) => EXAMPLE.test(s))) example++;
  }
  const base = head > tail ? "주장 먼저 (두괄식)" : tail > head ? "근거 먼저 (미괄식)" : "혼합형";
  return example ? `${base} · 사례 활용` : base;
}

function styleMix(sentences, types) {
  const BUSINESS = /(진행|공유|검토|요청|확인|일정|보고|회의|업무|담당|협의|전달|진행 상황|부탁)/;
  const EXPLAIN = /(때문|따라서|이유|예를 들어|즉|의미|원리|과정|방법|경우)/;
  const score = { 업무형: 0, 대화형: 0, 설명형: 0 };
  sentences.forEach((s, i) => {
    const t = types[i];
    const b = (BUSINESS.test(s) ? 2 : 0) + (t === "formal" || t === "nominal" ? 1 : 0);
    const c = (t === "polite" || t === "casual" ? 2 : 0) + (countMatches(s, SPOKEN_MARKERS) ? 1 : 0);
    const e = (EXPLAIN.test(s) ? 2 : 0) + (t === "plain" ? 1 : 0);
    const max = Math.max(b, c, e);
    if (!max) return;
    if (b === max) score.업무형++;
    else if (c === max) score.대화형++;
    else score.설명형++;
  });
  const total = score.업무형 + score.대화형 + score.설명형;
  return Object.fromEntries(Object.entries(score).map(([k, v]) => [k, total ? Math.round((v / total) * 100) : 0]));
}

function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }

// ---------- Pattern analysis (spec section 9) ----------

export function analyzePatterns(a, { profile = null, avoidWords = [] } = {}) {
  const { sentences, internal: I, stats } = a;
  const n = sentences.length;
  const pick = (idxs, k = 3) => idxs.slice(0, k).map((i) => sentences[i]);
  const patterns = [];
  const add = (id, name, lvl, detail, examples = [], tip = "") => patterns.push({ id, name, level: lvl, detail, examples, tip });

  if (!n) return [];

  // 1. Same sentence structure repeated consecutively.
  const shapeRun = longestRun(I.shapes);
  const topShape = a.shapes[0];
  const shapeShare = topShape ? topShape.count / n : 0;
  add("structure", "동일 문장 구조 반복",
    n < 3 ? "low" : shapeRun.length >= 4 || (n >= 5 && shapeShare >= 0.7) ? "high" : shapeRun.length >= 3 || shapeShare >= 0.5 ? "medium" : "low",
    topShape ? `가장 흔한 구조: ${topShape.label} (${topShape.count}/${n}문장), 최대 ${shapeRun.length}문장 연속` : "반복되는 구조가 거의 없습니다.",
    shapeRun.length >= 3 ? pick(range(shapeRun.start, shapeRun.length)) : [],
    "연결어로 시작하는 문장, 짧은 문장과 긴 문장을 섞어 리듬을 바꿔 보세요.");

  // 2. Same ending repeated.
  const endRun = longestRun(I.endKeys);
  const topEnding = topEntries(tally(I.endKeys), 1)[0];
  const endShare = topEnding ? topEnding.count / n : 0;
  add("ending", "동일한 종결어미 반복",
    n < 3 ? "low" : endRun.length >= 4 || (n >= 5 && endShare >= 0.7) ? "high" : endRun.length >= 3 || endShare >= 0.5 ? "medium" : "low",
    topEnding?.key ? `'~${topEnding.key}' ${topEnding.count}회 (${Math.round(endShare * 100)}%), 최대 ${endRun.length}문장 연속` : "종결 표현이 다양합니다.",
    endRun.length >= 3 ? pick(range(endRun.start, endRun.length)) : [],
    "같은 높임 수준 안에서 '~했습니다 / ~입니다 / ~인 것 같습니다'처럼 종결을 섞으면 덜 단조롭습니다.");

  // 3. Connector overuse.
  const watched = a.connectors.filter((c) => WATCHED_CONNECTORS.includes(c.key));
  const watchedTotal = watched.reduce((s, c) => s + c.count, 0);
  const connectorRate = watchedTotal / n;
  const heavySentences = I.connectorsPerSentence.map((cs, i) => (cs.filter((c) => WATCHED_CONNECTORS.includes(c)).length >= 2 ? i : -1)).filter((i) => i >= 0);
  add("connector", "접속어 반복",
    level(connectorRate + heavySentences.length / Math.max(n, 1), 0.25, 0.5),
    watched.length ? watched.map((c) => `${c.key} ${c.count}회`).join(", ") : "과도하게 반복되는 접속어가 없습니다.",
    pick(heavySentences.length ? heavySentences : I.connectorsPerSentence.map((cs, i) => (cs.length ? i : -1)).filter((i) => i >= 0)),
    "접속어 없이도 흐름이 이어지는 문장이 많습니다. 꼭 필요한 곳에만 남겨 보세요.");

  // 4. Abstract nouns.
  const abstractIdx = I.abstractSentences.map((s) => sentences.indexOf(s));
  add("abstract", "추상 명사 과다 사용",
    level(stats.nominalPer100Words + abstractIdx.length * 3, 6, 12),
    a.abstractExpressions.length ? `${a.abstractExpressions.slice(0, 5).map((e) => `${e.key}(${e.count})`).join(", ")} · 100어절당 ${stats.nominalPer100Words}회` : "추상 명사가 많지 않습니다.",
    pick(abstractIdx),
    ABSTRACT_TIPS.slice(0, 4).map((t) => `'${t.from}' → '${t.to}'`).join(", "));

  // 5. Unnecessary passive.
  const passiveIdx = I.passiveSentences.map((s) => sentences.indexOf(s));
  add("passive", "불필요한 피동 표현",
    level(stats.passiveRatio, 15, 30),
    a.passives.length ? `${a.passives.slice(0, 5).map((p) => `${p.key}(${p.count})`).join(", ")} · 문장의 ${stats.passiveRatio}%` : "피동 표현이 적습니다.",
    pick(passiveIdx),
    "'~게 되었다' → '~했다', '보여진다' → '보인다', '진행되었다' → '진행했다'처럼 주어가 드러나게 바꿔 보세요.");

  // 6. Overly long sentences.
  const longLimit = a.korean ? 80 : 160;
  const longIdx = I.sentenceLengths.map((l, i) => (l > longLimit ? i : -1)).filter((i) => i >= 0);
  add("long", "과도하게 긴 문장",
    longIdx.length === 0 ? "low" : longIdx.length / n >= 0.3 || stats.maxSentenceLength > longLimit * 2 ? "high" : "medium",
    `${longLimit}자 초과 ${longIdx.length}문장 · 최장 ${stats.maxSentenceLength}자`,
    pick(longIdx),
    "한 문장에 생각 하나만 담도록 나눠 보세요.");

  // 7. Very short sentences repeated.
  const shortKeys = I.sentenceLengths.map((l) => (l < (a.korean ? 15 : 30) ? "s" : null));
  const shortRun = longestRun(shortKeys);
  add("short", "지나치게 짧은 문장 반복",
    shortRun.length >= 4 ? "high" : shortRun.length >= 3 ? "medium" : "low",
    `짧은 문장 최대 ${shortRun.key ? shortRun.length : 0}개 연속`,
    shortRun.length >= 3 ? pick(range(shortRun.start, shortRun.length)) : [],
    "짧은 문장이 이어지면 끊기는 느낌이 듭니다. 관련된 문장끼리 합쳐 보세요.");

  // 8. Same word repeated.
  const repWords = a.repeatedWords.filter((w) => w.count >= Math.max(3, Math.ceil(stats.words / 40)));
  add("word", "동일 어휘 반복",
    level(repWords.length + a.repeatedExpressions.filter((e) => e.count >= 3).length, 2, 4),
    repWords.length ? repWords.slice(0, 6).map((w) => `${w.key}(${w.count})`).join(", ") : "눈에 띄게 반복되는 어휘가 없습니다.",
    [], "대명사로 받거나, 반복되는 수식어를 덜어내 보세요.");

  // 9. Formulaic introduction.
  add("intro", "지나치게 정형화된 서론",
    I.introHits.length >= 2 ? "high" : I.introHits.length === 1 ? "medium" : "low",
    I.introHits.length ? "상투적인 도입 표현이 있습니다." : "도입부가 정형적이지 않습니다.",
    I.introHits, "'현대 사회에서 ~는 중요한 역할을 한다' 대신 구체적인 상황이나 질문으로 시작해 보세요.");

  // 10. Formulaic conclusion.
  add("conclusion", "지나치게 정형화된 결론",
    I.conclusionHits.length >= 2 ? "high" : I.conclusionHits.length === 1 ? "medium" : "low",
    I.conclusionHits.length ? "상투적인 마무리 표현이 있습니다." : "마무리가 정형적이지 않습니다.",
    I.conclusionHits, "'결론적으로 ~의 중요성을 인식해야 한다' 대신 본인이 얻은 결론이나 다음 행동으로 마무리해 보세요.");

  // 11. Paragraph structure repeated.
  const paraTop = topEntries(tally(I.paragraphShapes), 1)[0];
  const paraShare = paraTop && a.paragraphs.length ? paraTop.count / a.paragraphs.length : 0;
  add("paragraph", "문단 구조 반복",
    a.paragraphs.length < 3 ? "low" : paraShare >= 0.8 ? "high" : paraShare >= 0.6 ? "medium" : "low",
    a.paragraphs.length < 3 ? "문단이 3개 미만이라 판단하기 어렵습니다." : `${a.paragraphs.length}개 문단 중 ${paraTop.count}개가 같은 틀(문장 수·첫 문장 형태)`,
    [], "모든 문단을 '주제문-부연-요약'으로 맞추지 말고 길이와 전개를 달리해 보세요.");

  // 12. Differences from the user's own style.
  if (profile) {
    const diffs = styleDifferences(a, profile);
    add("mystyle", "사용자 기존 문체와 다른 표현",
      diffs.length >= 4 ? "high" : diffs.length >= 2 ? "medium" : "low",
      diffs.length ? diffs.join(" ") : "평소 문체와 크게 다르지 않습니다.", [],
      "Rewrite Level 4 (My Style)로 다듬으면 평소 문체를 우선 적용합니다.");
  } else {
    add("mystyle", "사용자 기존 문체와 다른 표현", "na", "My Style에 직접 쓴 글을 3개 이상 등록하면 분석할 수 있습니다.");
  }

  if (avoidWords.length) {
    const hits = avoidWords.filter((w) => w && a.sentences.some((s) => s.includes(w)));
    if (hits.length) {
      add("avoid", "피하고 싶은 표현 사용", hits.length >= 3 ? "high" : "medium", `등록한 표현 사용: ${hits.join(", ")}`,
        a.sentences.filter((s) => hits.some((w) => s.includes(w))).slice(0, 3), "Rewrite 시 우선적으로 다른 표현으로 바꿉니다.");
    }
  }

  return patterns;
}

// Short, human-readable differences between a text and a writing profile.
export function styleDifferences(a, profile) {
  const out = [];
  const pct = (x, y) => (y ? Math.round(((x - y) / y) * 100) : 0);
  const d = pct(a.stats.avgSentenceLength, profile.avgSentenceLength);
  if (Math.abs(d) >= 15) out.push(`문장이 평소보다 평균 ${Math.abs(d)}% ${d > 0 ? "깁니다" : "짧습니다"}.`);
  const topEnding = a.endings[0]?.key;
  if (topEnding && !profile.topEndings.slice(0, 5).some((e) => e.key === topEnding) && profile.topEndings[0]) {
    out.push(`'~${topEnding}' 종결이 많지만, 평소에는 '~${profile.topEndings[0].key}'를 주로 씁니다.`);
  }
  const unusual = a.connectors.filter((c) => c.count >= 2 && (profile.connectorPer100[c.key] ?? 0) * 2 < (c.count / Math.max(a.stats.sentences, 1)) * 100);
  if (unusual.length) out.push(`'${unusual.slice(0, 3).map((c) => c.key).join("', '")}' 사용이 평소보다 많습니다.`);
  if (a.stats.nominalPer100Words > profile.nominalPer100Words * 1.5 + 1) out.push("평소보다 명사형 표현이 많습니다.");
  if (Math.abs(a.stats.spokenRatio - profile.spokenRatio) >= 25) out.push(`구어체 비율이 평소(${profile.spokenRatio}%)와 다릅니다(${a.stats.spokenRatio}%).`);
  return out;
}

function range(start, length) {
  return Array.from({ length }, (_, i) => start + i);
}
