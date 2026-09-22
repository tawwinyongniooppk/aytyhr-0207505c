import { Outlet, Navigate, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { AppHeader } from "./AppHeader";
import { DesktopSidebar } from "./DesktopSidebar";
import { BackToDashboard } from "@/components/BackToDashboard";
import { GlobalCarousel } from "@/components/carousel/GlobalCarousel";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useServerRole } from "@/hooks/useServerRole";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmLogoutButton } from "@/components/ConfirmLogoutButton";

const dashboardDetailRoutes = ["/staff", "/attendance", "/leave", "/tasks", "/salaries-bonuses", "/calendar"];

const adminOnlyRoutes = ["/dashboard", "/staff", "/settings", "/calendar"];
const salaryRoutes = ["/salary"];
const staffOnlyRoutes = ["/attendance", "/my-id", "/my-timetable"];
const staffOrAssistantRoutes = ["/salary"];
const itManagerOnlyRoutes = ["/manage-accounts", "/lesson-plans-editor", "/carousel-management", "/notification-centre"];

export function AppLayout() {
  const { user, loading } = useAuth();
  const { isAdmin, isAssistant, isStaff, canViewSalary, isItManager, isNeutralClass, loading: profileLoading, error: profileError } = useProfile();
  const location = useLocation();
  // Privileged routes additionally verify the role with a fresh server-side
  // call so tampered client state cannot render admin/IT-manager pages.
  const isPrivilegedPath =
    adminOnlyRoutes.includes(location.pathname) || itManagerOnlyRoutes.includes(location.pathname);
  const { data: serverRole, isLoading: serverRoleLoading } = useServerRole(!!user && isPrivilegedPath);

  if (loading || profileLoading || (isPrivilegedPath && !!user && serverRoleLoading)) {
    return (
      <div className="flex min-h-screen bg-background" aria-busy="true" aria-label="Loading application">
        <div className="hidden w-60 border-r border-border bg-secondary p-5 md:block">
          <Skeleton className="h-10 w-40 bg-secondary-foreground/10" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full bg-secondary-foreground/10" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-4 md:p-6">
          <Skeleton className="h-14 w-full" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="loading-shell h-28" />
            ))}
          </div>
          <Skeleton className="loading-shell mt-5 h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Server-verified enforcement for privileged routes. The role comes from a
  // fresh current_user_role() RPC (read server-side from profiles), not from
  // client state. If the server denies the role, redirect without rendering.
  // If the RPC itself failed (no role), fall through to the profile-state
  // guards below — data access remains server-enforced regardless.
  if (isPrivilegedPath && serverRole) {
    const allowed = itManagerOnlyRoutes.includes(location.pathname)
      ? serverRole === "it_manager"
      : serverRole === "admin" || serverRole === "assistant" || serverRole === "it_manager";
    if (!allowed) {
      return <Navigate to={serverRole === "admin" ? "/dashboard" : "/attendance"} replace />;
    }
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-medium">{profileError}</p>
          <ConfirmLogoutButton className="mx-auto flex items-center gap-2 text-sm text-muted-foreground underline hover:text-foreground" />
        </div>
      </div>
    );
  }

  // IT Manager can only access manage-accounts and lesson-plans-editor
  if (isItManager && !itManagerOnlyRoutes.includes(location.pathname)) {
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

  // Redirect admin (non-assistant) away from staff-only routes
  if (isAdmin && staffOnlyRoutes.includes(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  // /salary is available to staff and assistant only
  if (staffOrAssistantRoutes.includes(location.pathname) && !isAssistant && !isStaff) {
    return <Navigate to={isAdmin ? "/dashboard" : "/attendance"} replace />;
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
        <GlobalCarousel position="top" />
        <AppHeader />
        <GlobalCarousel position="middle" />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 md:pb-6">
          <div key={location.pathname} className="motion-safe:animate-content-in">
            <Outlet />
          </div>
        </main>
        <div className="mb-16 md:mb-0">
          <GlobalCarousel position="bottom" />
        </div>
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
      {dashboardDetailRoutes.includes(location.pathname) && <BackToDashboard />}
    </div>
  );
}
