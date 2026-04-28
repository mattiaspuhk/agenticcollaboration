export function chunkLines(content: string, windowLines = 80, overlap = 10) {
  const lines = content.split("\n");
  const chunks: { lineStart: number; lineEnd: number; content: string }[] = [];
  if (lines.length === 0) return chunks;

  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + windowLines, lines.length);
    const slice = lines.slice(start, end).join("\n");
    if (slice.trim().length > 0) {
      chunks.push({ lineStart: start + 1, lineEnd: end, content: slice });
    }
    if (end >= lines.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function chunkMarkdown(content: string) {
  const lines = content.split("\n");
  const chunks: { section: string; content: string }[] = [];
  let current: { section: string; lines: string[] } = {
    section: "(intro)",
    lines: [],
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,2})\s+(.+)/);
    if (m) {
      if (current.lines.length > 0) {
        chunks.push({
          section: current.section,
          content: current.lines.join("\n").trim(),
        });
      }
      current = { section: m[2].trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    chunks.push({
      section: current.section,
      content: current.lines.join("\n").trim(),
    });
  }
  return chunks.filter((c) => c.content.length > 30);
}
