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
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const color = colorMap[toast.type];

        return (
          <div
            key={toast.id}
            className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-lg animate-[slideIn_0.25s_ease-out]"
          >
            <Icon
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color }}
            />
            <p className="text-sm text-[var(--color-text-primary)] flex-1 leading-relaxed">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 p-0.5 rounded hover:bg-[var(--color-border-default)] transition-colors"
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
