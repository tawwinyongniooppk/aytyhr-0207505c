import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, FileText, Settings, GraduationCap, Wallet, LogOut, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

const allNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/staff", icon: Users, label: "Staff", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/attendance", icon: Clock, label: "Attendance", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/salary", icon: Wallet, label: "Salary", adminOnly: false, staffOnly: true, requireSalaryAccess: true, itManagerOnly: false },
  { to: "/leave", icon: FileText, label: "Leave", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/settings", icon: Settings, label: "Settings", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/manage-accounts", icon: UserPlus, label: "Accounts", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true },
];

export function DesktopSidebar() {
  const { profile, isAdmin, canViewSalary, isItManager } = useProfile();
  const { signOut } = useAuth();

  const navItems = allNavItems.filter((item) => {
    if (item.itManagerOnly && !isItManager) return false;
    if (!item.itManagerOnly && isItManager) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.staffOnly && isAdmin) return false;
    if (item.requireSalaryAccess && !canViewSalary) return false;
    return true;
  });

  const roleBadgeColor = profile?.role === "admin"
    ? "bg-primary/20 text-primary-foreground"
    : profile?.role === "assistant"
      ? "bg-warning/20 text-sidebar-foreground"
      : "bg-accent/20 text-sidebar-foreground";

  return (
    <aside className="w-60 bg-secondary text-secondary-foreground flex flex-col min-h-screen">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <GraduationCap className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="font-display text-lg font-bold">StaffPortal</h1>
      </div>

      {profile && (
        <div className="px-5 py-3 border-b border-sidebar-border">
          <p className="text-sm font-medium truncate">{profile.full_name || "User"}</p>
          <Badge className={cn("mt-1 text-[10px] uppercase border-0", roleBadgeColor)}>
            {profile.role === "assistant" ? "Assistant Admin" : profile.role}
          </Badge>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
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
