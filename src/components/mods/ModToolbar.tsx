import { useRef, type ReactNode } from "react";
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Clock,
  Flame,
  Search,
  Star,
} from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { SortDirection, SortOption } from "../../lib/types";
import { Button } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const sortTabs: { value: SortOption; label: string; icon: typeof Flame }[] = [
  { value: "downloads", label: "Popular", icon: Flame },
  { value: "updated", label: "Newest", icon: Clock },
  { value: "rating", label: "Top Rated", icon: Star },
  { value: "name", label: "A-Z", icon: ArrowDownAZ },
];

interface ModToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (value: SortDirection) => void;
  children?: ReactNode;
}

export default function ModToolbar({
  search,
  onSearchChange,
  placeholder = "Search...",
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionChange,
  children,
}: ModToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useHotkey("Mod+F", () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  });

  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>
            <kbd className="font-sans">⌘F</kbd>
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <ToggleGroup
        variant="outline"
        size="sm"
        value={[sortBy]}
        onValueChange={(value) => {
          if (value[0]) onSortByChange(value[0] as SortOption);
        }}
        aria-label="Sort by"
      >
        {sortTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <ToggleGroupItem key={tab.value} value={tab.value}>
              <Icon />
              {tab.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() =>
          onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc")
        }
        title={
          sortDirection === "desc"
            ? "Sort direction: descending"
            : "Sort direction: ascending"
        }
        aria-label="Toggle sort direction"
      >
        {sortDirection === "desc" ? (
          <ArrowDownNarrowWide />
        ) : (
          <ArrowUpNarrowWide />
        )}
      </Button>

      {children && (
        <div className="ms-auto flex items-center text-xs text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
