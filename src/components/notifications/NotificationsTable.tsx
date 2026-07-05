import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, Edit, Loader2, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { NotificationRow } from "./NotificationComposer";

type Row = NotificationRow & { sent_count: number; failed_count: number; sent_at: string | null; created_at: string; last_error: string | null };

const AUDIENCE_LABEL: Record<Row["audience"], string> = {
  all: "All Users",
  admins: "Admins & Assistants",
  staff: "Staff",
  it_managers: "IT Managers",
  specific: "Specific",
};

const STATUS_VARIANT: Record<Row["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  sent: { label: "Sent", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

interface Props {
  onEdit: (row: NotificationRow) => void;
  refreshToken: number;
}

export function NotificationsTable({ onEdit, refreshToken }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "draft" | "scheduled" | "sent">("all");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load notifications");
    setRows(((data ?? []) as unknown as Row[]));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [refreshToken]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  const duplicate = async (row: Row) => {
    const { error } = await supabase.from("notifications").insert({
      title: `${row.title} (copy)`,
      body: row.body,
      banner_url: row.banner_url,
      icon_key: row.icon_key,
      layout: row.layout,
      action_type: row.action_type,
      action_target: row.action_target,
      audience: row.audience,
      audience_user_ids: row.audience_user_ids,
      status: "draft",
      created_by: (await supabase.auth.getUser()).data.user!.id,
    });
    if (error) toast.error(error.message);
    else toast.success("Duplicated as draft");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Deleted");
  };

  const sendNow = async (id: string) => {
    setSendingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-notification", { body: { notification_id: id } });
      if (error) throw error;
      const j = data as { ok?: boolean; sent?: number; error?: string };
      if (j.ok) toast.success(`Sent to ${j.sent} device${j.sent === 1 ? "" : "s"}`);
      else toast.error("Dispatch failed", { description: j.error ?? "no devices reached" });
    } catch (e) {
      toast.error("Send failed", { description: (e as Error).message });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">Templates, Drafts & Scheduled</CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No notifications here yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled / Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const badge = STATUS_VARIANT[row.status];
                  const when = row.status === "sent"
                    ? row.sent_at ? format(new Date(row.sent_at), "PP p") : "—"
                    : row.status === "scheduled"
                      ? row.scheduled_at ? format(new Date(row.scheduled_at), "PP p") : "—"
                      : format(new Date(row.created_at), "PP p");
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-[200px]">
                        <div className="font-medium truncate">{row.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{row.body}</div>
                        {row.status === "sent" && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Delivered: {row.sent_count} · Failed: {row.failed_count}
                            {row.last_error ? ` · ${row.last_error}` : ""}
                          </div>
                        )}
                        {row.status === "failed" && row.last_error && (
                          <div className="text-[11px] text-destructive mt-0.5">{row.last_error}</div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{AUDIENCE_LABEL[row.audience]}</TableCell>
                      <TableCell><Badge className={badge.className} variant="secondary">{badge.label}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{when}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          {(row.status === "draft" || row.status === "scheduled" || row.status === "failed") && (
                            <Button size="icon" variant="ghost" title="Send now" disabled={sendingId === row.id} onClick={() => sendNow(row.id)}>
                              {sendingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => onEdit(row)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate(row)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" title="Delete" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this notification?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(row.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
