// Dashboard, My Style, Detector Reference, History and Settings pages.

import {
  state, PURPOSES, TONES, LEVELS, DETECTORS, esc, fmtDate, toast, uid, newDoc,
  saveDocs, saveSamples, saveSettings, saveProfile, saveCurrent, upsertDoc, rebuildProfile, defaultTitle, isSaved,
} from "./state.js";
import { getConsent, setConsent, remove } from "./store.js";
import { analyzeText, topEntries, ENDING_TYPES } from "./korean.js";
import { MIN_SAMPLES, styleMatch, compareWithProfile } from "./profile.js";
import { tile, bars, list, chipEditor, confirmDialog } from "./ui.js";

const DISCLAIMER = "AI 탐지 결과는 서비스, 모델, 글의 길이 및 언어에 따라 달라질 수 있습니다. 하나의 결과만으로 작성자를 확정할 수 없습니다.";

function latestText(doc) {
  return doc.versions[doc.versions.length - 1]?.text ?? doc.original;
}

function allDocs() {
  // The working document counts too once it has content.
  const docs = state.docs.map((d) => (d.id === state.doc.id ? state.doc : d));
  if (!isSaved() && state.doc.original.trim()) docs.unshift(state.doc);
  return docs;
}

// ---------- Dashboard ----------

