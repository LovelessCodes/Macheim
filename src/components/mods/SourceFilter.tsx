import { Store } from "lucide-react";

import type { PackageSourceFilter } from "../../lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const sourceOptions: { value: PackageSourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "thunderstore", label: "Thunderstore" },
  { value: "hexium", label: "Hexium" },
];

interface SourceFilterProps {
  value: PackageSourceFilter;
  onChange: (value: PackageSourceFilter) => void;
}

export default function SourceFilter({ value, onChange }: SourceFilterProps) {
  return (
    <Select
      items={sourceOptions}
      value={value}
      onValueChange={(next) => onChange((next ?? "all") as PackageSourceFilter)}
    >
      <SelectTrigger size="sm" aria-label="Filter by source">
        <Store className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sourceOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
