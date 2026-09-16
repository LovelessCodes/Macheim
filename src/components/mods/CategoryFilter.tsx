import { ListFilter } from "lucide-react";

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
  return (
    <Combobox multiple value={value} onValueChange={onChange}>
      <ComboboxChips className="w-full sm:w-72">
        <ListFilter className="text-muted-foreground size-3.5 shrink-0" />
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((category) => (
                <ComboboxChip key={category}>{category}</ComboboxChip>
              ))}
              <ComboboxInput placeholder={selected.length > 0 ? "" : "Filter categories..."} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>

      <ComboboxContent>
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
