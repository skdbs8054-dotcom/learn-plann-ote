// App-wide state, persistence and small shared helpers.

import * as store from "./store.js";
import { buildProfile } from "./profile.js";

export const PURPOSES = {
  assignment: "대학 과제", report: "보고서", coverletter: "자기소개서", business: "업무 문서", email: "이메일",
  blog: "블로그", sns: "SNS", essay: "에세이", review: "후기", general: "일반 글쓰기",
};

export const TONES = {
  natural: "자연스러운 한국어", student: "대학생 스타일", worker: "직장인 스타일", professional: "전문적인 문체",
  friendly: "친근한 문체", plain: "담백한 문체", explanatory: "설명형", logical: "논리형",
  personal: "개인 경험 중심", spoken: "구어체", written: "문어체",
};

export const LEVELS = {
  1: { name: "Proofread", desc: "맞춤법·어색한 표현만" },
  2: { name: "Natural", desc: "구조 유지, 자연스럽게" },
  3: { name: "Rewrite", desc: "구조와 표현 적극 개선" },
  4: { name: "My Style", desc: "내 문체 우선 적용" },
};

// Recommended settings applied when the writing purpose changes.
export const PURPOSE_PRESETS = {
  assignment: { tone: "student", level: 2, note: "과제는 보통 해라체(~다)로 쓰고, 어려운 표현을 줄이면 읽기 쉽습니다." },
  report: { tone: "professional", level: 2, note: "보고서는 사실 전달이 우선입니다. Facts Lock을 켜 두는 것을 권장합니다." },
  coverletter: { tone: "personal", level: 3, note: "자기소개서는 경험과 구체적인 행동이 드러나게 다듬습니다." },
  business: { tone: "worker", level: 2, note: "업무 문서는 존댓말과 명확한 요청·일정 표현을 유지합니다." },
  email: { tone: "worker", level: 2, note: "이메일은 인사와 요청을 분명하게, 문장은 짧게 다듬습니다." },
  blog: { tone: "friendly", level: 3, note: "블로그는 해요체나 편한 문장이 자연스럽습니다." },
  sns: { tone: "spoken", level: 3, note: "SNS는 짧고 말하듯이 쓰는 문체가 어울립니다." },
  essay: { tone: "plain", level: 3, note: "에세이는 담백한 문장과 개인적인 시선이 살아 있게 다듬습니다." },
  review: { tone: "personal", level: 2, note: "후기는 직접 겪은 내용을 중심으로 자연스럽게 다듬습니다." },
  general: { tone: "natural", level: 2, note: "" },
};

export const CUSTOM_STYLE_EXAMPLES = [
  "20대 직장인이 직접 작성한 것처럼 자연스럽게",
  "보고서지만 너무 딱딱하지 않게",
  "대학생 과제처럼 쓰되 어려운 표현은 줄여줘",
  "내가 평소 쓰는 문장 길이를 유지해줘",
];

export const INSTRUCTION_EXAMPLES = [
  "내 문장 순서를 최대한 유지해줘.",
  "너무 전문적인 단어는 사용하지 마.",
  "보고서라 존댓말은 유지해줘.",
  "내가 직접 쓴 부분은 최대한 건드리지 마.",
  "서론만 조금 자연스럽게 고쳐줘.",
  "문장 끝이 계속 ~합니다로 끝나지 않게 해줘.",
];

export const DETECTORS = [
  { id: "gptzero", name: "GPTZero", url: "https://gptzero.me" },
  { id: "copyleaks", name: "Copyleaks", url: "https://copyleaks.com/ai-content-detector" },
  { id: "originality", name: "Originality.ai", url: "https://originality.ai" },
  { id: "pangram", name: "Pangram", url: "https://www.pangram.com" },
];

export const DEFAULT_SETTINGS = {
  personalDictionary: [],
  avoidWords: [],
  preserveWords: [],
  sendExcerpts: true,
};

export function newDoc() {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: "",
    purpose: "general",
    tone: "natural",
    customStyle: "",
    level: 2,
    factsLock: true,
    instructions: "",
    original: "",
    versions: [],
    detectorRecords: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const state = {
  view: "workspace",
  doc: newDoc(),
  draft: null, // { text, sentences, summary, factsDetected }
  undo: [],
  selected: null,
  alternatives: {},
  factWarnings: [],
  busy: false,
  bottomTab: "analysis",
  analysisTarget: "original",
  revisedMode: "view",
  docs: [],
  samples: [],
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
};

export function loadAll() {
  state.docs = store.load("docs", []);
  state.samples = store.load("samples", []);
  state.profile = store.load("profile", null);
  state.settings = { ...DEFAULT_SETTINGS, ...store.load("settings", {}) };
  const current = store.load("current", null);
  if (current?.doc) {
    state.doc = { ...newDoc(), ...current.doc };
    state.draft = current.draft ?? null;
  }
}

function persist(key, value) {
  if (!store.save(key, value)) toast("브라우저 저장 공간이 부족해 저장하지 못했습니다.");
}

export function saveDocs() { persist("docs", state.docs); }
export function saveSamples() { persist("samples", state.samples); }
export function saveSettings() { persist("settings", state.settings); }
export function saveProfile() {
  if (state.profile) persist("profile", state.profile);
  else store.remove("profile");
}

// The working document (original, settings, unsaved draft) survives a reload.
let currentTimer;
export function saveCurrent() {
  clearTimeout(currentTimer);
  currentTimer = setTimeout(() => {
    persist("current", { doc: state.doc, draft: state.draft });
  }, 300);
}

export function isSaved(doc = state.doc) {
  return state.docs.some((d) => d.id === doc.id);
}

// Put the working doc into History (or refresh its entry).
export function upsertDoc() {
  state.doc.updatedAt = new Date().toISOString();
  if (!state.doc.title.trim()) state.doc.title = defaultTitle(state.doc.original);
  const i = state.docs.findIndex((d) => d.id === state.doc.id);
  const copy = structuredClone(state.doc);
  if (i >= 0) state.docs[i] = copy;
  else state.docs.unshift(copy);
  saveDocs();
  saveCurrent();
}

export function rebuildProfile() {
  state.profile = buildProfile(state.samples);
  saveProfile();
  return state.profile;
}

export function defaultTitle(text) {
  const first = text.trim().split(/\n/)[0] ?? "";
  return first ? (first.length > 24 ? `${first.slice(0, 24)}…` : first) : "제목 없는 문서";
}

// ---------- Helpers ----------

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  el.innerHTML = `<div class="t">${esc(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.innerHTML = ""; }, 2600);
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name) {
  return (name || "document").replace(/[\\/:*?"<>|\n]+/g, " ").trim().slice(0, 60) || "document";
}
