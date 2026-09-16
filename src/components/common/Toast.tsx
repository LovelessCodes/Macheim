import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

import { useAppStore } from "../../store/appStore";

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
};

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const color = colorMap[toast.type];

        return (
          <div
            key={toast.id}
            className="flex animate-[slideIn_0.25s_ease-out] items-start gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-4 py-3 shadow-lg"
          >
            <Icon size={18} className="mt-0.5 shrink-0" style={{ color }} />
            <p className="flex-1 text-sm leading-relaxed text-[var(--color-text-primary)]">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--color-border-default)]"
            >
              <X size={14} className="text-[var(--color-text-muted)]" />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
