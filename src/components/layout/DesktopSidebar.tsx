import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, FileText, Settings, GraduationCap, Wallet, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

const allNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true, requireSalaryAccess: false },
  { to: "/staff", icon: Users, label: "Staff", adminOnly: true, requireSalaryAccess: false },
  { to: "/attendance", icon: Clock, label: "Attendance", adminOnly: false, requireSalaryAccess: false },
  { to: "/salary", icon: Wallet, label: "Salary", adminOnly: false, requireSalaryAccess: true },
  { to: "/leave", icon: FileText, label: "Leave", adminOnly: false, requireSalaryAccess: false },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", adminOnly: false, requireSalaryAccess: false },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", adminOnly: false, requireSalaryAccess: false },
  { to: "/settings", icon: Settings, label: "Settings", adminOnly: true, requireSalaryAccess: false },
];

export function DesktopSidebar() {
  const { profile, isAdmin } = useProfile();
  const { signOut } = useAuth();

  const navItems = allNavItems.filter((item) => isAdmin || !item.adminOnly);

  return (
    <aside className="w-60 bg-primary text-primary-foreground flex flex-col min-h-screen">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <GraduationCap className="h-7 w-7 text-secondary" />
        <h1 className="font-display text-lg font-bold">StaffPortal</h1>
      </div>

      {profile && (
        <div className="px-5 py-3 border-b border-sidebar-border">
          <p className="text-sm font-medium truncate">{profile.full_name || "User"}</p>
          <Badge variant="secondary" className="mt-1 text-[10px] uppercase">
            {profile.role}
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
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-primary-foreground/70 hover:bg-sidebar-accent/50 hover:text-primary-foreground"
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-primary-foreground/70 hover:bg-destructive/20 hover:text-destructive-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
        <p className="text-xs text-primary-foreground/50 mt-2 px-3">© 2026 StaffPortal</p>
      </div>
    </aside>
  );
}
