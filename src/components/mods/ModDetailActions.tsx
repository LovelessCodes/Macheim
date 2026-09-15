import { Download, CheckCircle, Loader2 } from "lucide-react";
import type { ThunderstorePackage } from "../../lib/types";

interface ModDetailActionsProps {
  pkg: ThunderstorePackage;
  isInstalled: boolean;
  isInstalling: boolean;
  installedVersion?: string;
  onInstall: () => void;
  onUninstall: () => void;
}

export default function ModDetailActions({
  pkg,
  isInstalled,
  isInstalling,
  installedVersion,
  onInstall,
  onUninstall,
}: ModDetailActionsProps) {
  return (
    <div className="px-5 py-4 border-t border-[var(--color-border-subtle)] flex gap-3">
      {isInstalled ? (
        <>
          <button
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-success)]/15 text-[var(--color-success)] flex items-center justify-center gap-2"
            disabled
          >
            <CheckCircle size={16} />
            Installed (v{installedVersion ?? pkg.version_number})
          </button>
          <button
            onClick={onUninstall}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-[var(--color-error)]/40 text-[var(--color-error)]
              hover:bg-[var(--color-error)]/10 transition-colors cursor-pointer"
          >
            Uninstall
          </button>
        </>
      ) : (
        <button
          onClick={onInstall}
          disabled={isInstalling}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold
            bg-[var(--color-accent-primary)] text-white
            hover:bg-[var(--color-accent-primary-hover)]
            disabled:opacity-60 active:scale-[0.98] transition cursor-pointer
            flex items-center justify-center gap-2"
        >
          {isInstalling ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download size={16} />
              Install v{pkg.version_number}
            </>
          )}
        </button>
      )}
    </div>
  );
}
