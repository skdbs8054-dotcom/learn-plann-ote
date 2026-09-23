// Main workspace: Original | Writing Settings | Revised, plus the analysis panel below.

import {
  state, PURPOSES, TONES, LEVELS, PURPOSE_PRESETS, CUSTOM_STYLE_EXAMPLES, INSTRUCTION_EXAMPLES,
  esc, toast, download, safeFilename, postJson, saveCurrent, upsertDoc, uid, fmtDate, isSaved,
} from "./state.js";
import { analyzeText, analyzePatterns, ENDING_TYPES } from "./korean.js";
import { styleMatch, compareWithProfile, profileForPrompt, styleExcerpts } from "./profile.js";
import { extractFacts, mergeFacts, checkFacts } from "./facts.js";
import { diffWords, diffText, sideSegments, diffSummary } from "./diff.js";
import { assembleRevised } from "./assemble.js";
import { levelBadge, bars, list, openModal, closeModal } from "./ui.js";

const EXAMPLE_TEXT = `현대 사회에서 독서는 매우 중요한 역할을 합니다. 또한 이러한 독서 습관은 학생들의 학습 효율성 향상을 통한 성과 개선에 기여합니다. 따라서 학교에서는 다양한 독서 프로그램이 운영되고 있습니다.

2024년 3월 우리 학교에서는 Reading Clinic 프로그램을 시작했습니다. 이 프로그램에는 32명의 학생이 참여했습니다. 또한 이를 통해 참여 학생의 만족도가 85%로 나타났습니다. 이러한 결과를 통해 해당 방법이 매우 효과적이라는 것을 확인할 수 있었습니다.

결론적으로 우리는 독서의 중요성을 인식하고 꾸준히 실천해야 할 것입니다.`;

let root;
const analysisCache = new Map();

function analyze(text) {
  if (!analysisCache.has(text)) {
    if (analysisCache.size > 20) analysisCache.clear();
    analysisCache.set(text, analyzeText(text));
  }
  return analysisCache.get(text);
}

// ---------- Layout ----------

export function renderWorkspace(el) {
  root = el;
  const d = state.doc;
  root.innerHTML = `
    <div class="docbar">
      <input class="title-input" id="docTitle" value="${esc(d.title)}" placeholder="제목 없는 문서" aria-label="문서 제목">
      <span class="muted small" id="docMeta"></span>
    </div>
    <div class="cols">
      <section class="card col col-original" aria-labelledby="h-original">
        <div class="card-head">
          <h2 id="h-original">Original Text <span class="muted small">원문</span></h2>
          <button class="btn btn-ghost btn-sm" data-action="example">예시 글 넣기</button>
        </div>
        <textarea id="original" class="editor" placeholder="직접 쓴 글, AI 초안, 리포트, 과제, 자기소개서, 블로그 글, 업무 문서, 이메일, SNS 글 등을 붙여넣으세요.&#10;&#10;Ctrl + Enter로 바로 다듬을 수 있습니다." aria-label="원문">${esc(d.original)}</textarea>
        <div class="card-foot"><div class="stats-line" id="originalStats"></div></div>
      </section>

      <section class="card col col-settings" aria-labelledby="h-settings">
        <div class="card-head"><h2 id="h-settings">Writing Settings <span class="muted small">설정</span></h2></div>
        <div class="card-body" id="settingsBody"></div>
      </section>

      <section class="card col col-revised" aria-labelledby="h-revised">
        <div class="card-head">
          <h2 id="h-revised">Revised Text <span class="muted small">수정본</span></h2>
          <div class="segmented" role="group" aria-label="수정본 보기 방식">
            <button data-action="revised-mode" data-mode="view">문장 보기</button>
            <button data-action="revised-mode" data-mode="edit">직접 편집</button>
          </div>
        </div>
        <div id="revisedTop"></div>
        <div id="revisedBody"></div>
        <div id="detail"></div>
        <div class="card-foot stack" style="gap:8px">
          <div class="actions" id="actions"></div>
          <div class="stats-line" id="revisedStats"></div>
        </div>
      </section>
    </div>

    <section class="card bottom" aria-label="분석">
      <div class="bottom-head">
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-action="bottom-tab" data-tab="analysis">Korean Writing Analysis</button>
          <button class="tab" role="tab" data-action="bottom-tab" data-tab="match">My Style Match</button>
          <button class="tab" role="tab" data-action="bottom-tab" data-tab="patterns">Pattern Analysis</button>
        </div>
        <div class="segmented" role="group" aria-label="분석 대상">
          <button data-action="analysis-target" data-target="original">원문</button>
          <button data-action="analysis-target" data-target="revised">수정본</button>
        </div>
      </div>
      <div class="card-body" id="bottomBody"></div>
    </section>`;

  root.oninput = onInput;
  root.onchange = onChange;
  root.onclick = onClick;
  root.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && e.target.id === "original") {
      e.preventDefault();
      rewrite();
    }
  };

  renderSettings();
  refreshAll();
}

