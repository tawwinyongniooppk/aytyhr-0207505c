import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, Target, CheckCircle2, Sparkles } from "lucide-react";
import { getMMTDateParts } from "@/lib/mmt";

function getYearlyPeriod() {
  const { year, month } = getMMTDateParts(new Date());
  const y = Number(year);
  const m = Number(month);
  const startYear = m >= 6 ? y : y - 1;
  const start = `${startYear}-06-01`;
  const end = `${startYear + 1}-06-01`; // exclusive
  return { start, end, startLabel: `June 1, ${startYear}`, endLabel: `May 31, ${startYear + 1}` };
}

function unitsForSpan(start: string, end: string): number {
  const d = Math.round(
    (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86400000,
  );
  return d >= 12 ? 2 : 1;
}

function qualification(percent: number, baseSalary: number) {
  if (percent >= 91)
    return {
      rate: 100,
      amount: baseSalary,
      message: "သင်၏ နှစ်ကုန် အပိုဆုကြေး ခံစားခွင့်မှာ သင့် အခြေခံလစာ၏ 100% ဖြစ်ပါသည်။",
      tone: "from-amber-400 via-yellow-400 to-orange-500",
      qualified: true,
    };
  if (percent >= 71)
    return {
      rate: 70,
      amount: Math.round(baseSalary * 0.7),
      message: "သင်၏ နှစ်ကုန် အပိုဆုကြေး ခံစားခွင့်မှာ သင့် အခြေခံလစာ၏ 70% ဖြစ်ပါသည်။",
      tone: "from-amber-300 via-yellow-300 to-orange-400",
      qualified: true,
    };
  if (percent >= 40)
    return {
      rate: 50,
      amount: Math.round(baseSalary * 0.5),
      message: "သင်၏ နှစ်ကုန် အပိုဆုကြေး ခံစားခွင့်မှာ သင့် အခြေခံလစာ၏ 50% ဖြစ်ပါသည်။",
      tone: "from-yellow-200 via-amber-300 to-orange-300",
      qualified: true,
    };
  return {
    rate: 0,
    amount: 0,
    message: "သင်၏ နှစ်ကုန် အပိုဆုကြေး ခံစားခွင့် မပြည့်မီသေးပါ။",
    tone: "from-zinc-300 via-zinc-400 to-zinc-500",
    qualified: false,
  };
}

export function YearlyBonusSection({ baseSalary }: { baseSalary: number }) {
  const { user } = useAuth();
  const period = useMemo(getYearlyPeriod, []);
  const [loading, setLoading] = useState(true);
  const [assigned, setAssigned] = useState(0);
  const [done, setDone] = useState(0);
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Today in MMT (UTC+6:30) — same checkpoint used by Status Monitor's "All Done".
      const { year, month, day } = getMMTDateParts(new Date());
      const todayStr = `${year}-${month}-${day}`;

      // Cycle-start-year: matches server rollup (June-1 boundary).
      const y = Number(year);
      const m = Number(month);
      const cycleStartYear = m >= 6 ? y : y - 1;

      const [tasksRes, assignRes, progressRes, creditRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, submission_status, created_at, due_date")
          .eq("assignee_id", user.id)
          .gte("created_at", period.start)
          .lt("created_at", period.end),
        supabase
          .from("calendar_event_assignments")
          .select(
            "id, submission_status, approved_at, calendar_events!inner(start_date, end_date, event_type)",
          )
          .eq("user_id", user.id),
        supabase
          .from("yearly_bonus_progress")
          .select("assigned_units, all_done_units")
          .eq("user_id", user.id)
          .eq("cycle_start_year", cycleStartYear)
          .maybeSingle(),
        // Credited units — a task graduates to All Done the moment the deadline-night
        // sweep credits its bonus, instead of waiting for the calendar day to roll over.
        supabase
          .from("bonus_transactions")
          .select("task_id, assignment_id, unit_count")
          .eq("user_id", user.id)
          .gt("unit_count", 0),
      ]);

      if (cancelled) return;

      const creditedTasks = new Set<string>();
      const creditedAssignments = new Set<string>();
      for (const b of ((creditRes as any)?.data as any[]) || []) {
        if (b.task_id) creditedTasks.add(b.task_id);
        if (b.assignment_id) creditedAssignments.add(b.assignment_id);
      }

      // Persisted units from previous months in this cycle (rolled up during monthly reset).
      let assignedUnits = Number((progressRes.data as any)?.assigned_units ?? 0);
      let doneUnits = Number((progressRes.data as any)?.all_done_units ?? 0);

      // Only add live counts for the CURRENT MMT month — previous months are
      // already captured in yearly_bonus_progress (rolled up during monthly reset).
      const liveStart = `${year}-${month}-01`;

      const tasks = (tasksRes.data as any[]) || [];
      for (const t of tasks) {
        if (t.submission_status === "rejected") continue;
        const createdStr = String(t.created_at).slice(0, 10);
        if (createdStr < liveStart) continue;
        assignedUnits += 1;
        const dueStr: string | null = t.due_date ? String(t.due_date).slice(0, 10) : null;
        const deadlinePassed = dueStr ? dueStr < todayStr : true;
        if (t.submission_status === "approved" && (deadlinePassed || creditedTasks.has(t.id))) doneUnits += 1;
      }

      const assigns = (assignRes.data as any[]) || [];
      for (const r of assigns) {
        const ev = r.calendar_events;
        if (!ev || ev.event_type !== "task") continue;
        if (ev.start_date < liveStart || ev.start_date >= period.end) continue;
        if (r.submission_status === "rejected") continue;
        const u = unitsForSpan(ev.start_date, ev.end_date);
        assignedUnits += u;
        const deadlinePassed = ev.end_date < todayStr || creditedAssignments.has(r.id);
        if (r.submission_status === "approved" && !!r.approved_at && deadlinePassed) {
          doneUnits += u;
        }
      }



      setAssigned(assignedUnits);
      setDone(doneUnits);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, period.start, period.end, refreshKey]);

  useEffect(() => {
    if (!user) return;
    // Phase 2B-1: skip Realtime-triggered reloads while hidden; the
    // visibilitychange effect below already refreshes once on return.
    // Phase 2B-2: coalesce rapid visible-tab event bursts into one refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (document.hidden) return;
        setRefreshKey((k) => k + 1);
      }, 400);
    };
    const channel = supabase
      .channel(`yearly-bonus-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_event_assignments", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_transactions", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "yearly_bonus_progress", filter: `user_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assignee_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [user]);


  // Refetch on tab focus/visibility so a checkpoint credit (23:55 MMT on
  // day 3/10/17/24) that lands while this card is already open shows up
  // without a full page reload — same pattern as StatusMonitor/Tasks.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const percent = assigned > 0 ? Math.min(100, Math.round((done / assigned) * 100)) : 0;
  const qual = qualification(percent, baseSalary);

  // Smooth count-up animation for percent
  useEffect(() => {
    let raf = 0;
    const startTs = performance.now();
    const from = animatedPercent;
    const to = percent;
    const dur = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedPercent(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent]);

  return (
    <Card className="border border-amber-200/60 dark:border-amber-500/20 shadow-lg overflow-hidden bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/30 relative">
      {/* Decorative sparkles */}
      <div className="absolute top-3 right-3 text-amber-400/60 animate-pulse pointer-events-none">
        <Sparkles className="h-5 w-5" />
      </div>

      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg sm:text-xl font-bold font-display bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-300 dark:to-orange-300 bg-clip-text text-transparent">
            My Yearly Bonus
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-5">
          Yearly Cycle: {period.startLabel} → {period.endLabel}
        </p>

        <div className="grid md:grid-cols-2 gap-6 items-center">
          {/* Beer mug */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-center mb-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Current Performance
              </div>
              <div className="text-4xl sm:text-5xl font-extrabold font-display bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent transition-all">
                {loading ? "—" : `${animatedPercent}%`}
              </div>
            </div>
            <BeerMug percent={loading ? 0 : animatedPercent} />
          </div>

          {/* Stats + message */}
          <div className="space-y-3">
            <div
              className={`rounded-xl p-4 bg-gradient-to-br ${qual.tone} text-white shadow-md`}
            >
              <div className="text-[11px] uppercase tracking-wider font-semibold opacity-90 mb-1">
                Bonus Qualification
              </div>
              <p className="text-sm font-medium leading-relaxed">{qual.message}</p>
              {qual.qualified && baseSalary > 0 && (
                <div className="mt-2 text-xs opacity-95">
                  Estimated: <span className="font-bold">{qual.amount.toLocaleString()} Ks</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatBox
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                label="All Done Units"
                value={loading ? "—" : done.toString()}
              />
              <StatBox
                icon={<Target className="h-4 w-4 text-blue-500" />}
                label="Assigned Units"
                value={loading ? "—" : assigned.toString()}
              />
              <StatBox
                icon={<Sparkles className="h-4 w-4 text-amber-500" />}
                label="Performance"
                value={loading ? "—" : `${percent}%`}
              />
              <StatBox
                icon={<Trophy className="h-4 w-4 text-orange-500" />}
                label="Bonus Rate"
                value={`${qual.rate}% Salary`}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white/70 dark:bg-background/60 backdrop-blur-sm px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base font-bold font-display mt-0.5">{value}</div>
    </div>
  );
}

function BeerMug({ percent }: { percent: number }) {
  // SVG beer mug with animated wave fill
  const fillHeight = (percent / 100) * 180; // body inner height 180
  const fillY = 30 + (180 - fillHeight); // body starts y=30, height 180

  return (
    <div className="relative w-[180px] h-[230px] sm:w-[200px] sm:h-[260px]">
      <svg viewBox="0 0 200 240" className="w-full h-full drop-shadow-2xl">
        <defs>
          <linearGradient id="beerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
          </linearGradient>
          <linearGradient id="foamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>
          <clipPath id="mugClip">
            <rect x="30" y="30" width="120" height="180" rx="10" ry="10" />
          </clipPath>
        </defs>

        {/* Handle */}
        <path
          d="M150 70 Q190 80 190 130 Q190 180 150 190"
          fill="none"
          stroke="rgba(180,180,180,0.55)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M150 70 Q190 80 190 130 Q190 180 150 190"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="3"
          strokeLinecap="round"
          transform="translate(-2,-2)"
        />

        {/* Glass body outline */}
        <rect
          x="30"
          y="30"
          width="120"
          height="180"
          rx="10"
          ry="10"
          fill="rgba(255,255,255,0.10)"
          stroke="rgba(180,180,180,0.6)"
          strokeWidth="3"
        />

        {/* Beer fill (clipped to mug) */}
        <g clipPath="url(#mugClip)">
          <rect
            x="30"
            y={fillY}
            width="120"
            height={fillHeight}
            fill="url(#beerGrad)"
            style={{ transition: "y 0.9s ease, height 0.9s ease" }}
          />
          {/* Animated wave on top of beer */}
          {percent > 0 && (
            <g style={{ transition: "transform 0.9s ease" }} transform={`translate(0, ${fillY - 6})`}>
              <path
                d="M0,6 Q15,0 30,6 T60,6 T90,6 T120,6 T150,6 T180,6 T210,6 L210,20 L0,20 Z"
                fill="url(#foamGrad)"
                opacity="0.95"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="-30,0; 0,0; -30,0"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
          )}

          {/* Bubbles */}
          {percent > 5 && (
            <g>
              {[...Array(8)].map((_, i) => {
                const cx = 45 + ((i * 17) % 100);
                const delay = (i * 0.4).toFixed(1);
                const r = 2 + (i % 3);
                return (
                  <circle key={i} cx={cx} cy="200" r={r} fill="rgba(255,255,255,0.7)">
                    <animate
                      attributeName="cy"
                      values={`210; ${fillY + 5}`}
                      dur={`${2.5 + (i % 3)}s`}
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 0.9; 0"
                      dur={`${2.5 + (i % 3)}s`}
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                );
              })}
            </g>
          )}
        </g>

        {/* Glass reflection highlight */}
        <rect
          x="38"
          y="36"
          width="14"
          height="168"
          rx="6"
          fill="url(#glassGrad)"
          opacity="0.7"
          pointerEvents="none"
        />
        <rect
          x="140"
          y="40"
          width="6"
          height="160"
          rx="3"
          fill="rgba(255,255,255,0.35)"
          pointerEvents="none"
        />

        {/* Percent label inside mug */}
        <text
          x="90"
          y="125"
          textAnchor="middle"
          fontSize="28"
          fontWeight="800"
          fill="rgba(255,255,255,0.95)"
          style={{ paintOrder: "stroke", stroke: "rgba(120,60,0,0.55)", strokeWidth: 3 }}
        >
          {Math.round(percent)}%
        </text>
      </svg>
    </div>
  );
}
