import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, FileText, Settings, GraduationCap, Wallet, UserPlus, Coins, BadgeCheck, BookOpen, GalleryHorizontal, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { ConfirmLogoutButton } from "@/components/ConfirmLogoutButton";


const allNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/staff", icon: Users, label: "Staff Setup", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/leave", icon: FileText, label: "Leave & Overtime", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/calendar", icon: CalendarDays, label: "Task Scheduler", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/tasks", icon: ClipboardList, label: "Task Oversight", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/salaries-bonuses", icon: Coins, label: "Salaries & Bonuses", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: true, personalSalary: false },
  // Assistant: My Salary & Bonus moved above Settings
  { to: "/salary", icon: Wallet, label: "My Salary & Bonus", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, assistantSalary: true },
  { to: "/settings", icon: Settings, label: "Settings", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  // Staff-only entries (ordered)
  { to: "/attendance", icon: Clock, label: "Attendance", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  { to: "/my-id", icon: BadgeCheck, label: "My ID", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  { to: "/leave", icon: FileText, label: "Leave & OT Request", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  { to: "/salary", icon: Wallet, label: "My Salary & Bonus", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false },
  { to: "/my-timetable", icon: BookOpen, label: "My Timetable & Lesson Plans", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false, excludeAssistant: false, personalSalary: false, hideForNeutral: true },
  { to: "/manage-accounts", icon: UserPlus, label: "Accounts", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true, excludeAssistant: false, personalSalary: false },
  { to: "/lesson-plans-editor", icon: BookOpen, label: "Lesson Plans Templates", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true, excludeAssistant: false, personalSalary: false },
  { to: "/carousel-management", icon: GalleryHorizontal, label: "Carousel Slider", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true, excludeAssistant: false, personalSalary: false },
  { to: "/notification-centre", icon: Bell, label: "Notification Centre", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true, excludeAssistant: false, personalSalary: false },
];

export function DesktopSidebar() {
  const { profile, isAdmin, isAssistant, isStaff, isItManager, isNeutralClass } = useProfile();

  const navItems = allNavItems.filter((item: any) => {
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

  return (
    <aside className="flex min-h-screen w-60 flex-col border-r border-sidebar-border bg-secondary text-secondary-foreground shadow-sm">
      <div className="flex items-center gap-3 border-b border-sidebar-border p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-sm">
          <GraduationCap className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="font-display text-lg font-bold">AYTY Smart HR</h1>
      </div>

      {profile && (
        <div className="border-b border-sidebar-border px-5 py-3.5">
          <p className="truncate text-sm font-semibold">{profile.full_name || "User"}</p>
        </div>
      )}

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={`${item.to}-${item.staffOnly ? "s" : item.adminOnly ? "a" : "all"}`}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 ease-out before:absolute before:inset-y-2 before:left-0 before:w-1 before:origin-center before:scale-y-0 before:rounded-r-full before:bg-indicator before:transition-transform before:duration-200 active:scale-[0.99]",
                isActive
                  ? "bg-selected text-selected-foreground shadow-sm before:scale-y-100"
                  : "text-secondary-foreground/70 hover:bg-sidebar-accent hover:text-secondary-foreground"
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <ConfirmLogoutButton className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-foreground/70 hover:bg-destructive/20 hover:text-destructive-foreground w-full transition-colors" />
      </div>
    </aside>
  );
}
