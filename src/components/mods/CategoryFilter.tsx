import { ListFilter } from "lucide-react";

import { useComboboxAnchor } from "../../hooks/use-combobox-anchor";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "../ui/combobox";

interface CategoryFilterProps {
  categories: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

export default function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  const anchor = useComboboxAnchor();
  return (
    <Combobox multiple value={value} onValueChange={onChange}>
      <ComboboxChips className="w-full sm:w-72" ref={anchor}>
        <ListFilter className="text-muted-foreground size-3.5 shrink-0" />
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.slice(0, 1).map((category) => (
                <ComboboxChip key={category}>{category}</ComboboxChip>
              ))}
              {selected.length > 1 && (
                <span
                  title={selected.slice(1).join(", ")}
                  className="bg-muted text-muted-foreground inline-flex items-center px-1.5 py-0.5 text-xs"
                >
                  +{selected.length - 1}
                </span>
              )}
              <ComboboxInput placeholder={selected.length > 0 ? "" : "Filter categories..."} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No categories found.</ComboboxEmpty>
        <ComboboxList>
          {categories.map((category) => (
            <ComboboxItem key={category} value={category}>
              {category}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
