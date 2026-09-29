# မြန်မာစာနှင့် Salary Slip Font Fix

## ပြင်ဆင်မည့်အရာ
- App တစ်ခုလုံးတွင် မြန်မာစာအတွက် သင့်တော်သော font fallback ကို ဦးစားပေးပြီး စာလုံးအပေါ်/အောက် အမှတ်များ မပြတ်စေရန် line-height ကို လုံလောက်အောင်ထားမည်။
- ခေါင်းစဉ်၊ Staff Name၊ button၊ badge နှင့် form label များ၏ တင်းကျပ်လွန်းသော စာကြောင်းအမြင့်ကို မြန်မာစာနှင့် လိုက်ဖက်အောင်သာ ပြင်မည်။
- Salary Slip PDF တွင် Staff Name နှင့် Transaction Description ကို ပုံရိပ်ပြောင်းထည့်ရာ၌ glyph bounds အပြည့်ပါစေရန် canvas အပေါ်/အောက်နေရာနှင့် PDF ထဲရှိ image အမြင့်ကို တိုးမည်။
- PDF ရှိ Staff Name ကို အချိုးမပျက်၊ အပေါ်/အောက်မဖြတ်ဘဲ ရှည်လျှင်သာ အကျယ်အလိုက် ချုံ့ပြမည်။ Signature အောက်က Staff Name ကိုလည်း အတူတူပြင်မည်။

## မထိမည့်အရာ
- Salary/Transaction တွက်ချက်မှု၊ data များ၊ permission များနှင့် Download လုပ်ဆောင်ပုံ မပြောင်းပါ။
- Query, API, database, realtime, polling နှင့် data optimization အားလုံး မထိပါ။
- UI layout သို့မဟုတ် feature အသစ် မထည့်ပါ။

## စစ်ဆေးမှု
- မြန်မာ Staff Name အတို/အရှည်နှင့် မြန်မာ Transaction စာကြောင်းများပါသော PDF ကို စမ်းထုတ်ပြီး စာလုံးမပြတ်ခြင်း စစ်မည်။
- Mobile UI တွင် မြန်မာစာပါ ခေါင်းစဉ်၊ label၊ button နှင့် Transaction History ကို စစ်မည်။
- TypeScript, tests နှင့် production build ကို စစ်မည်။

## Technical Details
- Typography-only CSS changes and PDF canvas text rasterization sizing changes.
- No application-data request or business-logic path changes.
