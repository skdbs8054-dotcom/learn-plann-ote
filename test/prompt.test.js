import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_PROMPT, buildRewriteMessage, REWRITE_SCHEMA } from "../lib/prompt.js";

test("system prompt forbids detector-evasion claims", () => {
  assert.match(SYSTEM_PROMPT, /never be the optimization target/);
  assert.match(SYSTEM_PROMPT, /Do not intentionally introduce spelling errors/);
});

test("rewrite message carries settings, locks and profile", () => {
  const msg = buildRewriteMessage({
    text: "원문입니다.", purpose: "report", tone: "worker", level: 4, factsLock: true,
    lockedFacts: [{ type: "날짜", value: "2024년 3월" }], preserveWords: ["Storythm"], avoidWords: ["이를 통해"],
    personalDictionary: ["다만"], instructions: "존댓말 유지", profile: "- 평균 문장 길이: 27자", excerpts: ["내 글"],
  });
  for (const s of ["보고서", "직장인 스타일", "My Style", "2024년 3월", "Storythm", "이를 통해", "다만", "존댓말 유지", "<writing_profile>", "<my_writing_sample>", "<original>\n원문입니다.\n</original>"]) {
    assert.ok(msg.includes(s), `missing ${s}`);
  }
});

test("schema objects forbid extra properties", () => {
  assert.equal(REWRITE_SCHEMA.additionalProperties, false);
  assert.equal(REWRITE_SCHEMA.properties.sentences.items.additionalProperties, false);
});
