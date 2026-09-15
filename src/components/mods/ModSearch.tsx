import { useRef } from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Clock, Flame, Search, Star, ArrowDownAZ } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useModStore } from "../../store/modStore";
import type { SortOption } from "../../lib/types";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "../ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const sortTabs: { value: SortOption; label: string; icon: typeof Flame }[] = [
  { value: "downloads", label: "Popular", icon: Flame },
  { value: "updated", label: "Newest", icon: Clock },
  { value: "rating", label: "Top Rated", icon: Star },
  { value: "name", label: "A-Z", icon: ArrowDownAZ },
];

export default function ModSearch() {
  const sortBy = useModStore((s) => s.sortBy);
  const setSortBy = useModStore((s) => s.setSortBy);
  const sortDirection = useModStore((s) => s.sortDirection);
  const setSortDirection = useModStore((s) => s.setSortDirection);
  const searchQuery = useModStore((s) => s.searchQuery);
  const setSearchQuery = useModStore((s) => s.setSearchQuery);

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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search mods..."
          aria-label="Search mods"
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
          if (value[0]) setSortBy(value[0] as SortOption);
        }}
        aria-label="Sort mods by"
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
          setSortDirection(sortDirection === "desc" ? "asc" : "desc")
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
    </div>
  );
}
