import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileArchive } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useInstallFromFile } from "../../hooks/use-install-from-file";
import { useImportSharedProfile } from "../../hooks/use-profiles";
import { isProfilePath, isZipPath } from "../../lib/downloads";
import { toast } from "../ui/toast";

type DropHint = "mods" | "profile" | "unsupported";

const DROP_COPY: Record<DropHint, { title: string; subtitle: string }> = {
  mods: {
    title: "Drop mod archives to install",
    subtitle: "Thunderstore packages or raw plugin .zip files",
  },
  profile: {
    title: "Drop to import this profile",
    subtitle: ".r2z profile export — mods keep the versions they were exported with",
  },
  unsupported: {
    title: "Unsupported file",
    subtitle: "Only .zip mod archives and .r2z profiles can be dropped",
  },
};

/**
 * Window-wide drop target for mod archives and shared profile exports. Tauri
 * delivers native file drops as webview events; HTML drag events never fire
 * while it is enabled.
 */
export default function InstallDropZone() {
  const { installPaths } = useInstallFromFile();
  const { importShared } = useImportSharedProfile();
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<DropHint>("mods");

  // Keeps the drop listener subscription stable: re-registering mid-drag could
  // miss the drop event.
  const importSharedRef = useRef(importShared);
  useEffect(() => {
    importSharedRef.current = importShared;
  }, [importShared]);

  useEffect(() => {
    const webview = getCurrentWebview();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void webview
      .onDragDropEvent((event) => {
        const payload = event.payload;
        switch (payload.type) {
          case "enter": {
            const hasZip = payload.paths.some(isZipPath);
            const hasProfile = payload.paths.some(isProfilePath);
            setHint(hasProfile && !hasZip ? "profile" : hasZip ? "mods" : "unsupported");
            setDragging(true);
            break;
          }
          case "over":
            setDragging(true);
            break;
          case "leave":
            setDragging(false);
            break;
          case "drop": {
            setDragging(false);
            const zips = payload.paths.filter(isZipPath);
            const profiles = payload.paths.filter(isProfilePath);
            if (zips.length > 0) void installPaths(zips);
            if (profiles.length > 0) {
              void (async () => {
                for (const path of profiles) {
                  await importSharedRef.current({ kind: "file", value: path });
                }
              })();
            } else if (zips.length === 0 && payload.paths.length > 0) {
              toast.add({
                type: "warning",
                title: "Only .zip mod archives and .r2z profiles can be dropped",
              });
            }
            break;
          }
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [installPaths]);

  if (!dragging) return null;

  const copy = DROP_COPY[hint];

  return (
    <div className="bg-background/60 pointer-events-none fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div className="border-accent-primary/60 bg-card flex flex-col items-center gap-2 border-2 border-dashed px-12 py-9">
        <FileArchive className="text-accent-primary size-9" />
        <p className="text-foreground text-sm font-medium">{copy.title}</p>
        <p className="text-muted-foreground text-xs">{copy.subtitle}</p>
      </div>
    </div>
  );
}
