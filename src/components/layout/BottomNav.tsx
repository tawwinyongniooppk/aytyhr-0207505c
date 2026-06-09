import { NavLink } from "react-router-dom";
import { useState } from "react";
import { LayoutDashboard, Clock, Wallet, ClipboardList, LogOut, FileText, UserPlus, Users, CalendarDays, Coins, Settings, Menu, BadgeCheck, BookOpen, GalleryHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
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
];

export function BottomNav() {
  const { isAdmin, isAssistant, isStaff, isItManager, isNeutralClass } = useProfile();
  const { signOut } = useAuth();
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

  // When crowded (admin/assistant), switch to left vertical drawer
  const useDrawer = (isAdmin || isAssistant) && navItems.length > 4;

  if (useDrawer) {
    return (
      <>
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg">
          <div className="flex items-center justify-between h-16 px-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm">
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
                          "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground hover:bg-muted"
                        )
                      }
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.fullLabel}</span>
                    </NavLink>
                  ))}
                </nav>
                <div className="p-3 border-t border-border">
                  <button
                    onClick={() => { setOpen(false); signOut(); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Logout</span>
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg">
      <div className="flex items-center justify-between gap-0.5 h-16 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => (
          <NavLink
            key={`${item.to}-${item.staffOnly ? "s" : item.adminOnly ? "a" : "all"}`}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-medium transition-all duration-200 flex-1 min-w-[3rem] shrink-0",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={signOut}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors flex-1 min-w-[3rem] shrink-0"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
