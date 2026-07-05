import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, FileText, Settings, GraduationCap, Wallet, LogOut, UserPlus, Coins, BadgeCheck, BookOpen, GalleryHorizontal, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";


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
];

export function DesktopSidebar() {
  const { profile, isAdmin, isAssistant, isStaff, isItManager, isNeutralClass } = useProfile();
  const { signOut } = useAuth();

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
    <aside className="w-60 bg-secondary text-secondary-foreground flex flex-col min-h-screen">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <GraduationCap className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="font-display text-lg font-bold">AYTY Smart HR</h1>
      </div>

      {profile && (
        <div className="px-5 py-3 border-b border-sidebar-border">
          <p className="text-sm font-medium truncate">{profile.full_name || "User"}</p>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={`${item.to}-${item.staffOnly ? "s" : item.adminOnly ? "a" : "all"}`}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-secondary-foreground/70 hover:bg-sidebar-accent hover:text-secondary-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary-foreground/70 hover:bg-destructive/20 hover:text-destructive-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
