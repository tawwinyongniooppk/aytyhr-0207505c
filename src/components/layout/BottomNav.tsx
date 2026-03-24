import { NavLink } from "react-router-dom";
import { LayoutDashboard, Clock, Wallet, CalendarDays, Settings, LogOut, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

const allNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", adminOnly: true, requireSalaryAccess: false },
  { to: "/attendance", icon: Clock, label: "Attend", adminOnly: false, requireSalaryAccess: false },
  { to: "/salary", icon: Wallet, label: "Salary", adminOnly: false, requireSalaryAccess: true },
  { to: "/leave", icon: CalendarDays, label: "Leave", adminOnly: false, requireSalaryAccess: false },
];

export function BottomNav() {
  const { isAdmin } = useProfile();
  const { signOut } = useAuth();

  const navItems = allNavItems.filter((item) => isAdmin || !item.adminOnly);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors duration-200",
                isActive ? "text-secondary" : "text-muted-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
