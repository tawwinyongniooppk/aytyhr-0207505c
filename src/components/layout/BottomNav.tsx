import { NavLink } from "react-router-dom";
import { LayoutDashboard, Clock, Wallet, ClipboardList, LogOut, FileText, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

const allNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", adminOnly: true, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/attendance", icon: Clock, label: "Attend", adminOnly: false, staffOnly: true, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/salary", icon: Wallet, label: "Salary", adminOnly: false, staffOnly: true, requireSalaryAccess: true, itManagerOnly: false },
  { to: "/leave", icon: FileText, label: "Leave", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/tasks", icon: ClipboardList, label: "Tasks", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: false },
  { to: "/manage-accounts", icon: UserPlus, label: "Accounts", adminOnly: false, staffOnly: false, requireSalaryAccess: false, itManagerOnly: true },
];

export function BottomNav() {
  const { isAdmin, canViewSalary, isItManager } = useProfile();
  const { signOut } = useAuth();

  const navItems = allNavItems.filter((item) => {
    if (item.itManagerOnly && !isItManager) return false;
    if (!item.itManagerOnly && isItManager) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.staffOnly && isAdmin) return false;
    if (item.requireSalaryAccess && !canViewSalary) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg">
      <div className="flex items-center justify-between gap-0.5 h-16 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
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
