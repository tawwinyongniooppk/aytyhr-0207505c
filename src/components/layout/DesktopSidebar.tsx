import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, FileText, Settings, GraduationCap, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/staff", icon: Users, label: "Staff" },
  { to: "/attendance", icon: Clock, label: "Attendance" },
  { to: "/salary", icon: Wallet, label: "Salary" },
  { to: "/leave", icon: FileText, label: "Leave" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/tasks", icon: ClipboardList, label: "Tasks" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function DesktopSidebar() {
  return (
    <aside className="w-60 bg-primary text-primary-foreground flex flex-col min-h-screen">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <GraduationCap className="h-7 w-7 text-secondary" />
        <h1 className="font-display text-lg font-bold">StaffPortal</h1>
      </div>

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

      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-primary-foreground/50">© 2026 StaffPortal</p>
      </div>
    </aside>
  );
}
