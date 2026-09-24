/** Levels BepInEx writes in its log prefixes. */
export type LogLevel = "info" | "warning" | "error" | "debug" | "message" | "fatal" | "unknown";

/** Levels the viewer can filter to. Error covers fatal; info covers message. */
export type LogLevelFilter = "all" | "info" | "warning" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  text: string;
  /**
   * True when the line had no level prefix and continues the previous entry —
   * stack traces and wrapped output. Continuations inherit the level before
   * them so an error filter keeps its stack.
   */
  continuation: boolean;
}

export interface LogSegment {
  text: string;
  match: boolean;
}

const LEVEL_RE = /^\[(Info|Warning|Error|Debug|Message|Fatal)\s*:/i;

/** Parse raw log text into entries, inheriting levels for continuation lines. */
export function parseLog(raw: string): LogEntry[] {
  const lines = raw.split("\n");
  // A trailing newline yields one empty element; it is not a real line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const entries: LogEntry[] = [];
  for (const line of lines) {
    const match = LEVEL_RE.exec(line);
    if (match) {
      entries.push({
        level: match[1].toLowerCase() as LogLevel,
        text: line,
        continuation: false,
      });
    } else {
      const previous = entries[entries.length - 1];
      entries.push({ level: previous?.level ?? "unknown", text: line, continuation: true });
    }
  }
  return entries;
}

function matchesLevel(level: LogLevel, filter: LogLevelFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "error":
      return level === "error" || level === "fatal";
    case "info":
      return level === "info" || level === "message";
    default:
      return level === filter;
  }
}

/** Level filter first, then case-insensitive search over the visible lines. */
export function filterLog(entries: LogEntry[], level: LogLevelFilter, query: string): LogEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (!matchesLevel(entry.level, level)) return false;
    if (needle && !entry.text.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** Split a line into plain and matching segments for highlighting. */
export function highlightSegments(text: string, query: string): LogSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const segments: LogSegment[] = [];
  let index = 0;

  for (;;) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    if (found > index) segments.push({ text: text.slice(index, found), match: false });
    segments.push({ text: text.slice(found, found + needle.length), match: true });
    index = found + needle.length;
  }

  if (index < text.length) segments.push({ text: text.slice(index), match: false });
  return segments;
}
