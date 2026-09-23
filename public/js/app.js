import { state, loadAll, newDoc, isSaved, saveCurrent } from "./state.js";
import { getConsent, setConsent } from "./store.js";
import { renderWorkspace } from "./workspace.js";
import { renderDashboard, renderMyStyle, renderReference, renderHistory, renderSettingsPage } from "./pages.js";
import { openModal, closeModal, confirmDialog } from "./ui.js";

const VIEWS = {
  "": renderWorkspace,
  dashboard: renderDashboard,
  mystyle: renderMyStyle,
  reference: renderReference,
  history: renderHistory,
  settings: renderSettingsPage,
};

const TITLES = {
  "": "작업", dashboard: "대시보드", mystyle: "내 문체", reference: "탐지 결과 기록", history: "기록", settings: "설정",
};

const app = document.getElementById("app");

function route() {
  const view = location.hash.replace(/^#\/?/, "").split("?")[0];
  const render = VIEWS[view] ?? renderWorkspace;
  state.view = view in VIEWS ? view : "";
  // Views attach their own handlers; clear the previous view's.
  app.oninput = app.onchange = app.onclick = app.onsubmit = app.onkeydown = null;
  render(app);
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.view === state.view));
  document.title = `${TITLES[state.view]} · Korean Natural Writer`;
}

async function startNewDoc() {
  const unsaved = state.doc.original.trim() && (!isSaved() || (state.draft && !state.doc.versions.some((v) => v.text === state.draft.text)));
  if (unsaved && !(await confirmDialog("새 문서를 시작할까요? 저장하지 않은 결과는 사라집니다.", { ok: "새 문서" }))) return;
  state.doc = newDoc();
  state.draft = null;
  state.undo = [];
  state.selected = null;
  state.alternatives = {};
  state.factWarnings = [];
  state.revisedMode = "view";
  state.analysisTarget = "original";
  saveCurrent();
  if (location.hash && location.hash !== "#") location.hash = "#";
  else route();
}

function askConsent() {
  openModal(`<div class="card-head"><h2>작성한 글을 저장할까요?</h2></div>
    <div class="modal-body stack">
      <p style="margin:0">Korean Natural Writer는 문서, 버전 기록, 내 글 샘플, Writing Profile을 <b>서버가 아닌 이 브라우저</b>에만 저장할 수 있습니다.</p>
      <p class="muted small" style="margin:0">내 글 샘플에는 개인적인 내용이 담길 수 있습니다. 저장하지 않음을 고르면 창을 닫을 때 모든 내용이 사라집니다. 설정에서 언제든 바꾸거나 삭제할 수 있습니다.</p>
      <div class="actions">
        <button class="btn btn-primary" data-consent="local">이 브라우저에 저장</button>
        <button class="btn" data-consent="none">저장하지 않음</button>
      </div>
    </div>`, { small: true });
}

document.addEventListener("click", (e) => {
  const consent = e.target.closest("[data-consent]");
  if (consent) {
    setConsent(consent.dataset.consent);
    closeModal();
    return;
  }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "new-doc") startNewDoc();
  if (action === "modal-close") closeModal();
  if (action === "modal-close-backdrop" && e.target.classList.contains("modal-backdrop") && getConsent()) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && getConsent()) closeModal();
});

window.addEventListener("hashchange", route);

loadAll();
route();
if (!getConsent()) askConsent();
