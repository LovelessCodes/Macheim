import {
  FileText,
  Save,
  RotateCcw,
  Loader2,
  ChevronRight,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { getConfigFiles, getConfig, saveConfig } from "../../lib/tauri";
import type { ConfigFile, ConfigFileSummary, ConfigEntry, ConfigSection } from "../../lib/types";
import { useAppStore } from "../../store/appStore";

export default function ConfigEditor() {
  const [configFiles, setConfigFiles] = useState<ConfigFileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<ConfigFile | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editedEntries, setEditedEntries] = useState<Map<string, string>>(new Map());

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
        toast.add({
          type: "error",
          title: `Failed to load config: ${message}`,
        });
      } finally {
        setIsLoadingConfig(false);
      }
    },
    [addToast],
  );

  const handleEntryChange = (sectionName: string, key: string, value: string) => {
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
      toast.add({ type: "success", title: "Config saved." });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to save config: ${err}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEditedEntries(new Map());
  };

  const hasChanges = editedEntries.size > 0;

  const renderInput = (section: ConfigSection, entry: ConfigEntry) => {
    const value = getEntryValue(section.name, entry);
    const settingType = entry.setting_type?.toLowerCase() ?? "";
    const acceptableValues = entry.acceptable_values
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const rangeMatch = entry.acceptable_value_range?.match(/^from\s+(.+?)\s+to\s+(.+)$/i);
    const acceptableRange = rangeMatch
      ? ([rangeMatch[1].trim(), rangeMatch[2].trim()] as const)
      : null;

    // Boolean toggle
    if (settingType === "boolean" || settingType === "bool") {
      const isTrue = value.toLowerCase() === "true";
      return (
        <button
          onClick={() => handleEntryChange(section.name, entry.key, isTrue ? "false" : "true")}
          className={`relative h-5.5 w-10 shrink-0 cursor-pointer rounded-full transition-colors ${isTrue ? "bg-[var(--color-accent-primary)]" : "bg-[var(--color-border-default)]"} `}
        >
          <div
            className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${isTrue ? "translate-x-5" : "translate-x-0.5"} `}
          />
        </button>
      );
    }

    // Dropdown for acceptable values
    if (acceptableValues && acceptableValues.length > 0) {
      return (
        <Select
          items={acceptableValues.map((av) => ({ label: av, value: av }))}
          value={value}
          onChange={(e) => handleEntryChange(section.name, entry.key, e.target.value)}
          className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none"
        >
          <SelectTrigger className="w-40" aria-label={entry.key}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {acceptableValues.map((av) => (
              <SelectItem key={av} value={av}>
                {av}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Number input for int/float with range
    if (
      settingType.includes("int") ||
      settingType.includes("float") ||
      settingType.includes("single") ||
      settingType.includes("double")
    ) {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={value}
            onChange={(e) => handleEntryChange(section.name, entry.key, e.target.value)}
            min={acceptableRange?.[0]}
            max={acceptableRange?.[1]}
            className="w-28 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none"
          />
          {acceptableRange && (
            <span className="text-xs text-muted-foreground">
              [{acceptableRange[0]} - {acceptableRange[1]}]
            </span>
          )}
        </div>
      );
    }

    // Default: text input
    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => handleEntryChange(section.name, entry.key, e.target.value)}
        className="w-60 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none"
      />
    );
  };

  return (
<<<<<<< HEAD
    <div className="flex h-[calc(100vh-8rem)] gap-5">
      {/* File list */}
      <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)]">
        <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Config Files</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" />
            </div>
          ) : configFiles.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FileText size={28} className="mx-auto mb-2 text-[var(--color-text-muted)]" />
              <p className="text-xs text-[var(--color-text-muted)]">
=======
    <div className="flex h-full min-h-0 gap-5">
      {/* File list */}
      <Card className="w-64 shrink-0 gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Config Files</CardTitle>
        </CardHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : configFiles.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FileText className="mx-auto mb-2 size-7 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
>>>>>>> main
                No config files found. Install some mods first.
              </p>
            </div>
          ) : (
<<<<<<< HEAD
            configFiles.map((file) => (
              <button
                key={file.filename}
                onClick={() => handleSelectFile(file)}
                className={`flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                  selectedFile?.filename === file.filename
                    ? "border-r-2 border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
                } `}
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{file.filename}</span>
                <ChevronRight size={12} className="ml-auto shrink-0 opacity-40" />
              </button>
            ))
=======
            configFiles.map((file) => {
              const isActive = selectedFile?.filename === file.filename;
              return (
                <button
                  key={file.filename}
                  onClick={() => handleSelectFile(file)}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "border-r-2 border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{file.filename}</span>
                  <ChevronRight className="ml-auto size-3 shrink-0 opacity-40" />
                </button>
              );
            })
>>>>>>> main
          )}
        </ScrollArea>
      </Card>

      {/* Editor */}
<<<<<<< HEAD
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)]">
        {isLoadingConfig ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : configError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <AlertTriangle size={40} className="mb-3 text-[var(--color-accent-amber)]" />
            <h3 className="mb-1 text-base font-semibold text-[var(--color-text-secondary)]">
              Could not load config file
            </h3>
            <p className="max-w-md text-sm break-words text-[var(--color-text-muted)]">
=======
      <Card className="min-w-0 flex-1 gap-0 overflow-hidden py-0">
        {isLoadingConfig ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : configError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <AlertTriangle className="mb-3 size-10 text-[var(--color-accent-amber)]" />
            <h3 className="mb-1 text-base font-semibold text-foreground">
              Could not load config file
            </h3>
            <p className="max-w-md break-words text-sm text-muted-foreground">
>>>>>>> main
              {configError}
            </p>
          </div>
        ) : !selectedFile ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
<<<<<<< HEAD
            <Settings size={40} className="mb-3 text-[var(--color-text-muted)]" />
            <h3 className="mb-1 text-base font-semibold text-[var(--color-text-secondary)]">
=======
            <Settings className="mb-3 size-10 text-muted-foreground" />
            <h3 className="mb-1 text-base font-semibold text-foreground">
>>>>>>> main
              Select a config file
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose a config file from the left to edit its settings.
            </p>
          </div>
        ) : (
          <>
            {/* Editor header */}
<<<<<<< HEAD
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {selectedFile.filename.replace(/\.cfg$/i, "")}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">{selectedFile.filename}</p>
=======
            <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
              <div className="min-w-0">
                <CardTitle className="truncate text-sm">
                  {selectedFile.filename.replace(/\.cfg$/i, "")}
                </CardTitle>
                <CardDescription className="truncate">
                  {selectedFile.filename}
                </CardDescription>
>>>>>>> main
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={!hasChanges}
<<<<<<< HEAD
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] disabled:opacity-40"
=======
>>>>>>> main
                >
                  <RotateCcw />
                  Reset
                </Button>
                <Button
                  variant="accent-primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
<<<<<<< HEAD
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-primary-hover)] disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
=======
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
>>>>>>> main
                  Save
                </Button>
              </div>
            </div>

            {/* Config entries */}
<<<<<<< HEAD
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
              {selectedFile.sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText size={28} className="mb-2 text-[var(--color-text-muted)]" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No editable settings found in this file.
                  </p>
                </div>
              ) : (
                selectedFile.sections.map((section) => (
                  <div key={section.name}>
                    <h4 className="mb-3 border-b border-[var(--color-border-subtle)] pb-2 text-xs font-bold tracking-wider text-[var(--color-accent-amber)] uppercase">
                      {section.name}
                    </h4>
                    <div className="space-y-4">
                      {section.entries.map((entry) => (
                        <div
                          key={`${section.name}-${entry.key}`}
                          className="flex items-start justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                {entry.key}
                              </span>
                              {entry.default_value && (
                                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                  default: {entry.default_value}
=======
            <ScrollArea scrollFade className="min-h-0 flex-1">
              <div className="space-y-6 px-5 py-4">
                {selectedFile.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="mb-2 size-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No editable settings found in this file.
                    </p>
                  </div>
                ) : (
                  selectedFile.sections.map((section) => (
                    <div key={section.name}>
                      <h4 className="mb-3 border-b pb-2 text-xs font-bold tracking-wider text-[var(--color-accent-amber)] uppercase">
                        {section.name}
                      </h4>
                      <div className="space-y-4">
                        {section.entries.map((entry) => (
                          <div
                            key={`${section.name}-${entry.key}`}
                            className="flex items-start justify-between gap-4"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {entry.key}
>>>>>>> main
                                </span>
                                {entry.default_value && (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px]"
                                  >
                                    default: {entry.default_value}
                                  </Badge>
                                )}
                              </div>
                              {entry.description && (
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                  {entry.description}
                                </p>
                              )}
                            </div>
<<<<<<< HEAD
                            {entry.description && (
                              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                                {entry.description}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">{renderInput(section, entry)}</div>
                        </div>
                      ))}
=======
                            <div className="shrink-0">
                              {renderInput(section, entry)}
                            </div>
                          </div>
                        ))}
                      </div>
>>>>>>> main
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </Card>
    </div>
  );
}
