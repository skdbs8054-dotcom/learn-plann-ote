// Small rendering helpers shared by the views.

import { esc } from "./state.js";

const LEVEL_LABEL = { low: "Low", medium: "Medium", high: "High", na: "N/A" };

export function levelBadge(level) {
  return `<span class="badge lvl-${level}">${LEVEL_LABEL[level] ?? level}</span>`;
}

// Single-series horizontal bars with direct value labels. rows: [{label, value, display?}]
export function bars(rows, { max = null, unit = "%" } = {}) {
  if (!rows.length) return `<p class="muted small">데이터가 없습니다.</p>`;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows.map((r) => {
    const w = Math.max(0, Math.min(100, (r.value / top) * 100));
    const shown = r.display ?? `${r.value}${unit}`;
    return `<div class="bar-row" title="${esc(r.label)}: ${esc(shown)}">
      <span>${esc(r.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div>
      <span class="v">${esc(shown)}</span>
    </div>`;
  }).join("")}</div>`;
}

export function tile(label, value, unit = "") {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ""}</div></div>`;
}

export function list(items, empty = "없음") {
  if (!items.length) return `<p class="muted small">${esc(empty)}</p>`;
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function chipEditor(key, words, placeholder) {
  return `<div class="stack" style="gap:8px">
    <form class="chip-form" data-key="${key}" style="display:flex;gap:6px">
      <input class="input" name="word" placeholder="${esc(placeholder)}" autocomplete="off">
      <button class="btn" type="submit">추가</button>
    </form>
    <div class="chips">${words.length ? words.map((w, i) =>
      `<span class="chip">${esc(w)}<button class="x" type="button" data-action="chip-remove" data-key="${key}" data-index="${i}" aria-label="${esc(w)} 삭제">×</button></span>`,
    ).join("") : `<span class="muted small">등록된 표현이 없습니다.</span>`}</div>
  </div>`;
}

export function openModal(html, { small = false } = {}) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-action="modal-close-backdrop"><div class="modal ${small ? "modal-sm" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelector(".modal button, .modal select, .modal input")?.focus();
}

// In-page replacement for window.confirm(), which sandboxed viewers ignore.
export function confirmDialog(message, { ok = "확인", danger = false } = {}) {
  return new Promise((resolve) => {
    openModal(`<div class="modal-body stack">
      <p style="margin:0">${esc(message)}</p>
      <div class="actions" style="justify-content:flex-end">
        <button class="btn" type="button" data-confirm="no">취소</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm="yes">${esc(ok)}</button>
      </div></div>`, { small: true });
    const root = document.getElementById("modal-root");
    root.querySelector('[data-confirm="yes"]').focus();
    const done = (value) => { root.onclick = null; closeModal(); resolve(value); };
    root.onclick = (e) => {
      const b = e.target.closest("[data-confirm]");
      if (b) done(b.dataset.confirm === "yes");
      else if (e.target.classList.contains("modal-backdrop")) done(false);
    };
  });
}

export function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}
