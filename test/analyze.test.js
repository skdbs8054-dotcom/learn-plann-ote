import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, splitSentences } from "../lib/analyze.js";
import { buildUserMessage } from "../lib/prompt.js";

test("splits Korean and English sentences", () => {
  assert.equal(splitSentences("오늘은 비가 왔다. 우산을 챙겼다. It rained! Did you?").length, 4);
});

test("detects clichés and uniform sentence length", () => {
  const s = analyze("결론적으로 이것은 좋습니다. 결론적으로 저것도 좋습니다.");
  assert.equal(s.sentences, 2);
  assert.deepEqual(s.cliches[0], { phrase: "결론적으로", count: 2 });
  assert.ok(s.lengthVariation < 0.3);
  assert.equal(s.repeatedStarts, 1);
});

test("handles empty input", () => {
  assert.equal(analyze("").sentences, 0);
});

test("user message falls back to defaults for unknown options", () => {
  const msg = buildUserMessage({ text: "초안", tone: "???", strength: undefined });
  assert.match(msg, /자연스럽고 편안한/);
  assert.match(msg, /<draft>\n초안\n<\/draft>/);
});
