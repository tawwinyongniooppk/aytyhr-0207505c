import { Outlet, Navigate } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

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