function refreshAll() {
  renderDocMeta();
  renderOriginalStats();
  renderRevised();
  renderBottom();
}

function renderDocMeta() {
  const d = state.doc;
  const el = root.querySelector("#docMeta");
  if (!el) return;
  el.textContent = isSaved(d)
    ? `버전 ${d.versions.length}개 · 마지막 저장 ${fmtDate(d.updatedAt)}`
    : "아직 기록에 저장되지 않은 문서";
}

function statsLine(a) {
  const s = a.stats;
  return `<span>글자 수 <b>${s.chars.toLocaleString()}</b></span>
    <span>공백 제외 <b>${s.charsNoSpace.toLocaleString()}</b></span>
    <span>문장 <b>${s.sentences}</b></span>
    <span>문단 <b>${s.paragraphs}</b></span>
    <span>평균 문장 길이 <b>${s.avgSentenceLength}</b>자</span>`;
}

function renderOriginalStats() {
  root.querySelector("#originalStats").innerHTML = statsLine(analyze(state.doc.original));
}

// ---------- Settings column ----------

function lockedFacts() {
  const { original, factsLock } = state.doc;
  const preserve = state.settings.preserveWords;
  if (factsLock) return extractFacts(original, preserve);
  return preserve.filter((w) => w && original.includes(w)).map((value) => ({ type: "보존 단어", value }));
}

