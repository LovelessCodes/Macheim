import { User, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useComboboxAnchor } from "../../hooks/use-combobox-anchor";
import {
  Combobox,
  ComboboxChips,
  ComboboxClear,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../ui/combobox";

/** Authors number in the thousands; render only the best matches. */
const MAX_RESULTS = 50;

interface AuthorFilterProps {
  authors: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function AuthorFilter({ authors, value, onChange }: AuthorFilterProps) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = q ? authors.filter((author) => author.toLowerCase().includes(q)) : authors;
    return source.slice(0, MAX_RESULTS);
  }, [authors, query]);

  return (
    <Combobox
      value={value}
      onValueChange={(next) => onChange(next ?? null)}
      onInputValueChange={setQuery}
    >
      <ComboboxChips className="w-full sm:w-56" ref={anchor}>
        <User className="text-muted-foreground size-3.5 shrink-0" />
        {/* Selecting an author fills the input with its name; Clear resets both. */}
        <ComboboxInput placeholder="Filter author..." />
        {value && (
          <ComboboxClear aria-label="Clear author filter">
            <X className="size-3" />
          </ComboboxClear>
        )}
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        {/* The list is pre-filtered here, so base-ui's own Empty state cannot
            see which items were dropped. */}
        {matches.length === 0 && (
          <div className="text-muted-foreground px-2 py-2 text-xs">No authors found.</div>
        )}
        <ComboboxList>
          {matches.map((author) => (
            <ComboboxItem key={author} value={author}>
              {author}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
