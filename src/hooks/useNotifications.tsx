import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";

type Category = "tasks" | "leave" | "calendar" | "attendance";

const ROUTE_CATEGORY: Record<string, Category> = {
  "/tasks": "tasks",
  "/leave": "leave",
  "/calendar": "calendar",
  "/attendance": "attendance",
};

interface Ctx {
  counts: Record<Category, number>;
  hasFor: (route: string) => boolean;
  markRead: (route: string) => void;
}

const empty = { tasks: 0, leave: 0, calendar: 0, attendance: 0 };

const NotificationContext = createContext<Ctx>({
  counts: empty,
  hasFor: () => false,
  markRead: () => {},
});

function playBeep() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore */
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, isStaff, isItManager, loading } = useProfile();
  const location = useLocation();
  const [counts, setCounts] = useState<Record<Category, number>>(empty);
  const startedAt = useRef<number>(Date.now());

  const storageKey = useMemo(() => (user ? `notif_seen_${user.id}` : null), [user]);

  function bump(cat: Category, important = true) {
    // Don't bump for the page the user is currently looking at
    const currentCat = ROUTE_CATEGORY[location.pathname];
    if (currentCat === cat) return;
    setCounts((prev) => ({ ...prev, [cat]: prev[cat] + 1 }));
    if (storageKey) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
        raw[cat] = (raw[cat] || 0) + 1;
        localStorage.setItem(storageKey, JSON.stringify(raw));
      } catch { /* ignore */ }
    }
    if (important) playBeep();
  }

  function markRead(route: string) {
    const cat = ROUTE_CATEGORY[route];
    if (!cat) return;
    setCounts((prev) => (prev[cat] === 0 ? prev : { ...prev, [cat]: 0 }));
    if (storageKey) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
        raw[cat] = 0;
        localStorage.setItem(storageKey, JSON.stringify(raw));
      } catch { /* ignore */ }
    }
  }

  // Hydrate persisted unread counts on login
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
      setCounts({
        tasks: Number(raw.tasks) || 0,
        leave: Number(raw.leave) || 0,
        calendar: Number(raw.calendar) || 0,
        attendance: Number(raw.attendance) || 0,
      });
    } catch { /* ignore */ }
  }, [storageKey]);

  // Auto-mark current route as read whenever user navigates
  useEffect(() => {
    markRead(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!user || loading || isItManager) return;
    startedAt.current = Date.now();

    const channel = supabase.channel(`notif-${user.id}`);

    // ---- Tasks ----
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tasks" },
      (payload) => {
        const row: any = payload.new;
        if (isStaff && row.assignee_id === user.id) bump("tasks");
        else if (isAdmin && row.assigned_by !== user.id) bump("tasks");
      },
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tasks" },
      (payload) => {
        const row: any = payload.new;
        const old: any = payload.old;
        if (isAdmin && row.submission_status === "submitted" && old.submission_status !== "submitted") {
          bump("tasks");
        }
        if (isStaff && row.assignee_id === user.id && row.submission_status === "approved" && old.submission_status !== "approved") {
          bump("tasks");
        }
      },
    );

    // ---- Leave ----
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "leave_requests" },
      (payload) => {
        const row: any = payload.new;
        if (isAdmin && row.user_id !== user.id) bump("leave");
        else if (isStaff && row.user_id === user.id) bump("leave", false);
      },
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "leave_requests" },
      (payload) => {
        const row: any = payload.new;
        const old: any = payload.old;
        if (isStaff && row.user_id === user.id && row.status !== old.status) {
          bump("leave");
        }
      },
    );

    // ---- Calendar ----
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "calendar_events" },
      (payload) => {
        const row: any = payload.new;
        if (isAdmin && row.created_by !== user.id) bump("calendar");
        else if (isStaff && (row.visibility === "public" || row.assigned_to_all)) bump("calendar", false);
      },
    );
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "calendar_event_assignments" },
      (payload) => {
        const row: any = payload.new;
        if (isStaff && row.user_id === user.id) bump("calendar");
      },
    );

    // ---- Attendance ----
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attendance" },
      (payload) => {
        const row: any = payload.new;
        if (isAdmin && row.user_id !== user.id) bump("attendance", false);
      },
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "attendance" },
      (payload) => {
        const row: any = payload.new;
        const old: any = payload.old;
        if (isAdmin && row.user_id !== user.id && !old.check_out_time && row.check_out_time) {
          bump("attendance", false);
        }
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, isAdmin, isStaff, isItManager]);

  const hasFor = (route: string) => {
    const cat = ROUTE_CATEGORY[route];
    return !!cat && counts[cat] > 0;
  };

  return (
    <NotificationContext.Provider value={{ counts, hasFor, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
