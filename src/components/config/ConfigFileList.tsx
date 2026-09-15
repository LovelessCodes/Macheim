import { FileText, Loader2, ChevronRight } from "lucide-react";
import type { ConfigFile, ConfigFileSummary } from "../../lib/types";

interface ConfigFileListProps {
  configFiles: ConfigFileSummary[];
  selectedFile: ConfigFile | null;
  isLoading: boolean;
  onSelect: (file: ConfigFileSummary) => void;
}

export default function ConfigFileList({
  configFiles,
  selectedFile,
  isLoading,
  onSelect,
}: ConfigFileListProps) {
  return (
    <div className="w-64 shrink-0 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Config Files
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              size={20}
              className="animate-spin text-[var(--color-text-muted)]"
            />
          </div>
        ) : configFiles.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText
              size={28}
              className="mx-auto text-[var(--color-text-muted)] mb-2"
            />
            <p className="text-xs text-[var(--color-text-muted)]">
              No config files found. Install some mods first.
            </p>
          </div>
        ) : (
          configFiles.map((file) => (
            <button
              key={file.filename}
              onClick={() => onSelect(file)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer
                ${
                  selectedFile?.filename === file.filename
                    ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border-r-2 border-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
                }
              `}
            >
              <FileText size={14} className="shrink-0" />
              <span className="truncate">{file.filename}</span>
              <ChevronRight
                size={12}
                className="ml-auto shrink-0 opacity-40"
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
