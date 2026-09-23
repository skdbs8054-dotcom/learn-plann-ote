// Word-level diff (whitespace-preserving) with paragraph pre-alignment
// so long documents stay fast.

const MAX_CELLS = 2_000_000;

function tokenize(text) {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function lcsOps(a, b) {
  const n = a.length, m = b.length;
  if (!n) return b.length ? [{ type: "insert", tokens: b }] : [];
  if (!m) return [{ type: "delete", tokens: a }];
  if (n * m > MAX_CELLS) return [{ type: "delete", tokens: a }, { type: "insert", tokens: b }];

  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const ops = [];
  const push = (type, t) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.tokens.push(t);
    else ops.push({ type, tokens: [t] });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("equal", a[i]); i++; j++; }
    else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) push("delete", a[i++]);
    else push("insert", b[j++]);
  }
  while (i < n) push("delete", a[i++]);
  while (j < m) push("insert", b[j++]);
  return ops;
}

// Whitespace differences alone are not worth highlighting.
function normalize(ops) {
  const out = [];
  for (const op of ops) {
    const text = op.tokens.join("");
    if (op.type !== "equal" && !text.trim()) {
      if (op.type === "insert") out.push({ type: "equal", text });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += text;
    else out.push({ type: op.type, text });
  }
  return out;
}

export function diffWords(before, after) {
  return normalize(lcsOps(tokenize(before), tokenize(after)));
}

// Align paragraphs first (exact matches), then word-diff the changed stretches.
export function diffText(before, after) {
  const pa = before.split(/(\n+)/);
  const pb = after.split(/(\n+)/);
  const coarse = lcsOps(pa, pb);
  const out = [];
  for (let k = 0; k < coarse.length; k++) {
    const op = coarse[k];
    if (op.type === "equal") { out.push({ type: "equal", text: op.tokens.join("") }); continue; }
    // Pair a delete run with the insert run that follows it.
    let del = "", ins = "";
    if (op.type === "delete") {
      del = op.tokens.join("");
      if (coarse[k + 1]?.type === "insert") ins = coarse[++k].tokens.join("");
    } else {
      ins = op.tokens.join("");
    }
    out.push(...diffWords(del, ins));
  }
  return mergeAdjacent(out);
}

function mergeAdjacent(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

// Group ops into segments for rendering one side of a side-by-side view.
// A delete adjacent to an insert is a "change"; alone they are "delete" / "insert".
export function sideSegments(ops, side) {
  const segs = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "equal") { segs.push({ kind: "equal", text: op.text }); continue; }
    const next = ops[i + 1];
    const pair = next && next.type !== "equal" && next.type !== op.type;
    const del = op.type === "delete" ? op.text : pair ? next.text : "";
    const ins = op.type === "insert" ? op.text : pair ? next.text : "";
    if (pair) i++;
    const kind = del && ins ? "change" : del ? "delete" : "insert";
    const text = side === "before" ? del : ins;
    if (text) segs.push({ kind, text });
  }
  return segs;
}

export function diffSummary(ops) {
  let inserted = 0, deleted = 0;
  for (const op of ops) {
    if (op.type === "insert") inserted += op.text.replace(/\s/g, "").length;
    if (op.type === "delete") deleted += op.text.replace(/\s/g, "").length;
  }
  return { inserted, deleted };
}
