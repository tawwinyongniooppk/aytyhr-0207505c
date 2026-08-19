# Device-specific Login Recovery Plan

## အတည်ပြုပြီးသော Root Cause

- Lovable Cloud backend နှင့် database သည် ပုံမှန်အလုပ်လုပ်နေပြီး resource ပြဿနာ မရှိပါ။
- Published URL သည် နောက်ဆုံး login fallback (`fetch` → `XMLHttpRequest` → session-save timeout) ပါသော build ကို လက်ရှိ serve လုပ်နေပါသည်။
- အလုပ်လုပ်သည့် device တစ်လုံးတွင် account အားလုံးဝင်နိုင်သောကြောင့် account, password သို့မဟုတ် role data ပြဿနာ မဟုတ်ပါ။
- Fail ဖြစ်သော device များ၏ login attempt များသည် backend Auth log ထဲ မရောက်ပါ။ Screenshot နှစ်ခုတွင် error မတူခြင်းသည် device တစ်လုံးက အဟောင်း build message၊ နောက်တစ်လုံးက နောက်ဆုံး fallback message ရထားခြင်းဖြစ်သည်။
- App service worker သည် same-origin app files ကိုသာ ကိုင်တွယ်နိုင်ပြီး cross-origin Auth request ကို intercept မလုပ်နိုင်ပါ။ ထို့ကြောင့် PWA URL ပြောင်းခြင်းက login network path ကို မပြောင်းပေးနိုင်ပါ။
- လက်ရှိ evidence အရ fail ဖြစ်ရာနေရာသည် phone/browser/ISP မှ backend Auth domain သို့ သွားသည့် DNS/network path ဖြစ်သည်။ Backend screenshot ပို့ရန် မလိုပါ။

## ပြင်ဆင်မည့်အချက်များ

1. **Login flow ကို deterministic ဖြစ်အောင် ရှင်းလင်းမည်**
   - ထပ်နေသော long timeout များကိုဖယ်ပြီး login တစ်ကြိမ်လုံးအတွက် အချိန်ကန့်သတ်ချက်တစ်ခုတည်းထားမည်။
   - Double submit နှင့် stale pending request များကို abort လုပ်မည်။
   - Token ရပြီး session save အောင်မြင်မှသာ redirect လုပ်မည်။

2. **Auth connectivity ကို login မတိုင်မီ တိတိကျကျခွဲစစ်မည်**
   - Auth health endpoint ကို short probe ဖြင့်စစ်ပြီး `backend reachable`, `DNS/network blocked`, `request timeout`, `invalid credentials`, `session storage failure` ကို သီးခြားခွဲမည်။
   - User အား generic error မပေးဘဲ ဖြစ်နေသည့်အဆင့်အလိုက် တစ်မျိုးတည်းသော actionable message ပေးမည်။

3. **PWA stale-version အကျိုးသက်ရောက်မှုကို ဖယ်ရှားမည်**
   - Login route တွင် app-shell service worker/cache အဟောင်းရှိလျှင် အလိုအလျောက် cleanup လုပ်ပြီး current app shell ကိုသာ အသုံးပြုစေမည်။
   - Push notification worker ကို မထိခိုက်စေဘဲ app-shell worker ကိုသာ scope တိတိကျကျကိုင်တွယ်မည်။
   - Published build version ကို login screen တွင် diagnostic-only အနေဖြင့် ခွဲသိနိုင်အောင် ထည့်မည် (ပုံမှန် UI ကို မရှုပ်စေပါ)။

4. **Device/ISP block ဖြစ်ပါက တကယ်ဖြေရှင်းနိုင်သည့်လမ်းကို ပေးမည်**
   - Probe က Auth domain မရောက်ကြောင်း အတည်ပြုပါက PWA URL ပြောင်းရန် မညွှန်ဘဲ Android Private DNS (`dns.google` သို့ `one.one.one.one`) သို့မဟုတ် အခြား network ဖြင့် စမ်းရန် တိကျသောအဆင့်တို ပေးမည်။
   - Network နှစ်မျိုးလုံးတွင် Auth domain ပိတ်နေပါက static frontend code တစ်ခုတည်းဖြင့် ကျော်လွှားမရသောကြောင့် same-origin secure auth relay/custom backend domain လိုအပ်ကြောင်း သီးခြားဆုံးဖြတ်မည်။ Relay မလိုမချင်း backend infrastructure အသစ် မတည်ဆောက်ပါ။

## Verification

- Published URL တွင် current bundle, manifest, service worker version တူညီမှု စစ်မည်။
- Valid/invalid login, offline, blocked Auth endpoint, slow response, session-storage timeout တို့ကို automated browser tests ဖြင့် စစ်မည်။
- Working device နှင့် failing-device network condition ကို ပြန်လည်တူအောင် simulate လုပ်ပြီး Sign In button သည် အမြဲပြန်အသုံးပြုနိုင်ခြင်း၊ error တစ်မျိုးတည်းဖြင့် root cause မှန်ကန်စွာပြခြင်းကို အတည်ပြုမည်။
- Fix ပြီးနောက် Burmese root-cause/solution report တိုတောင်းစွာပေးမည်။

## မလုပ်သင့်သေးသောအရာ

- PWA URL မပြောင်းပါနှင့်။
- Backend settings screenshot သို့ private key မပို့ပါနှင့်။
- Backend restart, database migration, account/password reset မလုပ်ပါနှင့်—လက်ရှိ evidence နှင့် မသက်ဆိုင်ပါ။
