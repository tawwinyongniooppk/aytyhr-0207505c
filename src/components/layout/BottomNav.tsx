import { NavLink } from "react-router-dom";
import { LayoutDashboard, Clock, Wallet, ClipboardList, LogOut, FileText, UserPlus, Users, CalendarDays, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

const allNavItems: any[] = [
  // Admin order: Dashboard, Staff, Leave, Calendar, Tasks, Salaries & Bonuses
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", adminOnly: true },
  { to: "/staff", icon: Users, label: "Staff", adminOnly: true },
  { to: "/leave", icon: FileText, label: "Leave", adminOnly: true },
  { to: "/calendar", icon: CalendarDays, label: "Cal", adminOnly: true },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", adminOnly: true },
  { to: "/salaries-bonuses", icon: Coins, label: "Salary", adminOnly: true, excludeAssistant: true },
  // Staff
  { to: "/attendance", icon: Clock, label: "Attend", staffOnly: true },
  { to: "/salary", icon: Wallet, label: "My Salary", personalSalary: true },
  { to: "/leave", icon: FileText, label: "Leave", staffOnly: true },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", staffOnly: true },
  { to: "/manage-accounts", icon: UserPlus, label: "Accounts", itManagerOnly: true },
];

export function BottomNav() {
  const { isAdmin, isAssistant, isStaff, isItManager } = useProfile();
  const { signOut } = useAuth();

  const navItems = allNavItems.filter((item) => {
    if (item.itManagerOnly) return isItManager;
    if (isItManager) return false;
    if (item.personalSalary) return isAssistant || isStaff;
    if (item.adminOnly) {
      if (!isAdmin) return false;
      if (item.excludeAssistant && isAssistant) return false;
      return true;
    }
    if (item.staffOnly && isAdmin) return false;
    return true;
  });

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
