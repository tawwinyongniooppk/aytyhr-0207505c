import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, ...props }, ref) => {
    // For number inputs: prevent the scroll wheel from changing the value
    // (typing still works). Spinner arrows are hidden globally via CSS in index.css.
    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
      if (type === "number") {
        (e.currentTarget as HTMLInputElement).blur();
      }
      onWheel?.(e);
    };
    return (
      <input
        type={type}
        onWheel={handleWheel}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm ring-offset-background transition-[border-color,box-shadow,background-color] duration-150 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-subtle-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-1 aria-[invalid=true]:border-destructive aria-[invalid=true]:motion-safe:animate-error-nudge disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
