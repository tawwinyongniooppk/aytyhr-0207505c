import { NavLink } from "react-router-dom";
import { useState } from "react";
import { LayoutDashboard, Clock, Wallet, ClipboardList, FileText, UserPlus, Users, CalendarDays, Coins, Settings, Menu, BadgeCheck, BookOpen, GalleryHorizontal, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { ConfirmLogoutButton } from "@/components/ConfirmLogoutButton";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";


const allNavItems: any[] = [
  // Admin order: Dashboard, Staff Setup, Leave & Overtime, Task Scheduler, Task Oversight, Salaries & Bonuses
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", fullLabel: "Dashboard", adminOnly: true },
  { to: "/staff", icon: Users, label: "Staff Setup", fullLabel: "Staff Setup", adminOnly: true },
  { to: "/leave", icon: FileText, label: "Leave & OT", fullLabel: "Leave & Overtime", adminOnly: true },
  { to: "/calendar", icon: CalendarDays, label: "Scheduler", fullLabel: "Task Scheduler", adminOnly: true },
  { to: "/tasks", icon: ClipboardList, label: "Oversight", fullLabel: "Task Oversight", adminOnly: true },
  { to: "/salaries-bonuses", icon: Coins, label: "Salary", fullLabel: "Salaries & Bonuses", adminOnly: true, excludeAssistant: true },
  // Assistant: My Salary & Bonus then Settings (swapped)
  { to: "/salary", icon: Wallet, label: "My Salary", fullLabel: "My Salary & Bonus", assistantSalary: true },
  { to: "/settings", icon: Settings, label: "Settings", fullLabel: "Settings", adminOnly: true, assistantOnly: false },
  // Staff (ordered)
  { to: "/attendance", icon: Clock, label: "Attend", fullLabel: "Attendance", staffOnly: true },
  { to: "/my-id", icon: BadgeCheck, label: "My ID", fullLabel: "My ID", staffOnly: true },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", fullLabel: "Tasks", staffOnly: true },
  { to: "/leave", icon: FileText, label: "Leave & OT", fullLabel: "Leave & OT Request", staffOnly: true },
  { to: "/salary", icon: Wallet, label: "My Salary", fullLabel: "My Salary & Bonus", staffOnly: true },
  { to: "/my-timetable", icon: BookOpen, label: "Timetable", fullLabel: "My Timetable & Lesson Plans", staffOnly: true, hideForNeutral: true },
  { to: "/manage-accounts", icon: UserPlus, label: "Accounts", fullLabel: "Accounts", itManagerOnly: true },
  { to: "/lesson-plans-editor", icon: BookOpen, label: "Templates", fullLabel: "Lesson Plans Templates", itManagerOnly: true },
  { to: "/carousel-management", icon: GalleryHorizontal, label: "Carousel", fullLabel: "Carousel Slider", itManagerOnly: true },
  { to: "/notification-centre", icon: Bell, label: "Notify", fullLabel: "Notification Centre", itManagerOnly: true },
];

export function BottomNav() {
  const { isAdmin, isAssistant, isStaff, isItManager, isNeutralClass } = useProfile();
  const [open, setOpen] = useState(false);

  const navItems = allNavItems.filter((item) => {
    if (item.itManagerOnly) return isItManager;
    if (isItManager) return false;
    if (item.assistantSalary) return isAssistant;
    if (item.adminOnly) {
      if (!isAdmin) return false;
      if (item.excludeAssistant && isAssistant) return false;
      return true;
    }
    if (item.staffOnly) {
      if (isAdmin) return false;
      if (item.hideForNeutral && isNeutralClass) return false;
      return isStaff;
    }
    return true;
  });

  // Use the same left-side navigation drawer for every role.
  const useDrawer = navItems.length > 0;

  if (useDrawer) {
    return (
      <>
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card shadow-lg [padding-bottom:env(safe-area-inset-bottom)]">
          <div className="flex h-16 items-center px-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-[transform,opacity,box-shadow] duration-150 ease-out hover:shadow-md active:scale-[0.97] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2">
                  <Menu className="h-5 w-5" />
                  <span>Menu</span>
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-border">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 ease-out before:absolute before:inset-y-2 before:left-0 before:w-1 before:origin-center before:scale-y-0 before:rounded-r-full before:bg-indicator before:transition-transform before:duration-200 active:scale-[0.99]",
                          isActive
                            ? "bg-selected text-selected-foreground shadow-sm before:scale-y-100"
                            : "text-foreground hover:bg-muted"
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105" />
                      <span>{item.fullLabel}</span>
                    </NavLink>
                  ))}
                </nav>
                <div className="p-3 border-t border-border">
                  <ConfirmLogoutButton className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors" iconClassName="h-5 w-5" onConfirmed={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card shadow-lg [padding-bottom:env(safe-area-inset-bottom)]">
      <div className="flex h-16 items-center justify-between gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => (
          <NavLink
            key={`${item.to}-${item.staffOnly ? "s" : item.adminOnly ? "a" : "all"}`}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "relative flex min-w-[3.25rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-semibold transition-[color,background-color,transform] duration-200 after:absolute after:bottom-1 after:h-0.5 after:w-4 after:scale-x-0 after:rounded-full after:bg-indicator after:transition-transform active:scale-[0.98]",
                isActive
                  ? "bg-selected text-selected-foreground after:scale-x-100"
                  : "text-muted-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
