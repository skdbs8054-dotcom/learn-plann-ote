// Shared by the server and the browser: rebuild a document from rewrite sentence entries,
// keeping the original's paragraph separator.
export function assembleRevised(sentences, originalText) {
  const sep = /\n\s*\n/.test(originalText) ? "\n\n" : "\n";
  const paragraphs = [];
  for (const s of sentences) {
    if (!s.revised.trim()) continue;
    const i = Math.max(0, s.paragraph | 0);
    (paragraphs[i] ??= []).push(s.revised.trim());
  }
  return paragraphs.filter(Boolean).map((p) => p.join(" ")).join(sep);
}
