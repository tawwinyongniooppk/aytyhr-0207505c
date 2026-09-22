import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { themeColors, type ThemeColor, useTheme } from "@/hooks/useTheme";

const labels: Record<ThemeColor, string> = {
  ocean: "Ocean",
  violet: "Violet",
  emerald: "Emerald",
  sky: "Sky",
  rose: "Rose",
  amber: "Amber",
  pink: "Pink",
  slate: "Slate",
};

export function ThemeColorPicker() {
  const { isDark, toggleTheme, colorTheme, setColorTheme } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Open appearance settings"
          title="Appearance"
        >
          <Palette className="h-4 w-4 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-2rem))] p-3">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-sm font-semibold leading-tight">Appearance</p>
            <p className="text-xs text-muted-foreground">Saved on this device</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="h-9 px-3"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDark ? "Light" : "Dark"}</span>
          </Button>
        </div>

        <fieldset className="mt-3">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Theme color</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme color">
            {themeColors.map((theme) => {
              const selected = colorTheme === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${labels[theme]} theme${selected ? ", selected" : ""}`}
                  data-preview-theme={theme}
                  onClick={() => setColorTheme(theme)}
                  className={cn(
                    "group flex min-h-12 items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-primary bg-primary-soft text-primary-strong shadow-sm"
                      : "border-border bg-background text-foreground hover:border-subtle-border hover:bg-muted",
                  )}
                >
                  <span className="theme-preview-swatch flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-foreground/10">
                    {selected && <Check className="h-4 w-4 text-primary-foreground" aria-hidden="true" />}
                  </span>
                  <span className="truncate">{labels[theme]}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}