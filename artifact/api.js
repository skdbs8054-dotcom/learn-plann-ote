// Artifact build of the API layer: calls Claude through the claude.ai viewer's
// `sample` capability (on the viewer's own account) instead of the Node server,
// and saves files through the `downloads` capability.
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import {
  SYSTEM_PROMPT, CHANGE_TYPES, FACT_TYPES, buildRewriteMessage, buildAlternativesMessage,
} from "../lib/prompt.js";
import { assembleRevised } from "../public/js/assemble.js";

// sample input is capped at 64 KiB; Korean is ~3 bytes per character.
export const MAX_INPUT_CHARS = 12000;

const ERRORS = {
  not_granted: "Claude 사용을 허용해야 글을 다듬을 수 있습니다. 페이지를 새로고침한 뒤 허용해 주세요.",
  rate_limited: "요청이 많습니다. 잠시 후 다시 시도하세요.",
  prompt_too_large: "글이 너무 깁니다. 나눠서 다듬어 주세요.",
  invalid_json: "Claude 응답을 해석하지 못했습니다. 다시 시도해 주세요.",
  cancelled: "요청을 취소했습니다.",
};

async function sampler() {
  const sample = await window.claude?.use?.("sample");
  if (!sample) throw new Error("이 화면에서는 Claude를 호출할 수 없습니다. claude.ai에서 이 페이지를 열어 주세요.");
  return sample;
}

async function askJson(prompt) {
  const sample = await sampler();
  try {
    return await sample.json(prompt, { modelTier: "default", cache: false });
  } catch (e) {
    throw new Error(ERRORS[e?.code] ?? `Claude 요청에 실패했습니다${e?.message ? `: ${e.message}` : "."}`);
  }
}

const REWRITE_FORMAT = `
응답 형식: 설명 없이 아래 모양의 JSON 객체 하나만 출력한다.
{"summary": "…", "sentences": [{"paragraph": 0, "original": "…", "revised": "…", "reason": "…", "change_types": ["…"]}], "facts_detected": [{"type": "…", "value": "…"}]}
change_types 값은 다음 중에서만 고른다: ${CHANGE_TYPES.join(", ")}
facts_detected의 type 값은 다음 중에서만 고른다: ${FACT_TYPES.join(", ")}`;

const ALT_FORMAT = `
응답 형식: 설명 없이 아래 모양의 JSON 객체 하나만 출력한다.
{"A": {"text": "…", "note": "…"}, "B": {"text": "…", "note": "…"}, "C": {"text": "…", "note": "…"}}`;

const str = (x) => (typeof x === "string" ? x : "");

export async function rewrite(body) {
  const data = await askJson(`${SYSTEM_PROMPT}\n\n${buildRewriteMessage(body)}\n${REWRITE_FORMAT}`);
  if (!Array.isArray(data?.sentences) || !data.sentences.length) throw new Error(ERRORS.invalid_json);
  const sentences = data.sentences.map((s) => ({
    paragraph: Number.isInteger(s?.paragraph) ? s.paragraph : 0,
    original: str(s?.original),
    revised: str(s?.revised),
    reason: str(s?.reason),
    change_types: Array.isArray(s?.change_types) ? s.change_types.filter((t) => CHANGE_TYPES.includes(t)) : [],
  }));
  return {
    summary: str(data.summary),
    sentences,
    factsDetected: Array.isArray(data.facts_detected) ? data.facts_detected.filter((f) => typeof f?.value === "string") : [],
    revisedText: assembleRevised(sentences, body.text),
  };
}

export async function alternatives(body) {
  const data = await askJson(`${SYSTEM_PROMPT}\n\n${buildAlternativesMessage(body)}\n${ALT_FORMAT}`);
  const out = {};
  for (const k of ["A", "B", "C"]) {
    if (!str(data?.[k]?.text)) throw new Error(ERRORS.invalid_json);
    out[k] = { text: data[k].text, note: str(data[k].note) };
  }
  return out;
}

export async function saveFile(filename, blob) {
  const downloads = await window.claude?.use?.("downloads");
  if (!downloads) throw new Error("이 화면에서는 파일을 저장할 수 없습니다. Copy로 복사해 주세요.");
  try {
    await downloads.save({ filename, data: blob });
  } catch (e) {
    if (e?.code !== "declined") throw new Error("파일을 저장하지 못했습니다.");
  }
}

export async function docxBlob(title, text) {
  const doc = new Document({
    styles: { default: { document: { run: { font: "Malgun Gothic", size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }),
        ...text.split(/\n/).map((line) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun(line)] })),
      ],
    }],
  });
  return Packer.toBlob(doc);
}
