import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { BadgeCheck, Mail, Phone, Calendar, Clock, Hash, GraduationCap, Loader2 } from "lucide-react";

export default function MyIdPage() {
  const { profile, loading } = useProfile();
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return <p className="text-muted-foreground">No profile found.</p>;
  }

  const initials = (profile.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-primary" /> My ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="h-20 w-20 rounded-full object-cover border-2 border-primary/20"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {initials}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{profile.full_name}</h2>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="secondary" className="capitalize">{profile.role}</Badge>
                {profile.class && <Badge variant="outline">{profile.class}</Badge>}
                {typeof profile.sequence === "number" && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Hash className="h-3 w-3" /> {profile.sequence}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="Email" value={user?.email ?? "—"} />
            <InfoRow icon={Phone} label="Phone" value={profile.phone || "—"} />
            <InfoRow icon={Calendar} label="Join Date" value={profile.join_date || "—"} />
            <InfoRow icon={Clock} label="Check-in" value={profile.check_in_time} />
            <InfoRow icon={Clock} label="Check-out" value={profile.check_out_time} />
            <InfoRow icon={GraduationCap} label="Work Day" value={profile.work_day} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
