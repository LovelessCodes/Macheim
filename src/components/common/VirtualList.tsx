import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

import { ScrollArea } from "../ui/scroll-area";

const LIST_GAP = 8;
const DEFAULT_ROW_HEIGHT = 64;

interface VirtualListProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateRowHeight?: number;
  empty?: ReactNode;
}

export default function VirtualList<T>({
  items,
  keyOf,
  renderItem,
  estimateRowHeight = DEFAULT_ROW_HEIGHT,
  empty,
}: VirtualListProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 6,
    gap: LIST_GAP,
    initialRect: { width: 1280, height: 800 },
  });

  return (
    <ScrollArea scrollFade viewportRef={viewportRef} className="min-h-0 flex-1">
      {items.length === 0 ? (
        empty
      ) : (
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() + LIST_GAP }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={keyOf(items[virtualRow.index])}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderItem(items[virtualRow.index])}
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
