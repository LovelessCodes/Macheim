import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileArchive } from "lucide-react";
import { useEffect, useState } from "react";

import { useInstallFromFile } from "../../hooks/use-install-from-file";
import { isZipPath } from "../../lib/downloads";

/**
 * Window-wide drop target for mod archives. Tauri delivers native file drops
 * as webview events; HTML drag events never fire while it is enabled.
 */
export default function InstallDropZone() {
  const { installPaths } = useInstallFromFile();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const webview = getCurrentWebview();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void webview
      .onDragDropEvent((event) => {
        const payload = event.payload;
        switch (payload.type) {
          case "enter":
          case "over":
            setDragging(true);
            break;
          case "leave":
            setDragging(false);
            break;
          case "drop": {
            setDragging(false);
            const paths = payload.paths.filter(isZipPath);
            if (paths.length > 0) void installPaths(paths);
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

  return (
    <div className="bg-background/60 pointer-events-none fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div className="border-accent-primary/60 bg-card flex flex-col items-center gap-2 border-2 border-dashed px-12 py-9">
        <FileArchive className="text-accent-primary size-9" />
        <p className="text-foreground text-sm font-medium">Drop mod archives to install</p>
        <p className="text-muted-foreground text-xs">
          Thunderstore packages or raw plugin .zip files
        </p>
      </div>
    </div>
  );
}
