interface SkeletonProps {
  className?: string;
}

function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-[var(--color-bg-elevated)] ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
