import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import {
  SYSTEM_PROMPT, REWRITE_SCHEMA, ALTERNATIVES_SCHEMA,
  buildRewriteMessage, buildAlternativesMessage,
} from "./lib/prompt.js";
import { assembleRevised } from "./public/js/assemble.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MAX_INPUT_CHARS = 20000;
const MAX_BODY_BYTES = 1_000_000;

const client = new Anthropic();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new HttpError(413, "요청이 너무 큽니다.");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new HttpError(400, "잘못된 요청 형식입니다.");
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// Only the fields the prompt builders read; everything else in the body is ignored.
function editSettings(body) {
  const strings = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === "string").slice(0, 100) : []);
  return {
    purpose: String(body.purpose ?? ""),
    tone: String(body.tone ?? ""),
    customStyle: String(body.customStyle ?? "").slice(0, 500),
    level: Number(body.level) || 2,
    factsLock: Boolean(body.factsLock),
    lockedFacts: Array.isArray(body.lockedFacts) ? body.lockedFacts.filter((f) => typeof f?.value === "string").slice(0, 300) : [],
    preserveWords: strings(body.preserveWords),
    personalDictionary: strings(body.personalDictionary),
    avoidWords: strings(body.avoidWords),
    instructions: String(body.instructions ?? "").slice(0, 2000),
    profile: typeof body.profile === "string" ? body.profile.slice(0, 4000) : null,
    excerpts: strings(body.excerpts).slice(0, 3).map((e) => e.slice(0, 1000)),
  };
}

async function callModel(userMessage, schema, maxTokens) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new HttpError(422, "요청이 처리되지 않았습니다. 내용을 확인한 뒤 다시 시도해 주세요.");
  if (message.stop_reason === "max_tokens") throw new HttpError(422, "글이 길어 결과가 잘렸습니다. 글을 나눠서 다듬어 주세요.");
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "모델 응답을 해석하지 못했습니다. 다시 시도해 주세요.");
  }
}

async function handleRewrite(req, res) {
  const body = await readJson(req);
  const text = String(body.text ?? "");
  if (!text.trim()) throw new HttpError(400, "다듬을 글을 입력하세요.");
  if (text.length > MAX_INPUT_CHARS) throw new HttpError(400, `글은 ${MAX_INPUT_CHARS.toLocaleString()}자 이하로 입력하세요.`);

  const result = await callModel(buildRewriteMessage({ ...editSettings(body), text }), REWRITE_SCHEMA, 64000);
  sendJson(res, 200, {
    summary: result.summary,
    sentences: result.sentences,
    factsDetected: result.facts_detected,
    revisedText: assembleRevised(result.sentences, text),
  });
}

async function handleAlternatives(req, res) {
  const body = await readJson(req);
  const sentence = String(body.sentence ?? "").trim();
  if (!sentence) throw new HttpError(400, "문장이 비어 있습니다.");
  const result = await callModel(
    buildAlternativesMessage({
      ...editSettings(body),
      sentence: sentence.slice(0, 2000),
      before: String(body.before ?? "").slice(-1000),
      after: String(body.after ?? "").slice(0, 1000),
    }),
    ALTERNATIVES_SCHEMA,
    16000,
  );
  sendJson(res, 200, result);
}

async function handleDocx(req, res) {
  const body = await readJson(req);
  const title = String(body.title ?? "").trim() || "Korean Natural Writer";
  const text = String(body.text ?? "");
  const doc = new Document({
    styles: { default: { document: { run: { font: "Malgun Gothic", size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }),
        ...text.split(/\n/).map((line) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun(line)] })),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  res.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(title.slice(0, 60))}.docx`,
  });
  res.end(buffer);
}

function describeError(err) {
  if (err instanceof HttpError) return [err.status, err.message];
  if (err instanceof Anthropic.AuthenticationError) return [502, "Claude API 키가 올바르지 않습니다. 서버의 ANTHROPIC_API_KEY를 확인하세요."];
  if (err instanceof Anthropic.RateLimitError) return [429, "요청이 많습니다. 잠시 후 다시 시도하세요."];
  if (err instanceof Anthropic.APIConnectionError) return [502, "Claude API에 연결할 수 없습니다."];
  if (err instanceof Anthropic.APIError) return [502, `Claude API 오류: ${err.message}`];
  console.error(err);
  return [500, "알 수 없는 오류가 발생했습니다."];
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, "forbidden");
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    throw new HttpError(404, "not found");
  }
}

const ROUTES = {
  "POST /api/rewrite": handleRewrite,
  "POST /api/alternatives": handleAlternatives,
  "POST /api/docx": handleDocx,
};

const server = http.createServer(async (req, res) => {
  try {
    const route = ROUTES[`${req.method} ${new URL(req.url, "http://localhost").pathname}`];
    if (route) return await route(req, res);
    if (req.method === "GET") return await serveStatic(req, res);
    throw new HttpError(405, "method not allowed");
  } catch (err) {
    const [status, message] = describeError(err);
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`Korean Natural Writer: http://localhost:${PORT}`));
