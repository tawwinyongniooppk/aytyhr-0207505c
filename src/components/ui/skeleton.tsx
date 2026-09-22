import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("rounded-md border border-border/40 bg-muted/75", className)} {...props} />;
}

export { Skeleton };
