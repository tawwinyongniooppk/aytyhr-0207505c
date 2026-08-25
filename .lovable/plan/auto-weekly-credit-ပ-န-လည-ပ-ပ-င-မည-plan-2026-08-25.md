# Auto Weekly Credit ပြန်လည်ပြုပြင်မည့် Plan

## ရည်ရွယ်ချက်
- Task assignment window ကို **1–3, 8–10, 15–17, 22–24** အဖြစ်ထားပြီး checkpoint ကို **3, 10, 17, 24 ရက် MMT 11:55 PM** တွင်သာ run စေမည်။
- Window အတွင်း task မရသည့် Staff အားလုံးကို checkpoint အချိန်တွင် **+1 All Done Unit**, **My Yearly Bonus +1**, **Bonus 1/4 Auto Addition** တစ်ပြိုင်နက်တည်းရစေမည်။
- ယခင် window မှစပြီး deadline မပြည့်သေးသည့် **2-unit task** တာဝန်ယူထားသူကို ထပ်မံ +1 မပေးဘဲ double-credit ကာကွယ်မည်။

## Root Cause အတည်ပြုချက်
- Live cron schedule သည် လက်ရှိ `7,8,14,15,21,22,28,29` ရက် UTC 17:25 တွင်သာခေါ်နေပြီး user သတ်မှတ်သည့် `3,10,17,24` ရက် မဟုတ်ပါ။ ထို့ကြောင့် **August 24, 2026 MMT 11:55 PM** တွင် job လုံးဝမ run ခဲ့ပါ။
- Function အတွင်း checkpoint တွက်ချက်မှုကလည်း ပုံမှန်လများတွင် slot နောက်ဆုံးရက် +5 (`8,15,22,29`) ဟုထားပြီး လိုအပ်ချက်နှင့် မကိုက်ပါ။ Cron နှင့် function နှစ်ဖက်စလုံးမှ date logic မှားနေခြင်းကြောင့် failure ဖြစ်သည်။
- Status Monitor သည် approved task ကို deadline ကျော်ပြီး နောက်နေ့မှ All Done သို့ရွှေ့သော client-side logic ရှိသဖြင့် checkpoint တိတိကျကျ update ဖြစ်ရန် auto-credit record ၏ deadline/status mapping ကိုလည်း ပြင်ရမည်။

## ပြုပြင်မည့်အရာများ
1. Cron ကို **MMT 23:55 = UTC 17:25**, ရက် `3,10,17,24` တိတိကျကျ run အောင်ပြောင်းမည်။ တစ်လ 4 runs သာရှိမည်။
2. Edge function checkpoint calendar ကို `3,10,17,24` သို့တူညီစေပြီး delayed retry/catch-up ကို idempotent ဖြစ်အောင်ထားမည်။
3. Staff eligibility ကို staff-by-staff စစ်မည်:
   - လက်ရှိ slot အတွင်း assigned task ရှိသူ → no auto-credit
   - ယခင် slot မှ 2-unit task တာဝန်ယူထားပြီး လက်ရှိ slot ကို cover လုပ်နေသူ → no auto-credit
   - အခြား New Task မရသူအားလုံး → +1
4. Assignment, `bonus_transactions`, နှင့် yearly progress/UI count များ တစ်ခုနှင့်တစ်ခု တိတိကျကျကိုက်ညီအောင် update လုပ်မည်။ Transaction date ကို checkpoint ရက်အဖြစ် သိမ်းမည်။
5. **August 22–24** window ကို one-time safe backfill လုပ်ပြီး ရသင့်သူအားလုံးကို +1 unit နှင့် 1/4 bonus ဖြည့်မည်။ Duplicate credit မဖြစ်စေရန် assignment-based idempotency စစ်မည်။
6. Live function deploy ပြီး forced checkpoint test, database records, function logs, Status Monitor/Yearly Bonus/Transaction History data တို့ကို verify လုပ်မည်။

## Run Credit သုံးသပ်ချက်
- Weekly credit job = **4 runs/month** သာဖြစ်မည်။
- Deadline sweep လိုအပ်သော checkpoint များနှင့် အခြားကျန် cron jobs ကို live list အတိုင်းတွက်ပြီး **20 Run Credit အောက်ရှိ/မရှိ** နောက်ဆုံး report တွင် အမှန်တကယ် run count ဖြင့် ဖော်ပြမည်။ မလုံလောက်ပါက မည်သည့် job ကြောင့်ကျော်သည်ကို သီးခြားဖော်ပြမည်။

## ပေးမည့် Report
- Root cause, Aug 24 ထိခိုက်သူ/ပြန်ဖြည့်သူ, before/after schedule, validation results, တစ်လ run ခန့်မှန်းချက်နှင့် Free 20 Run Credit အောက် လုံလောက်မှုကို မြန်မာလို တင်ပြမည်။
