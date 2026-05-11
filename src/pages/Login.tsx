import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "company_logo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setLogoUrl(data.value);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      let msg = error.message;
      if (msg.includes("Invalid login credentials")) {
        msg = "Invalid email or password. Please check and try again.";
      }
      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
    } else {
      navigate("/", { replace: true });
    }
    setLoading(false);
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border border-border shadow-none">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-secondary/10 mx-auto overflow-hidden border border-border">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
              ) : (
                <GraduationCap className="h-8 w-8 text-secondary" />
              )}
            </div>
            <h1 className="text-base md:text-lg font-bold font-display underline underline-offset-4 decoration-2">
              Welcome to Aye Yait Tharyar Smart HR System
            </h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@ayty.com" required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 active:animate-press">
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Contact your IT Manager to create an account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
