import type { ConfigEntry } from "../../lib/types";

interface ConfigEntryRowProps {
  entry: ConfigEntry;
  value: string;
  onChange: (value: string) => void;
}

function isNumericType(settingType: string): boolean {
  return (
    settingType.includes("int") ||
    settingType.includes("float") ||
    settingType.includes("single") ||
    settingType.includes("double")
  );
}

function ToggleSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const isTrue = value.toLowerCase() === "true";
  return (
    <button
      type="button"
      onClick={() => onChange(isTrue ? "false" : "true")}
      aria-pressed={isTrue}
      aria-label={label}
      className={`relative w-10 h-5.5 rounded-full shrink-0 transition-colors cursor-pointer
        ${isTrue ? "bg-[var(--color-accent-primary)]" : "bg-[var(--color-border-default)]"}
      `}
    >
      <div
        className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform
          ${isTrue ? "translate-x-5" : "translate-x-0.5"}
        `}
      />
    </button>
  );
}

function ValueSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 rounded-md text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-default)]
        text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)]"
    >
      {options.map((av) => (
        <option key={av} value={av}>
          {av}
        </option>
      ))}
    </select>
  );
}

function NumberField({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: string;
  range: readonly [string, string] | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        min={range?.[0]}
        max={range?.[1]}
        className="w-28 px-2.5 py-1.5 rounded-md text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-default)]
          text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)]"
      />
      {range && (
        <span className="text-xs text-[var(--color-text-muted)]">
          [{range[0]} - {range[1]}]
        </span>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="w-60 px-2.5 py-1.5 rounded-md text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-default)]
        text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)]"
    />
  );
}

function ConfigEntryInput({
  entry,
  value,
  onChange,
}: ConfigEntryRowProps) {
  const settingType = entry.setting_type?.toLowerCase() ?? "";
  const acceptableValues = entry.acceptable_values
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const rangeMatch = entry.acceptable_value_range?.match(
    /^from\s+(.+?)\s+to\s+(.+)$/i
  );
  const acceptableRange = rangeMatch
    ? ([rangeMatch[1].trim(), rangeMatch[2].trim()] as const)
    : null;

  if (settingType === "boolean" || settingType === "bool") {
    return (
      <ToggleSwitch
        label={`Toggle ${entry.key}`}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (acceptableValues && acceptableValues.length > 0) {
    return (
      <ValueSelect
        label={entry.key}
        value={value}
        options={acceptableValues}
        onChange={onChange}
      />
    );
  }

  if (isNumericType(settingType)) {
    return (
      <NumberField
        label={entry.key}
        value={value}
        range={acceptableRange}
        onChange={onChange}
      />
    );
  }

  return <TextField label={entry.key} value={value} onChange={onChange} />;
}

export default function ConfigEntryRow({
  entry,
  value,
  onChange,
}: ConfigEntryRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {entry.key}
          </span>
          {entry.default_value && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
              default: {entry.default_value}
            </span>
          )}
        </div>
        {entry.description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
            {entry.description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <ConfigEntryInput entry={entry} value={value} onChange={onChange} />
      </div>
    </div>
  );
}