function renderSettings() {
  const d = state.doc;
  const hasProfile = Boolean(state.profile);
  if (d.level === 4 && !hasProfile) d.level = 2;
  const preset = PURPOSE_PRESETS[d.purpose];
  const s = state.settings;
  root.querySelector("#settingsBody").innerHTML = `
    <label class="field">Writing Purpose · 글의 목적
      <select class="input" id="purpose">${Object.entries(PURPOSES).map(([k, v]) => `<option value="${k}" ${k === d.purpose ? "selected" : ""}>${v}</option>`).join("")}</select>
      ${preset?.note ? `<span class="hint">${esc(preset.note)}</span>` : ""}
    </label>
    <label class="field">Tone · 문체
      <select class="input" id="tone">${Object.entries(TONES).map(([k, v]) => `<option value="${k}" ${k === d.tone ? "selected" : ""}>${v}</option>`).join("")}</select>
    </label>
    <div class="field">
      <label class="field" for="customStyle">Custom Style</label>
      <textarea class="input" id="customStyle" rows="2" placeholder="예: 보고서지만 너무 딱딱하지 않게">${esc(d.customStyle)}</textarea>
      <div class="chips">${CUSTOM_STYLE_EXAMPLES.map((x) => `<button class="chip" type="button" data-action="custom-style-example" data-value="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    </div>
    <fieldset class="field" style="border:0;padding:0;margin:0">
      <legend style="margin-bottom:6px">Rewrite Level · 수정 강도</legend>
      <div class="levels">${Object.entries(LEVELS).map(([k, v]) => {
        const disabled = k === "4" && !hasProfile;
        return `<label class="level-opt" title="${disabled ? "My Style에 직접 쓴 글을 3개 이상 등록하고 프로필을 만들면 사용할 수 있습니다." : ""}">
          <input type="radio" name="level" value="${k}" ${Number(k) === d.level ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <span><b>${k}. ${v.name}</b><i>${v.desc}</i></span></label>`;
      }).join("")}</div>
      ${hasProfile ? "" : `<span class="hint">Level 4는 <a href="#/mystyle">내 문체</a>에서 프로필을 만든 뒤 사용할 수 있습니다.</span>`}
    </fieldset>
    <div class="field">
      <div class="toggle">
        <span>Facts Lock <span class="hint">이름·날짜·숫자·인용 등 고정</span></span>
        <label class="switch"><input type="checkbox" id="factsLock" ${d.factsLock ? "checked" : ""} aria-label="Facts Lock"><span></span></label>
      </div>
      <div id="factsList"></div>
    </div>
    <div class="field">
      <span>내 표현 설정</span>
      <span class="hint">자주 쓰는 표현 ${s.personalDictionary.length}개 · 피할 표현 ${s.avoidWords.length}개 · 보존 단어 ${s.preserveWords.length}개 — <a href="#/settings">설정에서 편집</a></span>
    </div>
    <div class="field">
      <label class="field" for="instructions">Custom Instructions · 추가 지시</label>
      <textarea class="input" id="instructions" rows="3" placeholder="예: 내 문장 순서를 최대한 유지해줘.">${esc(d.instructions)}</textarea>
      <details><summary class="hint" style="cursor:pointer">지시 예시 넣기</summary>
        <div class="chips" style="margin-top:6px">${INSTRUCTION_EXAMPLES.map((x) => `<button class="chip" type="button" data-action="instruction-example" data-value="${esc(x)}">${esc(x)}</button>`).join("")}</div></details>
    </div>
    <button class="btn btn-primary btn-block" id="rewriteBtn" data-action="rewrite"></button>
    <p class="hint" style="margin:0">Rewrite를 누르면 원문과 설정이 Claude API로 전송됩니다.${d.level === 4 && s.sendExcerpts ? " Level 4에서는 내 글 샘플 일부도 함께 전송됩니다." : ""}</p>`;
  renderFactsList();
  renderRewriteButton();
}

function renderFactsList() {
  const facts = lockedFacts();
  const el = root.querySelector("#factsList");
  if (!facts.length) {
    el.innerHTML = `<span class="hint">${state.doc.factsLock ? "원문에서 고정할 항목을 찾지 못했습니다." : "꺼져 있습니다. 보존 단어만 유지합니다."}</span>`;
    return;
  }
  el.innerHTML = `<details class="small"><summary class="hint" style="cursor:pointer">고정 항목 ${facts.length}개 보기</summary>
    <div class="chips" style="margin-top:6px">${facts.map((f) => `<span class="chip" title="${esc(f.type)}">${esc(f.value)}</span>`).join("")}</div></details>`;
}

function renderRewriteButton() {
  const btn = root.querySelector("#rewriteBtn");
  if (!btn) return;
  btn.disabled = state.busy || !state.doc.original.trim();
  btn.innerHTML = state.busy ? `<span class="spinner" aria-hidden="true"></span> 다듬는 중…` : "Rewrite";
}

// ---------- Revised column ----------

function renderRevised() {
  const draft = state.draft;
  root.querySelectorAll('[data-action="revised-mode"]').forEach((b) => b.classList.toggle("on", b.dataset.mode === state.revisedMode));

  const top = root.querySelector("#revisedTop");
  const warnings = state.factWarnings;
  top.innerHTML = `${warnings.length ? `<div class="notice notice-warn summary-box" style="margin-top:12px" role="alert">
      <b>⚠ Facts Lock 확인 필요</b> — 아래 항목이 수정본에서 바뀌었거나 빠졌을 수 있습니다.
      <ul class="messages">${warnings.map((w) => `<li>${esc(w.value)} <span class="muted">(${esc(w.type)}) 원문 ${w.originalCount}회 → 수정본 ${w.revisedCount}회</span></li>`).join("")}</ul>
    </div>` : ""}
    ${draft?.summary ? `<div class="notice notice-info summary-box" style="margin-top:12px">${esc(draft.summary)}</div>` : ""}`;

  const body = root.querySelector("#revisedBody");
  if (!draft) {
    body.innerHTML = `<div class="revised-body"><div class="empty">${state.busy
      ? `<div><span class="spinner" style="display:inline-block"></span><p>문장별로 다듬고 수정 이유를 정리하고 있습니다…</p></div>`
      : `<div><p>왼쪽에 글을 넣고 <b>Rewrite</b>를 누르면<br>수정본과 문장별 수정 이유가 여기에 표시됩니다.</p></div>`}</div></div>`;
  } else if (state.revisedMode === "edit") {
    body.innerHTML = `<textarea id="revisedEditor" class="editor" aria-label="수정본 직접 편집">${esc(draft.text)}</textarea>`;
  } else if (draft.sentences) {
    body.innerHTML = `<div class="revised-body">${renderSentenceView(draft.sentences)}</div>
      <div class="legend" style="padding:0 16px 10px"><span class="ins">추가</span><span class="chg">변경</span><span class="del">삭제</span><span>문장을 누르면 수정 이유를 볼 수 있습니다.</span></div>`;
  } else {
    const segs = sideSegments(diffText(state.doc.original, draft.text), "after");
    body.innerHTML = `<div class="revised-body" style="white-space:pre-wrap">${renderSegments(segs)}</div>
      <div class="legend" style="padding:0 16px 10px"><span class="ins">추가</span><span class="chg">변경</span><span>직접 편집한 결과라 문장별 수정 이유는 없습니다.</span></div>`;
  }
  renderDetail();
  renderActions();
  root.querySelector("#revisedStats").innerHTML = draft ? statsLine(analyze(draft.text)) : "";
}

function renderSegments(segs) {
  return segs.map((s) => (s.kind === "equal" ? esc(s.text) : `<span class="${s.kind === "insert" ? "ins" : s.kind === "delete" ? "del" : "chg"}">${esc(s.text)}</span>`)).join("");
}

function renderSentenceView(sentences) {
  const paragraphs = [];
  sentences.forEach((s, i) => {
    const p = Math.max(0, s.paragraph | 0);
    (paragraphs[p] ??= []).push(i);
  });
  return paragraphs.filter(Boolean).map((idxs) => `<p>${idxs.map((i) => {
    const s = sentences[i];
    const changed = s.revised.trim() !== s.original.trim();
    const cls = ["sent", changed ? "changed" : "", state.selected === i ? "selected" : ""].join(" ");
    const inner = !s.revised.trim()
      ? `<span class="del">${esc(s.original)}</span>`
      : changed ? renderSegments(sideSegments(diffWords(s.original, s.revised), "after")) : esc(s.revised);
    return `<span class="${cls}" data-action="select-sentence" data-index="${i}" tabindex="0" role="button">${inner}</span>`;
  }).join(" ")}</p>`).join("");
}

function renderDetail() {
  const el = root.querySelector("#detail");
  const i = state.selected;
  const s = state.draft?.sentences?.[i];
  if (s == null || state.revisedMode !== "view") { el.innerHTML = ""; return; }
  const alt = state.alternatives[i];
  const changed = s.revised.trim() !== s.original.trim();
  el.innerHTML = `<div class="detail" aria-live="polite">
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>문장 ${i + 1} 수정 내용</h3>
      <button class="btn btn-ghost btn-sm" data-action="close-detail" aria-label="닫기">닫기</button></div>
    <dl style="margin:0;display:flex;flex-direction:column;gap:8px">
      <div><dt>Original</dt><dd>${esc(s.original)}</dd></div>
      <div><dt>Revised</dt><dd>${s.revised.trim() ? esc(s.revised) : `<span class="muted">(삭제됨)</span>`}</dd></div>
      <div><dt>Reason</dt><dd>${changed ? esc(s.reason || "설명이 없습니다.") : `<span class="muted">바꾸지 않은 문장입니다.</span>`}</dd></div>
      ${s.change_types?.length ? `<div><dt>Change Type</dt><dd class="chips" style="margin-top:4px">${s.change_types.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</dd></div>` : ""}
    </dl>
    <div class="actions">
      <button class="btn btn-sm" data-action="alternatives" data-index="${i}" ${alt === "loading" ? "disabled" : ""}>${alt === "loading" ? `<span class="spinner"></span> 수정안 만드는 중…` : "수정안 3개 보기"}</button>
      ${changed ? `<button class="btn btn-sm btn-ghost" data-action="revert-sentence" data-index="${i}">이 문장 원문으로</button>` : ""}
    </div>
    ${alt && alt !== "loading" ? `<div class="stack" style="gap:8px">${[
      ["A", "원문 최대 유지"], ["B", "가장 자연스러운 표현"], ["C", "사용자 문체 우선"],
    ].map(([k, label]) => `<div class="option">
        <div class="option-head"><span>Option ${k} · ${label}</span><button class="btn btn-sm" data-action="apply-option" data-index="${i}" data-key="${k}">적용</button></div>
        <div>${esc(alt[k].text)}</div><div class="hint">${esc(alt[k].note)}</div></div>`).join("")}</div>` : ""}
  </div>`;
}

function renderActions() {
  const has = Boolean(state.draft);
  const btn = (action, label, enabled = has) => `<button class="btn btn-sm" data-action="${action}" ${enabled && !state.busy ? "" : "disabled"}>${label}</button>`;
  root.querySelector("#actions").innerHTML = [
    btn("copy", "Copy"),
    btn("rewrite", "Rewrite Again", has && state.doc.original.trim()),
    btn("undo", "Undo", state.undo.length > 0),
    btn("compare", "Compare", has || state.doc.versions.length > 0),
    btn("save-version", "Save Version"),
    btn("download-txt", "Download TXT"),
    btn("download-docx", "Download DOCX"),
    btn("clear", "Clear"),
  ].join("");
}

// ---------- Bottom panel ----------

function renderBottom() {
  root.querySelectorAll('[data-action="bottom-tab"]').forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === state.bottomTab);
    b.setAttribute("aria-selected", b.dataset.tab === state.bottomTab);
  });
  if (state.analysisTarget === "revised" && !state.draft) state.analysisTarget = "original";
  root.querySelectorAll('[data-action="analysis-target"]').forEach((b) => {
    b.classList.toggle("on", b.dataset.target === state.analysisTarget);
    b.disabled = b.dataset.target === "revised" && !state.draft;
  });
  const text = state.analysisTarget === "revised" ? state.draft.text : state.doc.original;
  const body = root.querySelector("#bottomBody");
  if (!text.trim()) {
    body.innerHTML = `<p class="muted">글을 입력하면 분석 결과가 표시됩니다.</p>`;
    return;
  }
  const a = analyze(text);
  if (state.bottomTab === "analysis") body.innerHTML = koreanAnalysisHtml(a);
  else if (state.bottomTab === "match") body.innerHTML = styleMatchHtml(a);
  else body.innerHTML = patternsHtml(a);
}

export function koreanAnalysisHtml(a) {
  const s = a.stats;
  const total = s.sentences || 1;
  const typeRows = Object.entries(a.endingTypes).filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: ENDING_TYPES[k].split("(")[0], value: Math.round((v / total) * 100) }));
  const lenBuckets = [["~20자", 0, 20], ["20~40자", 20, 40], ["40~60자", 40, 60], ["60~80자", 60, 80], ["80자~", 80, Infinity]]
    .map(([label, lo, hi]) => ({ label, value: a.internal.sentenceLengths.filter((l) => l >= lo && l < hi).length, unit: "" }));
  const card = (title, content) => `<div class="mini"><h3>${title}</h3>${content}</div>`;
  const counts = (entries, prefix = "") => list(entries.map((e) => `${prefix}${e.key} · ${e.count}회`));
  return `<div class="grid-cards">
    ${card("조사 사용", counts(a.particles.slice(0, 6)))}
    ${card("문장 종결 표현", counts(a.endings.filter((e) => e.key).slice(0, 6), "~"))}
    ${card("존댓말과 반말", bars(typeRows))}
    ${card("높임말 수준", `<div class="big">${esc(a.honorificLabel)}</div><span class="small muted">높임 강도 ${s.honorificScore}/100 · 높임 표현(께서·드리다·-시-) ${s.honorificMarkers}회</span>`)}
    ${card("연결어 사용", counts(a.connectors.slice(0, 6)))}
    ${card("명사형 표현", `<div class="big">${s.nominalCount}회</div><span class="small muted">100어절당 ${s.nominalPer100Words}회</span>${counts(a.abstractExpressions.slice(0, 4))}`)}
    ${card("서술어 반복", a.predicates.length ? counts(a.predicates.map((p) => ({ ...p, key: `${p.key}-` }))) : `<p class="muted small">반복되는 서술어가 적습니다.</p>`)}
    ${card("문장 길이", `<div class="big">평균 ${s.avgSentenceLength}자</div><span class="small muted">편차 ${s.sentenceLengthStdev} · 최장 ${s.maxSentenceLength}자</span>${bars(lenBuckets.map((b) => ({ label: b.label, value: b.value, display: `${b.value}개` })))}`)}
    ${card("문단 길이", `<div class="big">평균 ${s.avgParagraphLength}자</div><span class="small muted">문단 ${s.paragraphs}개 · 문단당 ${s.avgSentencesPerParagraph}문장</span>`)}
    ${card("구어체와 문어체 비율", bars([{ label: "구어체", value: s.spokenRatio }, { label: "문어체", value: s.writtenRatio }, { label: "중립", value: Math.max(0, 100 - s.spokenRatio - s.writtenRatio) }], { max: 100 }))}
    ${card("괄호 사용", `<div class="big">${s.parentheses}회</div><span class="small muted">1000자당 ${s.parenthesesPer1000}회</span>`)}
    ${card("쉼표 사용", `<div class="big">${s.commas}회</div><span class="small muted">문장당 ${s.commasPerSentence}회</span>`)}
    ${card("같은 표현 반복", list([...a.repeatedExpressions.slice(0, 4), ...a.repeatedWords.slice(0, 4)].map((e) => `${e.key} · ${e.count}회`), "눈에 띄는 반복이 없습니다."))}
    ${card("지나치게 형식적인 표현", counts(a.formalExpressions.slice(0, 6)))}
    ${card("불필요한 피동 표현", a.passives.length ? counts(a.passives.slice(0, 6)) : `<p class="muted small">없음</p>`)}
  </div>`;
}

function styleMatchHtml(a) {
  const profile = state.profile;
  if (!profile) {
    return `<div class="notice">아직 Writing Profile이 없습니다. <a href="#/mystyle">내 문체</a>에서 직접 쓴 글을 3개 이상(권장 5~20개) 등록하고 프로필을 만들면, 이 글이 평소 문체와 얼마나 비슷한지 보여 드립니다.</div>`;
  }
  const m = styleMatch(a, profile);
  const other = state.draft && state.analysisTarget === "revised" ? styleMatch(analyze(state.doc.original), profile) : null;
  const cmp = compareWithProfile(a, profile);
  return `<div class="two">
    <div class="stack">
      <div class="score-hero">
        <div><div class="muted small">My Style Match · ${state.analysisTarget === "revised" ? "수정본" : "원문"}</div><div class="score-num">${m.overall}<small>%</small></div></div>
        ${other ? `<div class="muted small">원문 ${other.overall}% → 수정본 ${m.overall}%</div>` : ""}
      </div>
      ${bars([
        { label: "문장 길이", value: m.sentenceLength },
        { label: "종결 표현", value: m.endings },
        { label: "어휘", value: m.vocabulary },
        { label: "문단 구조", value: m.paragraph },
      ], { max: 100 })}
      <p class="notice small" style="margin:0">이 점수는 AI 탐지 확률이 아니라, 등록한 내 글(${profile.sampleCount}개)과의 문체 유사도입니다.</p>
    </div>
    <div class="stack">
      <h3>현재 글 vs 내 실제 글</h3>
      <ul class="messages">${cmp.messages.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="table-wrap"><table class="table"><thead><tr><th>항목</th><th>현재 글</th><th>내 실제 글</th></tr></thead>
        <tbody>${cmp.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.current)}</td><td>${esc(r.mine)}</td></tr>`).join("")}</tbody></table></div>
    </div>
  </div>`;
}

