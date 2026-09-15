import { Search, Flame, Clock, Star, ArrowDownAZ } from "lucide-react";

import type { SortOption } from "../../lib/types";
import { useModStore } from "../../store/modStore";

const sortTabs: { value: SortOption; label: string; icon: typeof Flame }[] = [
  { value: "downloads", label: "Popular", icon: Flame },
  { value: "updated", label: "Newest", icon: Clock },
  { value: "rating", label: "Top Rated", icon: Star },
  { value: "name", label: "A-Z", icon: ArrowDownAZ },
];

export default function ModSearch() {
  const sortBy = useModStore((s) => s.sortBy);
  const setSortBy = useModStore((s) => s.setSortBy);
  const searchQuery = useModStore((s) => s.searchQuery);
  const setSearchQuery = useModStore((s) => s.setSearchQuery);

  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search mods..."
          className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-input)] py-2.5 pr-4 pl-10 text-sm text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]/30 focus:outline-none"
        />
      </div>

      {/* Sort Tabs */}
      <div className="flex items-center gap-2">
        {sortTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = sortBy === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setSortBy(tab.value)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-[var(--color-accent-primary)] text-white shadow-sm"
                  : "border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
              } `}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
