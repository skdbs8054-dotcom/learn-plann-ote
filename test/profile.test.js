import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, styleMatch, compareWithProfile, profileForPrompt } from "../public/js/profile.js";
import { analyzeText } from "../public/js/korean.js";

const MINE = [
  "오늘 회의 내용 공유드려요. 다만 일정은 아직 확정 전이에요. 그래서 다음 주에 다시 말씀드릴게요.",
  "실제로 써 보니 생각보다 편했어요. 특히 검색이 빨라서 좋았어요. 다만 가격은 조금 아쉬워요.",
  "어제 자료 정리했어요. 그래서 오늘은 검토만 하면 될 것 같아요. 실제로 남은 건 많지 않아요.",
  "이번 주는 좀 바빴어요. 그래도 중요한 건 다 끝냈어요. 다만 보고서는 내일 보낼게요.",
];

test("needs at least three samples", () => {
  assert.equal(buildProfile(MINE.slice(0, 2).map((text) => ({ text }))), null);
});

test("builds a profile that reflects the samples", () => {
  const p = buildProfile(MINE.map((text) => ({ text })));
  assert.equal(p.sampleCount, 4);
  assert.ok(p.endingTypes.polite > 80);
  assert.ok(p.topConnectors.some((c) => c.key === "다만"));
  assert.match(profileForPrompt(p), /해요체/);
});

test("style match is higher for text in the user's voice", () => {
  const p = buildProfile(MINE.map((text) => ({ text })));
  const similar = styleMatch(analyzeText("자료는 어제 받았어요. 다만 확인은 아직이에요. 그래서 내일 다시 볼게요."), p);
  const different = styleMatch(analyzeText("현대 사회에서 데이터 분석은 매우 중요한 역할을 한다. 또한 이러한 분석은 의사결정의 효율성 향상을 통한 성과 개선에 기여한다. 결론적으로 우리는 데이터의 중요성을 인식해야 할 것이다."), p);
  assert.ok(similar.overall > different.overall, `${similar.overall} <= ${different.overall}`);
  for (const k of ["overall", "sentenceLength", "endings", "vocabulary", "paragraph"]) {
    assert.ok(similar[k] >= 0 && similar[k] <= 100);
  }
});

test("comparison explains differences in Korean", () => {
  const p = buildProfile(MINE.map((text) => ({ text })));
  const a = analyzeText("또한 이 기능은 사용자의 편의성 향상에 크게 기여할 것으로 판단됩니다. 또한 운영 효율성 제고를 통한 비용 절감 효과도 기대됩니다. 또한 향후 확장 가능성도 높습니다.");
  const { messages, rows } = compareWithProfile(a, p);
  assert.ok(messages.some((m) => m.includes("'또한'")));
  assert.ok(messages.some((m) => m.includes("길어졌습니다")));
  assert.ok(rows.length >= 8);
});