function patternsHtml(a) {
  const patterns = analyzePatterns(a, { profile: state.profile, avoidWords: state.settings.avoidWords });
  const counts = { high: 0, medium: 0, low: 0 };
  for (const p of patterns) if (p.level in counts) counts[p.level]++;
  return `<p class="muted small" style="margin-top:0">High ${counts.high} · Medium ${counts.medium} · Low ${counts.low} — 글쓰기 습관을 점검하는 참고 지표입니다.</p>
    <div class="patterns">${patterns.map((p, i) => `<div class="pattern">
      <span class="num">${i + 1}</span>
      <div><h3>${esc(p.name)}</h3><div class="small">${esc(p.detail)}</div>
        ${p.examples.length ? `<ul class="ex">${p.examples.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${p.tip && p.level !== "low" && p.level !== "na" ? `<div class="tip">제안: ${esc(p.tip)}</div>` : ""}
      </div>
      <div>${levelBadge(p.level)}</div>
    </div>`).join("")}</div>`;
}

// ---------- Events ----------

let bottomTimer;
function scheduleBottom() {
  clearTimeout(bottomTimer);
  bottomTimer = setTimeout(renderBottom, 350);
}

function onInput(e) {
  const d = state.doc;
  const t = e.target;
  if (t.id === "original") {
    d.original = t.value;
    renderOriginalStats();
    renderFactsList();
    renderRewriteButton();
    renderActions();
    if (state.draft) updateFactWarnings(true);
    scheduleBottom();
  } else if (t.id === "docTitle") {
    d.title = t.value;
    if (isSaved()) upsertDoc();
  } else if (t.id === "customStyle") {
    d.customStyle = t.value;
  } else if (t.id === "instructions") {
    d.instructions = t.value;
  } else if (t.id === "revisedEditor") {
    if (!state.editing) { pushUndo(); state.editing = true; }
    state.draft.text = t.value;
    state.draft.sentences = null;
    state.selected = null;
    updateFactWarnings(true);
    root.querySelector("#revisedStats").innerHTML = statsLine(analyze(t.value));
    scheduleBottom();
  }
  saveCurrent();
}

function onChange(e) {
  const d = state.doc;
  const t = e.target;
  if (t.id === "purpose") {
    d.purpose = t.value;
    const preset = PURPOSE_PRESETS[t.value];
    d.tone = preset.tone;
    if (!(d.level === 4 && state.profile)) d.level = preset.level;
    renderSettings();
    toast(`'${PURPOSES[t.value]}'에 맞춰 문체와 수정 강도를 추천값으로 바꿨습니다.`);
  } else if (t.id === "tone") {
    d.tone = t.value;
  } else if (t.name === "level") {
    d.level = Number(t.value);
    renderSettings();
  } else if (t.id === "factsLock") {
    d.factsLock = t.checked;
    renderFactsList();
    if (state.draft) updateFactWarnings(true);
  } else if (t.id === "revisedEditor") {
    state.editing = false;
  }
  saveCurrent();
}

async function onClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const i = Number(el.dataset.index);
  switch (el.dataset.action) {
    case "example":
      if (state.doc.original.trim() && !confirm("현재 원문을 예시 글로 바꿀까요?")) return;
      state.doc.original = EXAMPLE_TEXT;
      root.querySelector("#original").value = EXAMPLE_TEXT;
      onInput({ target: root.querySelector("#original") });
      break;
    case "custom-style-example":
      state.doc.customStyle = el.dataset.value;
      root.querySelector("#customStyle").value = el.dataset.value;
      saveCurrent();
      break;
    case "instruction-example": {
      const box = root.querySelector("#instructions");
      box.value = box.value.trim() ? `${box.value.trim()}\n${el.dataset.value}` : el.dataset.value;
      state.doc.instructions = box.value;
      saveCurrent();
      break;
    }
    case "rewrite": return rewrite();
    case "revised-mode":
      state.revisedMode = el.dataset.mode;
      state.editing = false;
      renderRevised();
      break;
    case "select-sentence":
      state.selected = state.selected === i ? null : i;
      renderRevised();
      break;
    case "close-detail":
      state.selected = null;
      renderRevised();
      break;
    case "alternatives": return loadAlternatives(i);
    case "apply-option": return applySentence(i, state.alternatives[i][el.dataset.key].text, `수정안 ${el.dataset.key} 적용: ${state.alternatives[i][el.dataset.key].note}`);
    case "revert-sentence": return applySentence(i, state.draft.sentences[i].original, "원문으로 되돌림", []);
    case "bottom-tab":
      state.bottomTab = el.dataset.tab;
      renderBottom();
      break;
    case "analysis-target":
      state.analysisTarget = el.dataset.target;
      renderBottom();
      break;
    case "copy":
      await navigator.clipboard.writeText(state.draft.text).then(() => toast("복사했습니다."), () => toast("복사하지 못했습니다."));
      break;
    case "undo": return undo();
    case "compare": return openCompare();
    case "save-version": return saveVersion();
    case "download-txt":
      download(`${safeFilename(state.doc.title || "수정본")}.txt`, new Blob([state.draft.text], { type: "text/plain;charset=utf-8" }));
      break;
    case "download-docx": return downloadDocx();
    case "clear":
      pushUndo();
      state.draft = null;
      state.selected = null;
      state.factWarnings = [];
      renderRevised();
      renderBottom();
      saveCurrent();
      toast("수정본을 지웠습니다. Undo로 되돌릴 수 있습니다.");
      break;
  }
}

// Enter/Space on a focused sentence behaves like a click.
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("sent")) {
    e.preventDefault();
    e.target.click();
  }
});

// ---------- Actions ----------

function pushUndo() {
  state.undo.push(state.draft ? structuredClone(state.draft) : null);
  if (state.undo.length > 30) state.undo.shift();
}

function undo() {
  if (!state.undo.length) return;
  state.draft = state.undo.pop();
  state.selected = null;
  state.editing = false;
  updateFactWarnings(false);
  renderRevised();
  renderBottom();
  saveCurrent();
}

function updateFactWarnings(render) {
  if (!state.draft) { state.factWarnings = []; return; }
  const model = state.doc.factsLock ? (state.draft.factsDetected ?? []) : [];
  state.factWarnings = checkFacts(state.doc.original, state.draft.text, mergeFacts(lockedFacts(), model));
  if (render) {
    const box = root.querySelector("#revisedTop");
    const scroll = root.querySelector("#revisedEditor");
    if (scroll) {
      // Avoid replacing the textarea while the user types in it.
      const html = state.factWarnings.length ? `<div class="notice notice-warn summary-box" style="margin-top:12px" role="alert"><b>⚠ Facts Lock 확인 필요</b> — ${state.factWarnings.map((w) => esc(w.value)).join(", ")}</div>` : "";
      box.innerHTML = html;
    } else {
      renderRevised();
    }
  }
}

function requestSettings() {
  const d = state.doc;
  const s = state.settings;
  const useExcerpts = d.level === 4 && s.sendExcerpts;
  return {
    purpose: d.purpose,
    tone: d.tone,
    customStyle: d.customStyle,
    level: d.level,
    factsLock: d.factsLock,
    lockedFacts: lockedFacts(),
    preserveWords: s.preserveWords,
    personalDictionary: s.personalDictionary,
    avoidWords: s.avoidWords,
    instructions: d.instructions,
    profile: profileForPrompt(state.profile),
    excerpts: useExcerpts ? styleExcerpts(state.samples) : [],
  };
}

async function rewrite() {
  const d = state.doc;
  if (state.busy || !d.original.trim()) return;
  state.busy = true;
  renderRewriteButton();
  renderActions();
  const hadDraft = Boolean(state.draft);
  if (!hadDraft) renderRevised();
  try {
    const res = await postJson("/api/rewrite", { text: d.original, ...requestSettings() });
    pushUndo();
    const factsDetected = (res.factsDetected ?? []).filter((f) => f.value && d.original.includes(f.value));
    state.draft = { id: uid(), text: res.revisedText, sentences: res.sentences, summary: res.summary, factsDetected };
    state.selected = null;
    state.alternatives = {};
    state.revisedMode = "view";
    state.editing = false;
    state.analysisTarget = "revised";
    updateFactWarnings(false);
    saveCurrent();
  } catch (err) {
    toast(err.message);
  } finally {
    state.busy = false;
    renderRewriteButton();
    renderRevised();
    renderBottom();
  }
}

async function loadAlternatives(i) {
  const sentences = state.draft.sentences;
  const s = sentences[i];
  state.alternatives[i] = "loading";
  renderDetail();
  try {
    const context = (from, to) => sentences.slice(from, to).map((x) => x.revised).join(" ");
    const res = await postJson("/api/alternatives", {
      sentence: s.original,
      before: context(Math.max(0, i - 2), i),
      after: context(i + 1, i + 3),
      ...requestSettings(),
    });
    state.alternatives[i] = res;
  } catch (err) {
    delete state.alternatives[i];
    toast(err.message);
  }
  renderDetail();
}

function applySentence(i, text, reason, changeTypes) {
  pushUndo();
  const s = state.draft.sentences[i];
  s.revised = text;
  s.reason = reason;
  if (changeTypes) s.change_types = changeTypes;
  state.draft.text = assembleRevised(state.draft.sentences, state.doc.original);
  updateFactWarnings(false);
  renderRevised();
  renderBottom();
  saveCurrent();
}

function saveVersion() {
  const d = state.doc;
  const draft = state.draft;
  const last = d.versions[d.versions.length - 1];
  if (last && last.text === draft.text) { toast(`이미 Version ${last.number}로 저장된 내용입니다.`); return; }
  const match = state.profile ? styleMatch(analyze(draft.text), state.profile) : null;
  d.versions.push({
    id: uid(),
    number: (last?.number ?? 0) + 1,
    text: draft.text,
    sentences: draft.sentences,
    summary: draft.summary ?? "",
    factsDetected: draft.factsDetected ?? [],
    purpose: d.purpose,
    tone: d.tone,
    level: d.level,
    customStyle: d.customStyle,
    styleMatch: match?.overall ?? null,
    createdAt: new Date().toISOString(),
  });
  upsertDoc();
  renderDocMeta();
  toast(`Version ${d.versions[d.versions.length - 1].number}을 저장했습니다.`);
}

async function downloadDocx() {
  try {
    const res = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: state.doc.title || "수정본", text: state.draft.text }),
    });
    if (!res.ok) throw new Error("DOCX 파일을 만들지 못했습니다.");
    download(`${safeFilename(state.doc.title || "수정본")}.docx`, await res.blob());
  } catch (err) {
    toast(err.message);
  }
}

// ---------- Compare / Version history ----------

function compareSources() {
  const d = state.doc;
  const out = [{ id: "original", label: "Original (원문)", text: d.original }];
  for (const v of d.versions) out.push({ id: v.id, label: `Version ${v.number} · ${fmtDate(v.createdAt)}`, text: v.text });
  const last = d.versions[d.versions.length - 1];
  if (state.draft && state.draft.text !== last?.text) out.push({ id: "draft", label: "현재 결과 (저장 안 됨)", text: state.draft.text });
  return out;
}

export function openCompare(leftId = "original", rightId = null) {
  const sources = compareSources();
  const right = rightId ?? sources[sources.length - 1].id;
  const options = (sel) => sources.map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  openModal(`<div class="card-head"><h2>Compare · 버전 비교</h2><button class="btn btn-ghost btn-sm" data-action="modal-close">닫기</button></div>
    <div class="modal-body stack">
      <div class="compare-cols">
        <label class="field">왼쪽 <select class="input" id="cmpLeft">${options(leftId)}</select></label>
        <label class="field">오른쪽 <select class="input" id="cmpRight">${options(right)}</select></label>
      </div>
      <div class="legend"><span class="del">삭제</span><span class="ins">추가</span><span class="chg">변경</span><span id="cmpSummary"></span></div>
      <div class="compare-cols"><div class="compare-pane" id="cmpA"></div><div class="compare-pane" id="cmpB"></div></div>
    </div>`);
  const modal = document.getElementById("modal-root");
  const update = () => {
    const a = sources.find((s) => s.id === modal.querySelector("#cmpLeft").value);
    const b = sources.find((s) => s.id === modal.querySelector("#cmpRight").value);
    const ops = diffText(a.text, b.text);
    modal.querySelector("#cmpA").innerHTML = renderSegments(sideSegments(ops, "before"));
    modal.querySelector("#cmpB").innerHTML = renderSegments(sideSegments(ops, "after"));
    const sum = diffSummary(ops);
    modal.querySelector("#cmpSummary").textContent = `추가 ${sum.inserted}자 · 삭제 ${sum.deleted}자 (공백 제외)`;
  };
  modal.querySelector("#cmpLeft").onchange = update;
  modal.querySelector("#cmpRight").onchange = update;
  update();
}

export { closeModal };