export function renderDashboard(el) {
  const docs = allDocs();
  const analyses = docs.map((d) => analyzeText(latestText(d))).filter((a) => a.stats.sentences);
  const words = analyses.reduce((s, a) => s + a.stats.words, 0);
  const sentences = analyses.reduce((s, a) => s + a.stats.sentences, 0);
  const avgLen = sentences ? Math.round((analyses.reduce((s, a) => s + a.stats.avgSentenceLength * a.stats.sentences, 0) / sentences) * 10) / 10 : 0;
  const matches = state.profile ? analyses.map((a) => styleMatch(a, state.profile)?.overall).filter((x) => x != null) : [];
  const avgMatch = matches.length ? Math.round(matches.reduce((a, b) => a + b, 0) / matches.length) : null;

  const repeated = new Map();
  const endings = new Map();
  for (const a of analyses) {
    for (const e of [...a.repeatedExpressions, ...a.repeatedWords]) repeated.set(e.key, (repeated.get(e.key) ?? 0) + e.count);
    for (const [k, v] of Object.entries(a.endingFreq)) if (k) endings.set(k, (endings.get(k) ?? 0) + v);
  }
  const endingTotal = [...endings.values()].reduce((a, b) => a + b, 0) || 1;

  el.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p>지금까지 다듬은 글과 내 문체 데이터를 한눈에 봅니다.</p></div></div>
    <div class="stack">
      <div class="tiles">
        ${tile("Total Documents", docs.length)}
        ${tile("Total Words", words.toLocaleString(), "어절")}
        ${tile("My Writing Samples", state.samples.length, "개")}
        ${tile("Average Style Match", avgMatch == null ? "-" : avgMatch, avgMatch == null ? "" : "%")}
        ${tile("Average Sentence Length", avgLen || "-", avgLen ? "자" : "")}
      </div>
      ${avgMatch == null ? `<p class="muted small" style="margin:0">Average Style Match는 <a href="#mystyle">내 문체</a> 프로필을 만든 뒤 계산됩니다. 이 값은 AI 탐지 확률이 아니라 내 글과의 문체 유사도입니다.</p>` : ""}
      <div class="two">
        <section class="card"><div class="card-head"><h2>Top Repeated Expressions</h2></div><div class="card-body">
          ${repeated.size ? bars(topEntries(repeated, 8).map((e) => ({ label: e.key, value: e.count, display: `${e.count}회` }))) : `<p class="muted small">문서를 작성하면 반복 표현이 집계됩니다.</p>`}
        </div></section>
        <section class="card"><div class="card-head"><h2>Most Used Sentence Endings</h2></div><div class="card-body">
          ${endings.size ? bars(topEntries(endings, 8).map((e) => ({ label: `~${e.key}`, value: Math.round((e.count / endingTotal) * 100) }))) : `<p class="muted small">문서를 작성하면 종결 표현이 집계됩니다.</p>`}
        </div></section>
      </div>
      <section class="card"><div class="card-head"><h2>최근 문서</h2><a class="btn btn-sm" href="#history">전체 기록</a></div><div class="card-body">
        ${docs.length ? `<ul class="list-plain">${docs.slice(0, 5).map((d) => `<li><span>${esc(d.title || defaultTitle(d.original))} <span class="muted small">· ${esc(PURPOSES[d.purpose] ?? "")} · 버전 ${d.versions.length}개</span></span>
          <button class="btn btn-sm" data-action="open-doc" data-id="${d.id}">열기</button></li>`).join("")}</ul>` : `<p class="muted small">아직 문서가 없습니다. <a href="#">새 문서</a>에서 시작해 보세요.</p>`}
      </div></section>
    </div>`;
  el.onclick = pageClick;
}

// ---------- My Style ----------

export function renderMyStyle(el) {
  const p = state.profile;
  const n = state.samples.length;
  const stale = p && (p.sampleCount !== n || state.samples.some((s) => s.createdAt > p.createdAt));
  el.innerHTML = `
    <div class="page-head"><div><h1>My Writing Style</h1><p>직접 쓴 글을 등록하면 평소 문장 길이, 종결 표현, 연결어, 높임 수준을 분석해 개인 Writing Profile을 만듭니다.</p></div></div>
    <div class="two">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>내 글 샘플 <span class="muted small">Human Writing Reference</span></h2><span class="small muted">${n}개</span></div>
          <div class="card-body stack">
            <div>
              <div class="progress" aria-hidden="true"><div style="width:${Math.min(100, (n / 20) * 100)}%"></div></div>
              <p class="hint" style="margin:6px 0 0">최소 ${MIN_SAMPLES}개, 권장 5~20개. AI로 쓰거나 크게 다듬은 글이 아니라 <b>직접 쓴 글</b>을 넣어야 정확합니다.</p>
            </div>
            <form id="sampleForm" class="stack" style="gap:8px">
              <input class="input" name="title" placeholder="제목 (예: 지난달 주간 보고 메일)" maxlength="80">
              <textarea class="input" name="text" rows="6" placeholder="직접 작성한 글을 붙여넣으세요." required></textarea>
              <button class="btn" type="submit">샘플 등록</button>
            </form>
            ${n ? `<ul class="list-plain">${state.samples.map((s) => `<li><div style="min-width:0"><div>${esc(s.title)}</div><div class="sample-text">${esc(s.text.slice(0, 80))}</div><div class="hint">${s.text.length.toLocaleString()}자 · ${fmtDate(s.createdAt)}</div></div>
              <button class="btn btn-sm btn-ghost btn-danger" data-action="delete-sample" data-id="${s.id}">삭제</button></li>`).join("")}</ul>` : ""}
            <button class="btn btn-primary" data-action="build-profile" ${n >= MIN_SAMPLES ? "" : "disabled"}>${p ? "프로필 업데이트" : "Writing Profile 만들기"}</button>
            ${n < MIN_SAMPLES ? `<p class="hint" style="margin:0">샘플을 ${MIN_SAMPLES - n}개 더 등록하면 프로필을 만들 수 있습니다.</p>` : ""}
            <p class="hint" style="margin:0">샘플과 프로필은 ${getConsent() === "local" ? "이 브라우저에만 저장됩니다" : "저장하지 않음 모드라 창을 닫으면 사라집니다"}. 분석은 브라우저 안에서 이뤄지며, Level 4로 다듬을 때만 샘플 일부가 Claude API로 전송됩니다(설정에서 끌 수 있음).</p>
          </div>
        </section>
      </div>
      <div class="stack">${p ? profileHtml(p, stale) : `<section class="card"><div class="card-body"><div class="empty">직접 쓴 글을 ${MIN_SAMPLES}개 이상 등록하고<br>Writing Profile을 만들면 My Style Dashboard가 표시됩니다.</div></div></section>`}
        ${p ? referenceCompareHtml() : ""}
      </div>
    </div>`;

  el.onclick = pageClick;
  el.querySelector("#sampleForm").onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const text = form.text.value.trim();
    if (text.length < 50) { toast("분석을 위해 50자 이상의 글을 넣어 주세요."); return; }
    state.samples.push({ id: uid(), title: form.title.value.trim() || defaultTitle(text), text, createdAt: new Date().toISOString() });
    saveSamples();
    if (state.samples.length === MIN_SAMPLES && !state.profile) rebuildProfile();
    toast("샘플을 등록했습니다.");
    renderMyStyle(el);
  };
  const sel = el.querySelector("#refSource");
  if (sel) sel.onchange = () => renderReferenceCompare(el);
  const paste = el.querySelector("#refPaste");
  if (paste) paste.oninput = () => renderReferenceCompare(el);
  if (p) renderReferenceCompare(el);
}

function profileHtml(p, stale) {
  const typeRows = Object.entries(p.endingTypes).filter(([, v]) => v > 0).map(([k, v]) => ({ label: ENDING_TYPES[k].split("(")[0], value: v }));
  const mix = Object.entries(p.styleMix).map(([k, v]) => ({ label: k, value: v }));
  return `<section class="card">
    <div class="card-head"><h2>My Style Dashboard</h2><span class="small muted">샘플 ${p.sampleCount}개 · ${fmtDate(p.createdAt)}</span></div>
    <div class="card-body stack">
      ${stale ? `<div class="notice notice-warn">샘플이 바뀌었습니다. 프로필 업데이트를 누르면 최신 샘플로 다시 분석합니다.</div>` : ""}
      <div class="tiles">
        ${tile("평균 문장 길이", p.avgSentenceLength, "자")}
        ${tile("평균 문단 길이", p.avgParagraphLength, "자")}
        ${tile("문장 길이 편차", p.sentenceLengthStdev)}
        ${tile("쉼표 (문장당)", p.commasPerSentence, "회")}
        ${tile("괄호 (1000자당)", p.parenthesesPer1000, "회")}
        ${tile("존댓말 강도", p.honorificScore, "/100")}
        ${tile("능동문 비율", p.activeRatio, "%")}
        ${tile("서론 비중", p.introShare ?? "-", p.introShare == null ? "" : "%")}
      </div>
      <div class="grid-cards">
        <div class="mini"><h3>주요 종결 표현</h3>${list(p.topEndings.slice(0, 5).map((e) => `~${e.key}`))}</div>
        <div class="mini"><h3>자주 사용하는 연결어</h3>${list(p.topConnectors.slice(0, 5).map((e) => e.key), "연결어를 거의 쓰지 않습니다.")}</div>
        <div class="mini"><h3>자주 사용하는 조사</h3>${list(p.topParticles.slice(0, 5).map((e) => e.key))}</div>
        <div class="mini"><h3>자주 사용하는 표현</h3>${list(p.topExpressions.slice(0, 6).map((e) => e.key), "여러 글에 반복되는 표현이 아직 없습니다.")}</div>
      </div>
      <div class="two">
        <div class="mini"><h3>문체</h3>${bars(mix, { max: 100 })}</div>
        <div class="mini"><h3>종결 유형 · 높임 수준</h3>${bars(typeRows, { max: 100 })}<span class="small muted">${esc(p.honorificLabel)}</span></div>
      </div>
      <div class="grid-cards">
        <div class="mini"><h3>구어체 / 문어체</h3><div class="big">${p.spokenRatio}% / ${p.writtenRatio}%</div></div>
        <div class="mini"><h3>능동문 / 피동 포함</h3><div class="big">${p.activeRatio}% / ${p.passiveRatio}%</div></div>
        <div class="mini"><h3>설명 순서</h3><div>${esc(p.explanationOrder)}</div></div>
        <div class="mini"><h3>결론 작성 방식</h3><div>${esc(p.conclusionStyle)}</div></div>
        <div class="mini"><h3>반복되는 문장 구조</h3>${list(p.repeatedStructures.map((s) => `${s.label} (${s.count})`), "뚜렷한 반복 구조가 없습니다.")}</div>
      </div>
    </div>
  </section>`;
}

function referenceCompareHtml() {
  const hasDraft = Boolean(state.draft);
  return `<section class="card">
    <div class="card-head"><h2>현재 글 vs 내 실제 글</h2>
      <select class="input" id="refSource" style="width:auto">
        <option value="original">현재 문서 원문</option>
        ${hasDraft ? `<option value="revised" selected>현재 문서 수정본</option>` : ""}
        <option value="paste">직접 붙여넣기</option>
      </select></div>
    <div class="card-body stack">
      <textarea class="input hidden" id="refPaste" rows="4" placeholder="비교할 글을 붙여넣으세요."></textarea>
      <div id="refResult"></div>
    </div></section>`;
}

function renderReferenceCompare(el) {
  const source = el.querySelector("#refSource").value;
  const paste = el.querySelector("#refPaste");
  paste.classList.toggle("hidden", source !== "paste");
  const text = source === "paste" ? paste.value : source === "revised" ? state.draft?.text ?? "" : state.doc.original;
  const out = el.querySelector("#refResult");
  if (!text.trim()) { out.innerHTML = `<p class="muted small">비교할 글이 없습니다.</p>`; return; }
  const a = analyzeText(text);
  const m = styleMatch(a, state.profile);
  const cmp = compareWithProfile(a, state.profile);
  out.innerHTML = `<div class="score-hero"><div><div class="muted small">My Style Match</div><div class="score-num">${m.overall}<small>%</small></div></div>
      <div class="small muted">문장 길이 ${m.sentenceLength}% · 종결 표현 ${m.endings}% · 어휘 ${m.vocabulary}% · 문단 구조 ${m.paragraph}%<br>AI 탐지 확률이 아니라 내 글과의 유사도입니다.</div></div>
    <ul class="messages">${cmp.messages.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="table-wrap"><table class="table"><thead><tr><th>항목</th><th>현재 글</th><th>내 실제 글</th></tr></thead>
      <tbody>${cmp.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.current)}</td><td>${esc(r.mine)}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- AI Detector Reference ----------

let referenceDocId = null;

function versionOptions(doc) {
  return [{ id: "original", label: "Original" }, ...doc.versions.map((v) => ({ id: v.id, label: `Version ${v.number}` }))];
}

function spreadMessage(values) {
  if (values.length < 2) return "";
  const spread = Math.max(...values) - Math.min(...values);
  return spread >= 15
    ? `탐지 서비스별 결과가 일치하지 않습니다. (서비스 간 최대 ${spread}%p 차이)`
    : `서비스 간 차이는 ${spread}%p입니다.`;
}

export function renderReference(el) {
  const docs = allDocs();
  if (!docs.some((d) => d.id === referenceDocId)) referenceDocId = docs[0]?.id ?? null;
  const doc = docs.find((d) => d.id === referenceDocId);
  el.innerHTML = `
    <div class="page-head"><div><h1>AI Detector Reference</h1><p>외부 AI 탐지 서비스에서 직접 확인한 결과를 기록하고 비교합니다.</p></div></div>
    <div class="stack">
      <div class="notice notice-info"><b>${DISCLAIMER}</b><br>
        이 앱은 외부 서비스를 호출하지 않으며, 기록한 수치는 참고 데이터로만 저장됩니다. 탐지 수치를 낮추는 방향으로 글을 자동 수정하는 기능은 제공하지 않습니다.</div>
      <div class="services">${DETECTORS.map((d) => `<div class="service"><h3>${esc(d.name)}</h3><a href="${d.url}" target="_blank" rel="noopener noreferrer" class="small">서비스 열기 ↗</a></div>`).join("")}</div>
      ${doc ? detectorFormHtml(doc, docs) : `<section class="card"><div class="card-body"><div class="empty">기록할 문서가 없습니다. <a href="#">새 문서</a>에서 글을 작성하세요.</div></div></section>`}
      ${doc ? detectorHistoryHtml(doc) : ""}
    </div>`;
  el.onclick = pageClick;
  if (!doc) return;
  el.querySelector("#refDoc").onchange = (e) => { referenceDocId = e.target.value; renderReference(el); };
  el.querySelector("#detectorForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const results = DETECTORS.map((d) => ({ service: d.name, value: f[d.id].value }))
      .concat(f.customName.value.trim() ? [{ service: f.customName.value.trim(), value: f.customValue.value }] : [])
      .filter((r) => r.value !== "")
      .map((r) => ({ service: r.service, ai: Math.max(0, Math.min(100, Math.round(Number(r.value)))) }))
      .filter((r) => Number.isFinite(r.ai));
    if (!results.length) { toast("하나 이상의 결과를 입력하세요."); return; }
    const version = versionOptions(doc).find((v) => v.id === f.version.value);
    doc.detectorRecords.push({ id: uid(), versionId: version.id, versionLabel: version.label, results, memo: f.memo.value.trim(), createdAt: new Date().toISOString() });
    storeDoc(doc);
    toast("결과를 기록했습니다.");
    renderReference(el);
  };
}

function storeDoc(doc) {
  if (doc.id === state.doc.id) {
    upsertDoc();
  } else {
    doc.updatedAt = new Date().toISOString();
    saveDocs();
  }
}

function detectorFormHtml(doc, docs) {
  return `<section class="card">
    <div class="card-head"><h2>결과 기록</h2>
      <select class="input" id="refDoc" style="width:auto;max-width:60%">${docs.map((d) => `<option value="${d.id}" ${d.id === doc.id ? "selected" : ""}>${esc(d.title || defaultTitle(d.original))}</option>`).join("")}</select></div>
    <form class="card-body stack" id="detectorForm">
      <label class="field">검사한 버전
        <select class="input" name="version" style="max-width:240px">${versionOptions(doc).map((v) => `<option value="${v.id}">${esc(v.label)}</option>`).join("")}</select>
        <span class="hint">수정본을 기록하려면 먼저 작업 화면에서 Save Version으로 저장하세요.</span></label>
      <div class="services">
        ${DETECTORS.map((d) => `<label class="service field">${esc(d.name)} · AI %<input class="input" name="${d.id}" type="number" min="0" max="100" inputmode="numeric" placeholder="예: 40"></label>`).join("")}
        <div class="service field">기타 서비스
          <input class="input" name="customName" placeholder="서비스 이름" style="max-width:none">
          <input class="input" name="customValue" type="number" min="0" max="100" placeholder="AI %"></div>
      </div>
      <label class="field">메모 <input class="input" name="memo" placeholder="예: 무료 버전, 1,200자 기준"></label>
      <div><button class="btn btn-primary" type="submit">기록하기</button></div>
    </form></section>`;
}

function detectorHistoryHtml(doc) {
  const records = doc.detectorRecords ?? [];
  if (!records.length) return `<section class="card"><div class="card-head"><h2>Detector Comparison History</h2></div><div class="card-body"><p class="muted small">아직 기록이 없습니다.</p></div></section>`;
  const versions = versionOptions(doc).filter((v) => records.some((r) => r.versionId === v.id));
  const services = [...new Set(records.flatMap((r) => r.results.map((x) => x.service)))];
  // Latest value per (version, service).
  const latest = (vid, service) => {
    const r = [...records].reverse().find((rec) => rec.versionId === vid && rec.results.some((x) => x.service === service));
    return r?.results.find((x) => x.service === service)?.ai;
  };
  return `<section class="card">
    <div class="card-head"><h2>Detector Comparison History</h2><span class="small muted">버전별 최근 기록 · AI %</span></div>
    <div class="card-body stack">
      <div class="table-wrap"><table class="table"><thead><tr><th>버전</th>${services.map((s) => `<th>${esc(s)}</th>`).join("")}<th>비교</th></tr></thead>
        <tbody>${versions.map((v) => {
          const vals = services.map((s) => latest(v.id, s));
          return `<tr><td>${esc(v.label)}</td>${vals.map((x) => `<td>${x == null ? "-" : x}</td>`).join("")}<td class="small">${esc(spreadMessage(vals.filter((x) => x != null)) || "-")}</td></tr>`;
        }).join("")}</tbody></table></div>
      <p class="muted small" style="margin:0">${DISCLAIMER}</p>
      <h3>모든 기록</h3>
      ${[...records].reverse().map((r) => `<div class="mini">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(r.versionLabel)}</b><span class="small muted">${fmtDate(r.createdAt)}${r.memo ? ` · ${esc(r.memo)}` : ""}</span></div>
        ${r.results.map((x) => `<div class="detector-bar" title="${esc(x.service)} AI ${x.ai}%"><span>${esc(x.service)}</span><div class="bar-track"><div class="bar-fill" style="width:${x.ai}%"></div></div><span class="v">AI ${x.ai}%</span></div>`).join("")}
        ${r.results.length >= 2 ? `<div class="small">${esc(spreadMessage(r.results.map((x) => x.ai)))}</div>` : ""}
        <div><button class="btn btn-sm btn-ghost btn-danger" data-action="delete-record" data-doc="${doc.id}" data-id="${r.id}">기록 삭제</button></div>
      </div>`).join("")}
    </div></section>`;
}

