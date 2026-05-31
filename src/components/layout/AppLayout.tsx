import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { AppHeader } from "./AppHeader";
import { DesktopSidebar } from "./DesktopSidebar";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Loader2 } from "lucide-react";

const dashboardDetailRoutes = ["/staff", "/attendance", "/leave", "/tasks", "/salaries-bonuses", "/calendar"];

const adminOnlyRoutes = ["/dashboard", "/staff", "/settings", "/calendar"];
const salaryRoutes = ["/salary"];
const staffOnlyRoutes = ["/attendance", "/salary", "/my-id", "/my-timetable"];
const itManagerOnlyRoutes = ["/manage-accounts", "/lesson-plans-editor"];

export function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const { isAdmin, canViewSalary, isItManager, isNeutralClass, loading: profileLoading, error: profileError } = useProfile();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-medium">{profileError}</p>
          <button
            onClick={signOut}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Sign out and try again
          </button>
        </div>
      </div>
    );
  }

  // IT Manager can only access manage-accounts
  if (isItManager && location.pathname !== "/manage-accounts") {
    return <Navigate to="/manage-accounts" replace />;
  }

  // Non-IT-Manager cannot access IT Manager routes
  if (!isItManager && itManagerOnlyRoutes.includes(location.pathname)) {
    return <Navigate to={isAdmin ? "/dashboard" : "/attendance"} replace />;
  }

  // Redirect staff away from admin-only routes
  if (!isAdmin && !isItManager && adminOnlyRoutes.includes(location.pathname)) {
    return <Navigate to="/attendance" replace />;
  }

  // Redirect admin/assistant away from staff-only routes
  if (isAdmin && staffOnlyRoutes.includes(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect assistant away from salary routes
  if (!canViewSalary && salaryRoutes.includes(location.pathname)) {
    return <Navigate to="/attendance" replace />;
  }

  // Block Neutral-class staff from timetable
  if (location.pathname === "/my-timetable" && isNeutralClass) {
    return <Navigate to="/attendance" replace />;
  }

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      <div className="hidden md:flex h-screen overflow-y-auto">
        <DesktopSidebar />
      </div>
      <div className="flex-1 flex flex-col h-screen min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
      {dashboardDetailRoutes.includes(location.pathname) && <BackToDashboard />}
    </div>
  );
}
