import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, analyzePatterns, splitSentences, endingType, sentenceEnding } from "../public/js/korean.js";

const FORMULAIC = `현대 사회에서 독서는 매우 중요한 역할을 합니다. 또한 이러한 독서 습관은 학습 효율성 향상을 통한 성과 개선에 기여합니다. 따라서 학생들에게 독서가 권장됩니다.

또한 이를 통해 만족도가 크게 향상되었습니다. 이러한 결과를 통해 해당 방법이 효과적이라는 것을 확인할 수 있었습니다.

결론적으로 우리는 독서의 중요성을 인식해야 할 것입니다.`;

test("splits sentences without breaking decimals", () => {
  assert.deepEqual(splitSentences("점수는 3.5점이었다. 좋았다! 정말?"), ["점수는 3.5점이었다.", "좋았다!", "정말?"]);
});

test("classifies Korean sentence endings", () => {
  assert.equal(endingType("회의를 진행했습니다."), "formal");
  assert.equal(endingType("오늘 날씨가 좋네요."), "polite");
  assert.equal(endingType("결과가 좋았다."), "plain");
  assert.equal(endingType("나 지금 가는 중이야"), "casual");
  assert.equal(endingType("검토 완료함."), "nominal");
  assert.equal(sentenceEnding("좋은 방법인 것 같습니다."), "인 것 같습니다");
});

test("counts basic stats", () => {
  const a = analyzeText("첫 문장입니다. 둘째 문장입니다.\n\n셋째 문단입니다.");
  assert.equal(a.stats.sentences, 3);
  assert.equal(a.stats.paragraphs, 2);
  assert.equal(a.stats.charsNoSpace, "첫문장입니다.둘째문장입니다.셋째문단입니다.".length);
});

test("flags formulaic patterns in an AI-style draft", () => {
  const a = analyzeText(FORMULAIC);
  const byId = Object.fromEntries(analyzePatterns(a).map((p) => [p.id, p]));
  assert.equal(byId.connector.level, "high");
  assert.notEqual(byId.intro.level, "low");
  assert.notEqual(byId.conclusion.level, "low");
  assert.notEqual(byId.abstract.level, "low");
  assert.notEqual(byId.passive.level, "low");
  assert.equal(byId.mystyle.level, "na");
});

test("keeps a plain casual text low on formulaic patterns", () => {
  const a = analyzeText("어제 친구랑 영화 봤어. 생각보다 재밌더라. 다음엔 너도 같이 가자.");
  const byId = Object.fromEntries(analyzePatterns(a).map((p) => [p.id, p]));
  assert.equal(byId.intro.level, "low");
  assert.equal(byId.conclusion.level, "low");
  assert.equal(byId.connector.level, "low");
  assert.ok(a.stats.spokenRatio > 50);
});

test("reports avoid words that appear in the text", () => {
  const a = analyzeText("이 결과는 매우 중요하다. 이를 통해 알 수 있다.");
  const avoid = analyzePatterns(a, { avoidWords: ["이를 통해", "시사한다"] }).find((p) => p.id === "avoid");
  assert.match(avoid.detail, /이를 통해/);
  assert.doesNotMatch(avoid.detail, /시사한다/);
});
