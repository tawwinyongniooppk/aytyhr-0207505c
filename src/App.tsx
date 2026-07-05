import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationProvider } from "@/hooks/useNotifications";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

function RoleRedirect() {
  const { isAdmin, isItManager, loading } = useProfile();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (isItManager) return <Navigate to="/manage-accounts" replace />;
  return <Navigate to={isAdmin ? "/dashboard" : "/attendance"} replace />;
}

function lazyRetry(fn: () => Promise<any>) {
  return lazy(() =>
    fn().catch(() => {
      // Force reload on chunk failure (cache bust)
      window.location.reload();
      return new Promise(() => {}); // never resolves, page reloads
    })
  );
}

const Login = lazyRetry(() => import("@/pages/Login"));
const Dashboard = lazyRetry(() => import("@/pages/Dashboard"));
const Staff = lazyRetry(() => import("@/pages/Staff"));
const Attendance = lazyRetry(() => import("@/pages/Attendance"));
const Leave = lazyRetry(() => import("@/pages/Leave"));
const CalendarPage = lazyRetry(() => import("@/pages/CalendarPage"));
const Tasks = lazyRetry(() => import("@/pages/Tasks"));
const SalaryPage = lazyRetry(() => import("@/pages/SalaryPage"));
const SalariesAndBonuses = lazyRetry(() => import("@/pages/SalariesAndBonuses"));
const SettingsPage = lazyRetry(() => import("@/pages/SettingsPage"));
const ManageAccounts = lazyRetry(() => import("@/pages/ManageAccounts"));
const MyIdPage = lazyRetry(() => import("@/pages/MyIdPage"));
const MyTimetablePage = lazyRetry(() => import("@/pages/MyTimetablePage"));
const LessonPlansEditor = lazyRetry(() => import("@/pages/LessonPlansEditor"));
const CarouselManagement = lazyRetry(() => import("@/pages/CarouselManagement"));
const NotificationCentre = lazyRetry(() => import("@/pages/NotificationCentre"));
const NotFound = lazyRetry(() => import("@/pages/NotFound"));

function ItManagerGuard({ children }: { children: React.ReactNode }) {
  const { isItManager, loading } = useProfile();
  if (loading) return <PageLoader />;
  if (!isItManager) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // 5 min — cuts DB load on tab switches
      gcTime: 30 * 60 * 1000,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <NotificationProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<RoleRedirect />} />
                <Route path="/login" element={<Login />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/staff" element={<Staff />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/leave" element={<Leave />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/salary" element={<SalaryPage />} />
                  <Route path="/salaries-bonuses" element={<SalariesAndBonuses />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/manage-accounts" element={<ManageAccounts />} />
                  <Route path="/my-id" element={<MyIdPage />} />
                  <Route path="/my-timetable" element={<MyTimetablePage />} />
                  <Route path="/lesson-plans-editor" element={<LessonPlansEditor />} />
                  <Route path="/carousel-management" element={<CarouselManagement />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </NotificationProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