// ---------- History ----------

export function renderHistory(el) {
  const docs = state.docs;
  el.innerHTML = `
    <div class="page-head"><div><h1>History</h1><p>Save Version으로 저장한 문서입니다.</p></div>
      ${docs.length ? `<button class="btn btn-danger" data-action="clear-history">Clear History</button>` : ""}</div>
    <section class="card"><div class="card-body">
      ${docs.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>제목</th><th>날짜</th><th>글의 목적</th><th>사용한 Style</th><th>My Style Match</th><th>버전 수</th><th></th></tr></thead>
        <tbody>${docs.map((d) => {
          const last = d.versions[d.versions.length - 1];
          const match = state.profile ? styleMatch(analyzeText(latestText(d)), state.profile)?.overall : last?.styleMatch;
          const tone = TONES[last?.tone ?? d.tone] ?? "";
          const level = LEVELS[last?.level ?? d.level];
          return `<tr><td>${esc(d.title || defaultTitle(d.original))}</td><td class="small">${fmtDate(d.updatedAt)}</td><td>${esc(PURPOSES[d.purpose] ?? "")}</td>
            <td>${esc(tone)}${level ? ` <span class="muted small">· ${level.name}</span>` : ""}</td>
            <td>${match == null ? "-" : `${match}%`}</td><td>${d.versions.length}</td>
            <td style="white-space:nowrap"><button class="btn btn-sm" data-action="open-doc" data-id="${d.id}">열기</button>
              <button class="btn btn-sm btn-ghost btn-danger" data-action="delete-doc" data-id="${d.id}">삭제</button></td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty">저장된 문서가 없습니다. 작업 화면에서 Save Version을 누르면 여기에 표시됩니다.</div>`}
    </div></section>`;
  el.onclick = pageClick;
}

// ---------- Settings ----------

export function renderSettingsPage(el) {
  const s = state.settings;
  const consent = getConsent();
  el.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>내 표현 사전과 개인정보 설정을 관리합니다.</p></div></div>
    <div class="two">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Personal Dictionary <span class="muted small">자주 쓰는 표현</span></h2></div>
          <div class="card-body stack"><p class="hint" style="margin:0">내가 자주 쓰는 표현은 Rewrite 과정에서 자연스럽게 유지합니다. 예: 다만, 그래서, 실제로, 개인적으로, ~라고 생각합니다</p>
          ${chipEditor("personalDictionary", s.personalDictionary, "예: 개인적으로")}</div></section>
        <section class="card"><div class="card-head"><h2>Avoid Words <span class="muted small">피하고 싶은 표현</span></h2></div>
          <div class="card-body stack"><p class="hint" style="margin:0">수정 시 우선적으로 다른 표현으로 바꾸고, Pattern Analysis에서 표시합니다. 예: 매우 중요하다, 시사한다, 제고하다, 이를 통해</p>
          ${chipEditor("avoidWords", s.avoidWords, "예: 결과적으로")}</div></section>
        <section class="card"><div class="card-head"><h2>Preserve Words <span class="muted small">반드시 유지</span></h2></div>
          <div class="card-body stack"><p class="hint" style="margin:0">Rewrite 과정에서 절대 바꾸지 않고, 바뀌면 경고합니다. 예: Storythm, Historythm, Reading Clinic, Vocabulary Acceleration</p>
          ${chipEditor("preserveWords", s.preserveWords, "예: Reading Clinic")}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>저장 방식</h2></div><div class="card-body stack">
          <label class="toggle" style="justify-content:flex-start"><input type="radio" name="consent" value="local" ${consent === "local" ? "checked" : ""}> 이 브라우저에 저장</label>
          <label class="toggle" style="justify-content:flex-start"><input type="radio" name="consent" value="none" ${consent !== "local" ? "checked" : ""}> 저장하지 않음 (창을 닫으면 사라짐)</label>
          <p class="hint" style="margin:0">문서, 샘플, 프로필, 탐지 결과 기록은 서버에 저장되지 않습니다. Rewrite를 누를 때 원문과 설정만 Claude API로 전송됩니다.</p>
          <div class="toggle"><span>Level 4에서 내 글 샘플 일부 전송 <span class="hint">끄면 통계 요약만 보냅니다</span></span>
            <label class="switch"><input type="checkbox" id="sendExcerpts" ${s.sendExcerpts ? "checked" : ""}><span></span></label></div>
        </div></section>
        <section class="card"><div class="card-head"><h2>개인정보</h2></div><div class="card-body stack">
          <p class="hint" style="margin:0">My Writing Style 분석용 글에는 민감한 정보가 포함될 수 있습니다. 필요할 때 언제든 삭제하세요.</p>
          <div class="actions">
            <button class="btn btn-danger" data-action="delete-samples">Delete Writing Samples (${state.samples.length})</button>
            <button class="btn btn-danger" data-action="delete-profile" ${state.profile ? "" : "disabled"}>Delete Writing Profile</button>
            <button class="btn btn-danger" data-action="clear-history">Clear History (${state.docs.length})</button>
            <button class="btn btn-danger" data-action="delete-all">모든 데이터 삭제</button>
          </div>
        </div></section>
      </div>
    </div>`;
  el.onclick = pageClick;
  el.onsubmit = (e) => {
    const form = e.target.closest(".chip-form");
    if (!form) return;
    e.preventDefault();
    const word = form.word.value.trim();
    const listRef = state.settings[form.dataset.key];
    if (word && !listRef.includes(word)) listRef.push(word);
    saveSettings();
    renderSettingsPage(el);
    el.querySelector(`.chip-form[data-key="${form.dataset.key}"] input`)?.focus();
  };
  el.onchange = (e) => {
    if (e.target.name === "consent") {
      setConsent(e.target.value);
      toast(e.target.value === "local" ? "이 브라우저에 저장합니다." : "저장하지 않음으로 바꾸고 브라우저에 있던 데이터를 지웠습니다.");
    } else if (e.target.id === "sendExcerpts") {
      state.settings.sendExcerpts = e.target.checked;
      saveSettings();
    }
  };
}

