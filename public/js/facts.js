// Facts Lock: find names, dates, numbers, quotes, URLs... in the original,
// then check that each one survives the rewrite.

import { isMostlyKorean } from "./korean.js";

const NOT_LAWS = new Set(["방법", "문법", "해법", "용법", "불법", "합법", "편법", "기법", "수법", "어법", "화법", "비법", "사용법", "처방법", "요법", "필법", "마법", "작법"]);

const RULES = [
  { type: "URL", re: /https?:\/\/[^\s)<>"']+|www\.[^\s)<>"']+/g },
  { type: "이메일", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { type: "직접 인용", re: /"[^"\n]{2,200}"|“[^”\n]{2,200}”|‘[^’\n]{2,120}’|'[^'\n]{2,120}'/g },
  { type: "논문·도서명", re: /『[^』\n]+』|「[^」\n]+」|《[^》\n]+》|〈[^〉\n]+〉|<[^>\n]{2,60}>/g },
  { type: "날짜", re: /\d{4}\s?년(\s?\d{1,2}\s?월)?(\s?\d{1,2}\s?일)?|\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s?월\s?\d{1,2}\s?일|\d{1,2}\s?월(?=[\s,에의])/g },
  { type: "금액", re: /[$₩€¥]\s?\d[\d,.]*(\s?(만|억|조|천))?|\d[\d,.]*\s?(만|억|조|천)?\s?(원|달러|엔|위안|유로)/g },
  { type: "통계", re: /\d[\d,.]*\s?(%|퍼센트|%p|배|위)/g },
  { type: "법률명", re: /([가-힣]+\s)?[가-힣]{1,12}(법률|시행령|시행규칙|조례|법)(?=[\s,.)을를이가은는의에과와도로으]|$)/g, filter: (v) => !NOT_LAWS.has(v.split(" ").pop()) && v.replace(/\s/g, "").length >= 3 },
  { type: "회사명", re: /(주식회사|㈜|\(주\))\s?[가-힣A-Za-z0-9]+|[가-힣A-Za-z0-9]+\s?(주식회사|㈜|\(주\))/g },
  { type: "기관명", re: /[가-힣]{2,}(대학교|대학원|연구원|연구소|재단|협회|위원회|공단|공사|은행|병원|학회|센터|교육청|시청|구청|도청)|(교육|기획재정|과학기술정보통신|행정안전|보건복지|고용노동|국토교통|외교|국방|법무|환경|산업통상자원|문화체육관광|여성가족|농림축산식품|해양수산|중소벤처기업|통일)부/g },
  { type: "숫자", re: /\d[\d,.]*\s?(명|개|건|년|개월|주|일|시간|분|초|회|차|곳|권|점|장|kg|km|cm|mm|m|GB|MB|TB)?/g, filter: (v) => /\d{2,}|\d\s?[가-힣A-Za-z]/.test(v) },
];

function latinNames(text) {
  const korean = isMostlyKorean(text);
  const out = [];
  // Runs of Latin words: "Reading Clinic", "ChatGPT", "iPhone 15".
  const re = /[A-Za-z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0].replace(/[.'-]+$/, "");
    if (v.length < 2) continue;
    if (korean) {
      out.push(v);
    } else {
      // In English text keep capitalized words that do not open a sentence.
      const before = text.slice(0, m.index).trimEnd();
      const sentenceStart = !before || /[.!?]$/.test(before);
      if (/^[A-Z]/.test(v) && (!sentenceStart || /\s/.test(v) || /[A-Z].*[A-Z]/.test(v))) out.push(v);
    }
  }
  return out;
}

export function extractFacts(text, preserveWords = []) {
  const found = [];
  let masked = text;
  for (const rule of RULES) {
    masked = masked.replace(rule.re, (v) => {
      const value = v.trim();
      if (value && (!rule.filter || rule.filter(value))) {
        found.push({ type: rule.type, value });
        return " ".repeat(v.length);
      }
      return v;
    });
  }
  for (const v of latinNames(masked)) found.push({ type: "고유명사·제품명", value: v });
  for (const w of preserveWords) if (w && text.includes(w)) found.push({ type: "보존 단어", value: w });
  return dedupe(found);
}

export function mergeFacts(...lists) {
  return dedupe(lists.flat().filter((f) => f && f.value && f.value.trim()));
}

function dedupe(facts) {
  const seen = new Map();
  for (const f of facts) {
    const key = f.value.trim();
    if (!seen.has(key)) seen.set(key, { type: f.type, value: key });
  }
  // Drop values fully contained in a longer locked value of the same text ("2024년" inside "2024년 3월 5일").
  const values = [...seen.keys()];
  return [...seen.values()].filter((f) => !values.some((v) => v !== f.value && v.includes(f.value) && f.type !== "보존 단어"));
}

function occurrences(text, value) {
  if (!value) return 0;
  return text.split(value).length - 1;
}

// Items whose occurrence count dropped between original and revised text.
export function checkFacts(original, revised, facts) {
  return facts
    .map((f) => ({ ...f, originalCount: occurrences(original, f.value), revisedCount: occurrences(revised, f.value) }))
    .filter((f) => f.originalCount > 0 && f.revisedCount < f.originalCount);
}
