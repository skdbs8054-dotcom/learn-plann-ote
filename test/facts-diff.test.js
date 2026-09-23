import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, checkFacts } from "../public/js/facts.js";
import { diffText, sideSegments } from "../public/js/diff.js";
import { assembleRevised } from "../public/js/assemble.js";

const TEXT = `2024년 3월 5일 Reading Clinic에 32명이 참여했고 만족도는 85%였다. 예산은 1,200만 원이다.
자세한 내용은 https://example.com/report 에 있다. 담당자는 "끝까지 해 보자"라고 말했다. 개인정보 보호법을 지켰고, 좋은 방법을 찾았다.`;

test("extracts locked facts", () => {
  const values = extractFacts(TEXT, ["Storythm"]).map((f) => f.value);
  for (const v of ["2024년 3월 5일", "Reading Clinic", "32명", "85%", "1,200만 원", "https://example.com/report", "\"끝까지 해 보자\"", "개인정보 보호법"]) {
    assert.ok(values.includes(v), `missing ${v}: ${values.join(" | ")}`);
  }
  assert.ok(!values.includes("방법"));
  assert.ok(!values.includes("Storythm"), "preserve words only count when present");
});

test("warns when a locked fact changes", () => {
  const facts = extractFacts(TEXT);
  const revised = TEXT.replace("32명", "서른 명").replace("Reading Clinic", "독서 클리닉");
  const warnings = checkFacts(TEXT, revised, facts).map((w) => w.value);
  assert.deepEqual(warnings.sort(), ["32명", "Reading Clinic"].sort());
  assert.deepEqual(checkFacts(TEXT, TEXT, facts), []);
});

test("diff marks insertions, deletions and changes per side", () => {
  const ops = diffText("또한 이러한 결과를 통해 확인했다.\n\n그대로 둔 문단.", "이 결과를 보면 확인할 수 있다.\n\n그대로 둔 문단.");
  const before = sideSegments(ops, "before");
  const after = sideSegments(ops, "after");
  assert.equal(before.map((s) => s.text).join(""), "또한 이러한 결과를 통해 확인했다.\n\n그대로 둔 문단.");
  assert.equal(after.map((s) => s.text).join(""), "이 결과를 보면 확인할 수 있다.\n\n그대로 둔 문단.");
  assert.ok(after.some((s) => s.kind === "change"));
  assert.ok(after.at(-1).kind === "equal");
});

test("assembles revised text by paragraph", () => {
  const sentences = [
    { paragraph: 0, original: "a.", revised: "A." },
    { paragraph: 0, original: "b.", revised: "" },
    { paragraph: 1, original: "c.", revised: "C." },
  ];
  assert.equal(assembleRevised(sentences, "a. b.\n\nc."), "A.\n\nC.");
  assert.equal(assembleRevised(sentences, "a. b.\nc."), "A.\nC.");
});
