import React, { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  className?: string;
  variant?: "default" | "bottom-nav";
  onLogout?: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  className, 
  variant = "default",
  onLogout 
}) => {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    setOpen(false);
    if (onLogout) onLogout();
    await signOut();
  };

  const content = variant === "bottom-nav" ? (
    <>
      <LogOut className="h-5 w-5" />
      <span>Logout</span>
    </>
  ) : (
    <>
      <LogOut className="h-4 w-4" />
      <span>Logout</span>
    </>
  );

  const baseStyles = variant === "bottom-nav" 
    ? "flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors flex-1 min-w-[3rem] shrink-0"
    : "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button className={cn(baseStyles, className)}>
          {content}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to log out of your account?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Logout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
