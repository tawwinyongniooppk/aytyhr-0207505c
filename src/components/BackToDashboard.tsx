import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

/**
 * Floating "Back to Dashboard" block shown on detail pages reached from the dashboard.
 * Visible only to roles that can access the Dashboard (Admin / Assistant Admin).
 */
export function BackToDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isItManager } = useProfile();

  if (!isAdmin || isItManager) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/dashboard")}
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-lg hover:shadow-xl hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
      aria-label="Back to Dashboard"
    >
      <ArrowLeft className="h-4 w-4" />
      <LayoutDashboard className="h-4 w-4" />
      <span>Back to Dashboard</span>
    </button>
  );
}
