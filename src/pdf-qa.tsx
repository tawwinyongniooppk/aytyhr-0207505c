import React from "react";
import { createRoot } from "react-dom/client";
import SignatureSlipDialog from "@/components/SignatureSlipDialog";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <SignatureSlipDialog
    open
    onOpenChange={() => undefined}
    staffName="ပြည့်ဖြိုးကျော်"
    monthStartISO="2026-09-01"
    baseSalary={400000}
    totalBonus={100000}
    totalAdditions={0}
    totalDeductions={25000}
    finalSalary={475000}
    ledger={[
      { date: "2026-09-01", type: "salary", description: "Base salary (September 2026)", amount: 400000 },
      { date: "2026-09-03", type: "bonus", description: "Auto Weekly Credit — Week 1 • အပတ်စဉ်တာဝန် အချိန်မီပြီးစီး၍ အတည်ပြုပြီး", amount: 25000 },
      { date: "2026-09-10", type: "bonus", description: "Auto Weekly Credit — Week 2 • သင်ကြားရေးအစီအစဉ် ပြီးစီးမှုဆုကြေး", amount: 25000 },
      { date: "2026-09-15", type: "bonus", description: "ဝန်ထမ်းတာဝန် ပြီးမြောက်မှု — Submitted and Approved", amount: 25000 },
      { date: "2026-09-27", type: "deduction", description: "ခွင့်မဲ့ပျက်ကွက်မှုအတွက် လစာမှ ဖြတ်တောက်ခြင်း", amount: -25000 },
    ]}
    yearly={{ assigned: 18, done: 18, percent: 100, rate: 100, baseSalary: 400000, basePortion: 400000, bonusAmount: 100000, total: 500000, cycleLabel: "Jun 2026 — May 2027", loading: false }}
    leaveBalance={8}
  />,
);