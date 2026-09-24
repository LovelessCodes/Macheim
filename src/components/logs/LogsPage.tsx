import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Activity,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useGameStatus } from "../../hooks/use-game-status";
import { useLatestLog, useLogFollower } from "../../hooks/use-logs";
import {
  filterLog,
  highlightSegments,
  parseLog,
  type LogEntry,
  type LogLevel,
  type LogLevelFilter,
} from "../../lib/log";
import { type LogSnapshot } from "../../lib/log-follow";
import { openLogFolder } from "../../lib/tauri";
import VirtualList from "../common/VirtualList";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { notify } from "../ui/toast";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const LEVEL_FILTERS: { value: LogLevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "debug", label: "Debug" },
];

function levelLabel(level: LogLevel): string | null {
  switch (level) {
    case "info":
      return "INFO";
    case "message":
      return "MSG";
    case "warning":
      return "WARN";
    case "error":
      return "ERROR";
    case "fatal":
      return "FATAL";
    case "debug":
      return "DEBUG";
    default:
      return null;
  }
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
    case "fatal":
      return "text-destructive border-destructive/40";
    case "warning":
      return "text-[var(--color-warning)] border-[var(--color-warning)]/40";
    default:
      return "text-muted-foreground";
  }
}

function LogRow({ entry, query }: { entry: LogEntry; query: string }) {
  const label = levelLabel(entry.level);
  const segments = highlightSegments(entry.text, query);

  return (
    <div className="group hover:bg-muted/40 flex items-start gap-3 rounded-md px-2 py-1">
      <span className="w-14 shrink-0 pt-0.5">
        {!entry.continuation && label && (
          <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${levelClass(entry.level)}`}>
            {label}
          </Badge>
        )}
      </span>
      <span
        className={`min-w-0 flex-1 font-mono text-xs break-all whitespace-pre-wrap ${levelClass(entry.level)}`}
      >
        {segments.map((segment, index) =>
          segment.match ? (
            <mark key={index} className="rounded-sm bg-[var(--color-accent-amber)]/30 text-inherit">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Copy line"
        title="Copy line"
        onClick={() => {
          void writeText(entry.text).catch(() => {});
        }}
      >
        <Copy />
      </Button>
    </div>
  );
}

export default function LogsPage() {
  const { data: log, isPending, isFetching, error, refetch } = useLatestLog();
  const { data: gameStatus } = useGameStatus();
  const [level, setLevel] = useState<LogLevelFilter>("all");
  const [query, setQuery] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [following, setFollowing] = useState(false);
  const [stuck, setStuck] = useState(true);

  const seed = useMemo<LogSnapshot | null>(
    () =>
      log ? { text: log.text, path: log.path, offset: log.offset, truncated: log.truncated } : null,
    [log],
  );
  const snapshot = useLogFollower(seed, following);
  const view = snapshot ?? seed;

  const entries = useMemo(() => parseLog(view?.text ?? ""), [view?.text]);
  const filtered = useMemo(() => filterLog(entries, level, query), [entries, level, query]);

  const handleCopyFiltered = async () => {
    try {
      await writeText(filtered.map((entry) => entry.text).join("\n"));
      notify("log-copy", {
        type: "success",
        title: `Copied ${filtered.length} line${filtered.length === 1 ? "" : "s"}`,
      });
    } catch (err) {
      notify("log-copy", {
        type: "error",
        title: `Could not copy the log: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleOpenFolder = async () => {
    setIsOpening(true);
    try {
      await openLogFolder();
    } catch (err) {
      notify("log-open-folder", {
        type: "error",
        title: `Could not open the log folder: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsOpening(false);
    }
  };

  const renderEmpty = () => {
    if (gameStatus && !gameStatus.installed) {
      return (
        <p className="text-muted-foreground text-sm">
          Valheim was not found. Finish setup and install BepInEx, then launch the game once to
          create a log.
        </p>
      );
    }
    return (
      <p className="text-muted-foreground text-sm">
        No log yet. Install BepInEx and launch the game once; the log appears here afterwards.
      </p>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4" />
            Valheim Log
          </CardTitle>
          <CardDescription className="truncate">
            {view?.path ?? "The latest BepInEx log, or Unity's Player.log when BepInEx is absent."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search lines..."
              aria-label="Search log lines"
              className="max-w-xs"
            />
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[level]}
              onValueChange={(value) => {
                if (value[0]) setLevel(value[0] as LogLevelFilter);
              }}
              aria-label="Filter log by level"
            >
              {LEVEL_FILTERS.map((filter) => (
                <ToggleGroupItem key={filter.value} value={filter.value}>
                  {filter.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {filtered.length} of {entries.length} lines
                {query.trim() ? ` · ${filtered.length} matching` : ""}
              </span>
              <Button
                variant={following ? "amber" : "outline"}
                size="sm"
                onClick={() => {
                  setStuck(true);
                  setFollowing((value) => !value);
                }}
                title={
                  following
                    ? "Stop following new lines"
                    : "Follow the log as the game writes new lines"
                }
              >
                <Activity />
                {following ? "Following" : "Follow"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopyFiltered()}
                disabled={filtered.length === 0}
                title="Copy every visible line"
              >
                <Copy />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleOpenFolder()}
                disabled={isOpening}
                title="Reveal the BepInEx folder in Finder"
              >
                {isOpening ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                Open in Finder
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
                title="Reload the log from disk"
              >
                {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh
              </Button>
            </div>
          </div>

          {view?.truncated && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-xs">
              <TriangleAlert className="size-3.5 shrink-0 text-[var(--color-warning)]" />
              <span className="text-muted-foreground">
                This log is very large; only its most recent part is shown.
              </span>
            </div>
          )}

          {following && !stuck && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-accent-amber)]/30 bg-[var(--color-accent-amber)]/10 px-3 py-2 text-xs">
              <Activity className="size-3.5 shrink-0 text-[var(--color-accent-amber)]" />
              <span className="text-muted-foreground">
                Follow paused — you scrolled up. New lines are still collected.
              </span>
              <Button variant="outline" size="xs" onClick={() => setStuck(true)}>
                Resume follow
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Loading log...</p>
      ) : error ? (
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : (
        <VirtualList
          items={filtered}
          keyOf={(_entry, index) => `${index}`}
          estimateRowHeight={24}
          empty={renderEmpty()}
          stickToBottom={following && stuck}
          onStickChange={setStuck}
          renderItem={(entry) => <LogRow entry={entry} query={query} />}
        />
      )}
    </div>
  );
}
