import { Skeleton } from "../ui/skeleton";
import {
  Card,
  CardFooter,
  CardHeader,
} from "../ui/card";

export function CardSkeleton() {
  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="grid-cols-[auto_1fr] items-start gap-3">
        <Skeleton className="size-14 shrink-0" />
        <div className="grid gap-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardHeader>
      <CardFooter className="justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-5 w-12" />
        </div>
        <Skeleton className="h-7 w-16" />
      </CardFooter>
    </Card>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border bg-card p-3"
        >
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
          <Skeleton className="size-7" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