// ---------- Shared click handler ----------

async function pageClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const rerender = () => window.dispatchEvent(new Event("hashchange"));
  switch (el.dataset.action) {
    case "open-doc": {
      const doc = state.docs.find((d) => d.id === el.dataset.id) ?? (state.doc.id === el.dataset.id ? state.doc : null);
      if (!doc) return;
      openDoc(doc);
      location.hash = "#";
      break;
    }
    case "delete-doc":
      if (!(await confirmDialog("이 문서와 버전, 탐지 결과 기록을 삭제할까요?", { ok: "삭제", danger: true }))) return;
      state.docs = state.docs.filter((d) => d.id !== el.dataset.id);
      saveDocs();
      rerender();
      break;
    case "clear-history":
      if (!(await confirmDialog("저장된 모든 문서 기록을 삭제할까요? 되돌릴 수 없습니다.", { ok: "삭제", danger: true }))) return;
      state.docs = [];
      saveDocs();
      toast("기록을 모두 삭제했습니다.");
      rerender();
      break;
    case "delete-sample":
      state.samples = state.samples.filter((s) => s.id !== el.dataset.id);
      saveSamples();
      rerender();
      break;
    case "build-profile":
      if (rebuildProfile()) toast("Writing Profile을 만들었습니다.");
      else toast("분석할 수 있는 샘플이 부족합니다.");
      rerender();
      break;
    case "delete-samples":
      if (!(await confirmDialog("등록한 글 샘플을 모두 삭제할까요? 프로필은 따로 삭제해야 합니다.", { ok: "삭제", danger: true }))) return;
      state.samples = [];
      saveSamples();
      toast("샘플을 삭제했습니다.");
      rerender();
      break;
    case "delete-profile":
      if (!(await confirmDialog("Writing Profile을 삭제할까요?", { ok: "삭제", danger: true }))) return;
      state.profile = null;
      saveProfile();
      if (state.doc.level === 4) state.doc.level = 2;
      toast("프로필을 삭제했습니다.");
      rerender();
      break;
    case "delete-all":
      if (!(await confirmDialog("문서, 샘플, 프로필, 설정, 작업 중인 글을 모두 삭제할까요?", { ok: "삭제", danger: true }))) return;
      for (const k of ["docs", "samples", "profile", "settings", "current"]) remove(k);
      state.docs = [];
      state.samples = [];
      state.profile = null;
      state.settings = { personalDictionary: [], avoidWords: [], preserveWords: [], sendExcerpts: true };
      state.doc = newDoc();
      state.draft = null;
      state.undo = [];
      toast("모든 데이터를 삭제했습니다.");
      rerender();
      break;
    case "chip-remove":
      state.settings[el.dataset.key].splice(Number(el.dataset.index), 1);
      saveSettings();
      rerender();
      break;
    case "delete-record": {
      const doc = allDocs().find((d) => d.id === el.dataset.doc);
      if (!doc) return;
      doc.detectorRecords = doc.detectorRecords.filter((r) => r.id !== el.dataset.id);
      storeDoc(doc);
      rerender();
      break;
    }
  }
}

export function openDoc(doc) {
  state.doc = structuredClone(doc);
  const last = doc.versions[doc.versions.length - 1];
  state.draft = last ? { id: last.id, text: last.text, sentences: last.sentences, summary: last.summary, factsDetected: last.factsDetected ?? [] } : null;
  state.undo = [];
  state.selected = null;
  state.alternatives = {};
  state.factWarnings = [];
  state.revisedMode = "view";
  saveCurrent();
}
