import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Clock,
  Flame,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";

import type { PackageSourceFilter, SortDirection, SortOption } from "../../lib/types";
import { Button } from "../ui/button";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import AuthorFilter from "./AuthorFilter";
import CategoryFilter from "./CategoryFilter";
import ModSearchInput from "./ModSearchInput";
import SourceFilter from "./SourceFilter";

const sortTabs: { value: SortOption; label: string; title: string; icon: typeof Flame }[] = [
  { value: "downloads", label: "Popular", title: "Sort by total downloads", icon: Flame },
  { value: "updated", label: "Updated", title: "Sort by last update", icon: Clock },
  { value: "rating", label: "Top Rated", title: "Sort by rating", icon: Star },
  { value: "name", label: "A-Z", title: "Sort by name", icon: ArrowDownAZ },
];

interface ModToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (value: SortDirection) => void;
  categories?: string[];
  selectedCategories?: string[];
  onSelectedCategoriesChange?: (value: string[]) => void;
  sourceFilter?: PackageSourceFilter;
  onSourceFilterChange?: (value: PackageSourceFilter) => void;
  authors?: string[];
  selectedAuthor?: string | null;
  onSelectedAuthorChange?: (value: string | null) => void;
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
  categories,
  selectedCategories,
  onSelectedCategoriesChange,
  sourceFilter,
  onSourceFilterChange,
  authors,
  selectedAuthor,
  onSelectedAuthorChange,
  children,
}: ModToolbarProps) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
      <ModSearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={placeholder}
        className="w-full sm:w-72"
      />

      {onSourceFilterChange && (
        <SourceFilter value={sourceFilter ?? "all"} onChange={onSourceFilterChange} />
      )}

      {authors && authors.length > 0 && onSelectedAuthorChange && (
        <AuthorFilter
          authors={authors}
          value={selectedAuthor ?? null}
          onChange={onSelectedAuthorChange}
        />
      )}

      {categories && categories.length > 0 && onSelectedCategoriesChange && (
        <CategoryFilter
          categories={categories}
          value={selectedCategories ?? []}
          onChange={onSelectedCategoriesChange}
        />
      )}

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
            <ToggleGroupItem key={tab.value} value={tab.value} title={tab.title}>
              <Icon />
              {tab.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc")}
        title={
          sortDirection === "desc" ? "Sort direction: descending" : "Sort direction: ascending"
        }
        aria-label="Toggle sort direction"
      >
        {sortDirection === "desc" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
      </Button>

      {children && (
        <div className="text-muted-foreground ms-auto flex items-center text-xs">{children}</div>
      )}
    </div>
  );
}
