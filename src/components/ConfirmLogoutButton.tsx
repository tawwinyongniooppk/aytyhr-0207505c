import { LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ConfirmLogoutButton({ className, iconClassName = "h-4 w-4", onConfirmed }: {
  className: string;
  iconClassName?: string;
  onConfirmed?: () => void;
}) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <LogOut className={iconClassName} /><span>Logout</span>
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of AYTY Smart HR?</AlertDialogTitle>
            <AlertDialogDescription>မှားနှိပ်မိခြင်း မဟုတ်ကြောင်း အတည်ပြုပြီးမှ ဤစက်မှ အကောင့်ကို Log out လုပ်ပါမည်။</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onConfirmed?.(); void signOut(); }}>Yes, log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}