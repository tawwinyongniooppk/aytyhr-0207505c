import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { AppHeader } from "./AppHeader";
import { DesktopSidebar } from "./DesktopSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Loader2 } from "lucide-react";

const adminOnlyRoutes = ["/dashboard", "/staff", "/settings", "/calendar"];
const salaryRoutes = ["/salary"];
const staffOnlyRoutes = ["/attendance", "/salary"];
const itManagerOnlyRoutes = ["/manage-accounts"];

export function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const { isAdmin, canViewSalary, isItManager, loading: profileLoading, error: profileError } = useProfile();
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

  return (
    <div className="min-h-screen flex w-full bg-background">
      <div className="hidden md:flex">
        <DesktopSidebar />
      </div>
      <div className="flex-1 flex flex-col min-h-screen">
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
