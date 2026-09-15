import { useState, useEffect, useCallback } from "react";
import { FileText, Save, RotateCcw, Loader2, Settings, AlertTriangle } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { getConfigFiles, getConfig, saveConfig } from "../../lib/tauri";
import type { ConfigFile, ConfigFileSummary, ConfigEntry } from "../../lib/types";
import ConfigFileList from "./ConfigFileList";
import ConfigEntryRow from "./ConfigEntryRow";

export default function ConfigEditor() {
  const addToast = useAppStore((s) => s.addToast);

  const [configFiles, setConfigFiles] = useState<ConfigFileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<ConfigFile | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editedEntries, setEditedEntries] = useState<Map<string, string>>(
    new Map()
  );

  // Load config file list
  useEffect(() => {
    async function load() {
      setIsLoadingFiles(true);
      try {
        const files = await getConfigFiles();
        setConfigFiles(files);
      } catch {
        // Backend may not support this yet
        setConfigFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    }
    load();
  }, []);

  const handleSelectFile = useCallback(
    async (file: ConfigFileSummary) => {
      setIsLoadingConfig(true);
      setSelectedFile(null);
      setConfigError(null);
      setEditedEntries(new Map());
      try {
        const detail = await getConfig(file.path);
        setSelectedFile(detail);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setConfigError(message);
        addToast({
          type: "error",
          message: `Failed to load config: ${message}`,
        });
      } finally {
        setIsLoadingConfig(false);
      }
    },
    [addToast]
  );

  const handleEntryChange = (
    sectionName: string,
    key: string,
    value: string
  ) => {
    const entryKey = `${sectionName}::${key}`;
    setEditedEntries((prev) => {
      const next = new Map(prev);
      next.set(entryKey, value);
      return next;
    });
  };

  const getEntryValue = (sectionName: string, entry: ConfigEntry): string => {
    const key = `${sectionName}::${entry.key}`;
    return editedEntries.get(key) ?? entry.value;
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    try {
      const updatedConfig: ConfigFile = {
        ...selectedFile,
        sections: selectedFile.sections.map((section) => ({
          ...section,
          entries: section.entries.map((entry) => {
            const key = `${section.name}::${entry.key}`;
            const newVal = editedEntries.get(key);
            return {
              ...entry,
              value: newVal ?? entry.value,
            };
          }),
        })),
      };

      await saveConfig(updatedConfig);
      setSelectedFile(updatedConfig);
      setEditedEntries(new Map());
      addToast({ type: "success", message: "Config saved." });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to save config: ${err}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEditedEntries(new Map());
  };

  const hasChanges = editedEntries.size > 0;

  const renderEditor = () => {
    if (isLoadingConfig) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            size={24}
            className="animate-spin text-[var(--color-text-muted)]"
          />
        </div>
      );
    }
    if (configError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <AlertTriangle
            size={40}
            className="text-[var(--color-accent-amber)] mb-3"
          />
          <h3 className="text-base font-semibold text-[var(--color-text-secondary)] mb-1">
            Could not load config file
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] max-w-md break-words">
            {configError}
          </p>
        </div>
      );
    }
    if (!selectedFile) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Settings
            size={40}
            className="text-[var(--color-text-muted)] mb-3"
          />
          <h3 className="text-base font-semibold text-[var(--color-text-secondary)] mb-1">
            Select a config file
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose a config file from the left to edit its settings.
          </p>
        </div>
      );
    }
    return (
      <>
        {/* Editor header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-subtle)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {selectedFile.filename.replace(/\.cfg$/i, "")}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {selectedFile.filename}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                border border-[var(--color-border-default)] text-[var(--color-text-secondary)]
                hover:bg-[var(--color-bg-elevated)] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                bg-[var(--color-accent-primary)] text-white
                hover:bg-[var(--color-accent-primary-hover)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSaving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Save
            </button>
          </div>
        </div>

        {/* Config entries */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {selectedFile.sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText
                size={28}
                className="text-[var(--color-text-muted)] mb-2"
              />
              <p className="text-sm text-[var(--color-text-muted)]">
                No editable settings found in this file.
              </p>
            </div>
          ) : (
            selectedFile.sections.map((section) => (
              <div key={section.name}>
                <h4 className="text-xs font-bold text-[var(--color-accent-amber)] uppercase tracking-wider mb-3 pb-2 border-b border-[var(--color-border-subtle)]">
                  {section.name}
                </h4>
                <div className="space-y-4">
                  {section.entries.map((entry) => (
                    <ConfigEntryRow
                      key={`${section.name}-${entry.key}`}
                      entry={entry}
                      value={getEntryValue(section.name, entry)}
                      onChange={(value) =>
                        handleEntryChange(section.name, entry.key, value)
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)]">
      <ConfigFileList
        configFiles={configFiles}
        selectedFile={selectedFile}
        isLoading={isLoadingFiles}
        onSelect={handleSelectFile}
      />

      <div className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] overflow-hidden flex flex-col">
        {renderEditor()}
      </div>
    </div>
  );
}
