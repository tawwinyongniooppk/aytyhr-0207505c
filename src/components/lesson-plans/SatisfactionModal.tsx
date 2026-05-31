import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOk: () => void;
  onRetry: () => void;
}

export function SatisfactionModal({ open, onOk, onRetry }: Props) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>အဆင်ပြေပါသလား?</DialogTitle>
          <DialogDescription>
            ဖိုင်ကို Download လုပ်ပြီးပါပြီ။ အဆင်ပြေပါက “အဆင်ပြေတယ်” ကိုနှိပ်ပါ — ပုံစံ Format မှလွဲ၍ ဖြည့်ထားသမျှ စာများကို ဖျက်ပစ်ပါမည်။
            အဆင်မပြေသေးပါက ပြန်ပြင်နိုင်ပါသည်။
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onRetry}>အဆင်မပြေဘူး</Button>
          <Button onClick={onOk}>အဆင်ပြေတယ်</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
