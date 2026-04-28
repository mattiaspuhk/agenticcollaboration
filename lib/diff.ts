/**
 * Minimal unified diff generator. No external deps.
 *
 * Output format mirrors `git diff --unified=3` headers loosely:
 *   --- a/<path>
 *   +++ b/<path>
 *   @@ -oldStart,oldLen +newStart,newLen @@
 *    context
 *   -removed
 *   +added
 */

export type DiffStats = { added: number; removed: number };

export type DiffResult = {
  patch: string;
  stats: DiffStats;
};

const CONTEXT = 3;

export function unifiedDiff(
  oldStr: string | null,
  newStr: string | null,
  filePath: string,
): DiffResult {
  if (oldStr === null && newStr === null) {
    return { patch: "", stats: { added: 0, removed: 0 } };
  }
  if (oldStr === null) {
    return renderAdd(newStr ?? "", filePath);
  }
  if (newStr === null) {
    return renderDelete(oldStr, filePath);
  }
  if (oldStr === newStr) {
    return { patch: "", stats: { added: 0, removed: 0 } };
  }

  const a = splitLines(oldStr);
  const b = splitLines(newStr);
  const ops = diffLines(a, b);
  const hunks = collectHunks(ops, CONTEXT);

  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === "add") added++;
    else if (op.kind === "del") removed++;
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
  const body = hunks
    .map((h) => {
      const headerLine = `@@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@\n`;
      return headerLine + h.lines.join("");
    })
    .join("");

  return { patch: header + body, stats: { added, removed } };
}

function renderAdd(content: string, filePath: string): DiffResult {
  const lines = splitLines(content);
  const body = lines.map((l) => `+${l}`).join("");
  const headerLine = `@@ -0,0 +1,${lines.length} @@\n`;
  return {
    patch: `--- /dev/null\n+++ b/${filePath}\n${headerLine}${body}`,
    stats: { added: lines.length, removed: 0 },
  };
}

function renderDelete(content: string, filePath: string): DiffResult {
  const lines = splitLines(content);
  const body = lines.map((l) => `-${l}`).join("");
  const headerLine = `@@ -1,${lines.length} +0,0 @@\n`;
  return {
    patch: `--- a/${filePath}\n+++ /dev/null\n${headerLine}${body}`,
    stats: { added: 0, removed: lines.length },
  };
}

/**
 * Splits text into "lines" preserving the trailing newline on each line.
 * If the file does not end with a newline, the last entry has no trailing \n.
 */
function splitLines(s: string): string[] {
  if (s === "") return [];
  const parts = s.split(/\n/);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1) {
      lines.push(parts[i] + "\n");
    } else if (parts[i].length > 0) {
      lines.push(parts[i]);
    }
  }
  return lines;
}

type Op =
  | { kind: "eq"; line: string }
  | { kind: "add"; line: string }
  | { kind: "del"; line: string };

/**
 * Classic LCS-based diff. O(n*m) — fine for small/medium files; the agent is
 * expected to make focused edits.
 */
function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "eq", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "del", line: a[i] });
      i++;
    } else {
      ops.push({ kind: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "del", line: a[i++] });
  while (j < m) ops.push({ kind: "add", line: b[j++] });
  return ops;
}

type Hunk = {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: string[];
};

function collectHunks(ops: Op[], context: number): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  let oldLine = 1;
  let newLine = 1;

  while (i < ops.length) {
    if (ops[i].kind === "eq") {
      oldLine++;
      newLine++;
      i++;
      continue;
    }
    // Found a change — extend hunk forward.
    const hunkStartIdx = Math.max(0, i - context);
    // Walk back from current position through prior context within bounds.
    let backTaken = 0;
    for (let k = i - 1; k >= hunkStartIdx && ops[k].kind === "eq"; k--) {
      backTaken++;
    }
    let hOldStart = oldLine - backTaken;
    let hNewStart = newLine - backTaken;
    if (hOldStart < 1) hOldStart = 1;
    if (hNewStart < 1) hNewStart = 1;

    const lines: string[] = [];
    // Push back-context lines.
    for (let k = i - backTaken; k < i; k++) {
      lines.push(` ${ops[k].line}`);
    }

    let hOldLen = backTaken;
    let hNewLen = backTaken;

    // Walk forward consuming change lines + interleaved context.
    while (i < ops.length) {
      const op = ops[i];
      if (op.kind === "del") {
        lines.push(`-${op.line}`);
        oldLine++;
        hOldLen++;
        i++;
      } else if (op.kind === "add") {
        lines.push(`+${op.line}`);
        newLine++;
        hNewLen++;
        i++;
      } else {
        // eq — peek ahead to see if there are more changes within 2*context lines.
        let lookahead = 0;
        let foundChange = false;
        let k = i;
        while (k < ops.length && ops[k].kind === "eq" && lookahead < 2 * context) {
          k++;
          lookahead++;
        }
        if (k < ops.length && ops[k].kind !== "eq") foundChange = true;

        if (foundChange) {
          // Include all eq lines between as context within the same hunk.
          while (i < ops.length && ops[i].kind === "eq") {
            lines.push(` ${ops[i].line}`);
            oldLine++;
            newLine++;
            hOldLen++;
            hNewLen++;
            i++;
          }
        } else {
          // Add up to `context` trailing context lines and close hunk.
          let trailing = 0;
          while (
            i < ops.length &&
            ops[i].kind === "eq" &&
            trailing < context
          ) {
            lines.push(` ${ops[i].line}`);
            oldLine++;
            newLine++;
            hOldLen++;
            hNewLen++;
            trailing++;
            i++;
          }
          break;
        }
      }
    }

    // Ensure trailing newline on every line entry (split may have left last without).
    const normalized = lines.map((l) =>
      l.endsWith("\n") ? l : l + "\n\\ No newline at end of file\n",
    );

    hunks.push({
      oldStart: hOldStart,
      oldLen: hOldLen,
      newStart: hNewStart,
      newLen: hNewLen,
      lines: normalized,
    });
  }

  return hunks;
}
