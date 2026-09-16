import { useState, useEffect, useCallback } from "react";
import { cn } from "cn";
import {
  FileText,
  Save,
  RotateCcw,
  Loader2,
  ChevronRight,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { getConfigFiles, getConfig, saveConfig } from "../../lib/tauri";
import { toast } from "../ui/toast";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { ScrollArea } from "../ui/scroll-area";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type {
  ConfigFile,
  ConfigFileSummary,
  ConfigEntry,
  ConfigSection,
} from "../../lib/types";

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
    []
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
        <Switch
          checked={isTrue}
          onCheckedChange={(checked) =>
            handleEntryChange(section.name, entry.key, checked ? "true" : "false")
          }
          aria-label={entry.key}
        />
      );
    }

    // Dropdown for acceptable values
    if (acceptableValues && acceptableValues.length > 0) {
      return (
        <Select
          items={acceptableValues.map((av) => ({ label: av, value: av }))}
          value={value}
          onValueChange={(next) =>
            handleEntryChange(section.name, entry.key, String(next))
          }
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
            aria-label={entry.key}
            className="w-28"
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
        onChange={(e) =>
          handleEntryChange(section.name, entry.key, e.target.value)
        }
        aria-label={entry.key}
        className="w-60"
      />
    );
  };

  return (
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
                No config files found. Install some mods first.
              </p>
            </div>
          ) : (
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
          )}
        </ScrollArea>
      </Card>

      {/* Editor */}
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
              {configError}
            </p>
          </div>
        ) : !selectedFile ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Settings className="mb-3 size-10 text-muted-foreground" />
            <h3 className="mb-1 text-base font-semibold text-foreground">
              Select a config file
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose a config file from the left to edit its settings.
            </p>
          </div>
        ) : (
          <>
            {/* Editor header */}
            <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
              <div className="min-w-0">
                <CardTitle className="truncate text-sm">
                  {selectedFile.filename.replace(/\.cfg$/i, "")}
                </CardTitle>
                <CardDescription className="truncate">
                  {selectedFile.filename}
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={!hasChanges}
                >
                  <RotateCcw />
                  Reset
                </Button>
                <Button
                  variant="accent-primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {/* Config entries */}
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
                            <div className="shrink-0">
                              {renderInput(section, entry)}
                            </div>
                          </div>
                        ))}
                      </div>
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
