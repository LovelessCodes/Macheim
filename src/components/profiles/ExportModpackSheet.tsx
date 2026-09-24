import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileArchive, Image, Loader2, X } from "lucide-react";
import { useState } from "react";

import { useExportModpack } from "../../hooks/use-profiles";
import { MAX_MODPACK_DESCRIPTION, validateModpackMetadata } from "../../lib/modpack";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Textarea } from "../ui/textarea";

interface ExportModpackSheetProps {
  profileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Form for exporting a profile as a Thunderstore modpack: metadata, an
 * optional icon, then the native save dialog.
 */
export default function ExportModpackSheet({
  profileName,
  open,
  onOpenChange,
}: ExportModpackSheetProps) {
  const exportModpack = useExportModpack();
  const [name, setName] = useState(profileName);
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [iconPath, setIconPath] = useState<string | null>(null);

  const metadata = {
    name,
    version,
    description,
    website_url: website,
  };
  const validationError = validateModpackMetadata(metadata);
  const descriptionLength = description.trim().length;

  const handlePickIcon = async () => {
    const chosen = await openDialog({
      multiple: false,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (typeof chosen === "string") setIconPath(chosen);
  };

  const handleExport = () => {
    if (validationError) return;
    exportModpack.mutate(
      { profileName, metadata, iconPath },
      { onSuccess: (outcome) => outcome && onOpenChange(false) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Export as modpack</SheetTitle>
          <SheetDescription>
            Writes a Thunderstore modpack zip that Gale, r2modman and Thunderstore Mod Manager can
            import. Mods keep the versions installed in “{profileName}”.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto p-4">
          <div className="grid gap-1.5">
            <label htmlFor="modpack-name" className="text-xs font-medium">
              Name
            </label>
            <Input
              id="modpack-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="MyModpack"
            />
            <p className="text-muted-foreground text-xs">Letters, numbers and underscores only.</p>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="modpack-version" className="text-xs font-medium">
              Version
            </label>
            <Input
              id="modpack-version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="1.0.0"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="modpack-description" className="text-xs font-medium">
              Description
            </label>
            <Textarea
              id="modpack-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this modpack about?"
              rows={3}
            />
            <p className="text-muted-foreground text-xs">
              {descriptionLength} / {MAX_MODPACK_DESCRIPTION}
            </p>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="modpack-website" className="text-xs font-medium">
              Website (optional)
            </label>
            <Input
              id="modpack-website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium">Icon</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handlePickIcon()}>
                <Image />
                {iconPath ? "Change icon…" : "Choose icon…"}
              </Button>
              {iconPath && (
                <Button variant="ghost" size="sm" onClick={() => setIconPath(null)}>
                  <X />
                  Clear
                </Button>
              )}
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {iconPath ?? "Uses the Macheim icon when none is chosen. A 256×256 PNG is ideal."}
            </p>
          </div>

          {validationError && <p className="text-destructive text-xs">{validationError}</p>}
        </div>

        <SheetFooter className="border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="accent-primary"
            onClick={handleExport}
            disabled={validationError !== null || exportModpack.isPending}
          >
            {exportModpack.isPending ? <Loader2 className="animate-spin" /> : <FileArchive />}
            {exportModpack.isPending ? "Exporting..." : "Export modpack"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
