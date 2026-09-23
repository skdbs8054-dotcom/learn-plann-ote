// Server-backed API (npm start). The artifact build swaps this module for artifact/api.js.
import { download } from "./state.js";

export const MAX_INPUT_CHARS = 20000;

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청에 실패했습니다 (${res.status}).`);
  return data;
}

export function rewrite(body) {
  return postJson("/api/rewrite", body);
}

export function alternatives(body) {
  return postJson("/api/alternatives", body);
}

export async function saveFile(filename, blob) {
  download(filename, blob);
}

export async function docxBlob(title, text) {
  const res = await fetch("/api/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text }),
  });
  if (!res.ok) throw new Error("DOCX 파일을 만들지 못했습니다.");
  return res.blob();
}
