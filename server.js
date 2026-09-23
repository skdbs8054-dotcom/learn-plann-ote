import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserMessage } from "./lib/prompt.js";
import { analyze } from "./lib/analyze.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MAX_INPUT_CHARS = 20000;

const client = new Anthropic();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_INPUT_CHARS * 4) throw new Error("요청이 너무 큽니다.");
  }
  return JSON.parse(body || "{}");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function handleRewrite(req, res) {
  const { text = "", tone, strength, notes } = await readJson(req);
  if (!text.trim()) return sendJson(res, 400, { error: "다듬을 글을 입력하세요." });
  if (text.length > MAX_INPUT_CHARS) {
    return sendJson(res, 400, { error: `글은 ${MAX_INPUT_CHARS.toLocaleString()}자 이하로 입력하세요.` });
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage({ text, tone, strength, notes }) }],
  });

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  stream.on("text", (delta) => res.write(delta));
  req.on("close", () => stream.abort());

  try {
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") res.write("\n\n[요청이 거절되었습니다. 내용을 확인해 주세요.]");
    else if (message.stop_reason === "max_tokens") res.write("\n\n[출력 길이 한도에 도달해 잘렸습니다.]");
  } catch (err) {
    if (!stream.aborted) res.write(`\n\n[오류: ${describeError(err)}]`);
  }
  res.end();
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다.";
  if (err instanceof Anthropic.RateLimitError) return "요청이 많습니다. 잠시 후 다시 시도하세요.";
  if (err instanceof Anthropic.APIConnectionError) return "Claude API에 연결할 수 없습니다.";
  if (err instanceof Anthropic.APIError) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

async function serveStatic(req, res) {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "forbidden" });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/rewrite") return await handleRewrite(req, res);
    if (req.method === "POST" && req.url === "/api/analyze") {
      const { text = "" } = await readJson(req);
      return sendJson(res, 200, analyze(text));
    }
    if (req.method === "GET") return await serveStatic(req, res);
    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: err.message });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
