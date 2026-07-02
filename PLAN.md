# Do-Subtitle Webapp — แผนการทำงาน (ปรับปรุงใหม่สำหรับใช้ส่วนตัว)

> **เวอร์ชัน:** 1.1.0-webapp-personal
> **วันที่สร้าง:** 2026-07-02
> **ที่มา:** Redesign จาก Chrome Extension `extension-beta-2026-06-29` สำหรับการใช้งานส่วนตัวบนมือถือและคอมพิวเตอร์โดยตรง

---

## วิเคราะห์โปรเจกต์เดิม (Extension)

### โครงสร้างโปรเจกต์เดิม
- ใช้ Chrome Extension MV3 เพื่อดึง Facebook token และยิง API โพสต์ขึ้นเพจ
- ใช้ Google Login (OAuth) เพื่อตรวจสอบการใช้งานระบบสมาชิก (Membership)
- ใช้ IndexedDB บันทึกประวัติ

### ปัญหาเมื่อปรับเป็น Webapp & ใช้บนมือถือ
1. **การดึง Facebook token**: Mobile browser ไม่สามารถรัน Extension เพื่อ inject Script ดึง token ได้
2. **ระบบสมาชิก**: ไม่มีความจำเป็นเนื่องจากเป็นการใช้ส่วนตัว
3. **การเข้าถึง AI**: ใช้ **OpenRouter API Key** ตัวเดียวในการจัดการ AI ทั้งหมด (เขียนบท, พากย์เสียง TTS, จัดเวลาซับ SRT) ทำให้ปลอดภัยและไม่ต้องมีระบบ Login

---

## เป้าหมาย Webapp ใหม่

### แนวคิดการออกแบบใหม่
- **Dark Mode Premium** — สีดำเงา (Glassmorphism panels, dark gradient background)
- **Mobile-First Responsive** — ออกแบบสำหรับหน้าจอมือถือโดยเฉพาะ โดยเน้นการจัดวางในแนวตั้งที่เหมาะสมกับวิดีโอแนวตั้ง (Reels/TikTok)
- **OpenRouter Key Setup** — หน้าต่างใส่ API Key ของ OpenRouter เองโดยตรง เก็บไว้ใน local storage ปลอดภัยและสะดวกที่สุด
- **Clean Pipeline** — อัปโหลดวิดีโอ -> AI วิเคราะห์รูปและเขียนบท -> AI สร้างเสียงพากย์ TTS (ผ่าน OpenRouter API) -> Sync ซับอัตโนมัติ -> Merge & Burn ซับด้วย ffmpeg.wasm -> ดาวน์โหลดเสร็จสมบูรณ์

### สิ่งที่ไม่ใส่ใน Webapp รุ่นนี้
- ระบบต่ออายุสมาชิก / QR PromptPay
- ระบบ Login Google
- ระบบ Auto-Post ขึ้น Facebook

---

## โครงสร้าง Webapp ใหม่

```
do-subtitle-webapp/
├── PLAN.md                 แผนการทำงาน (ไฟล์นี้)
├── DEPLOY.md               คู่มือการ Deploy (GitHub Pages, Vercel, Netlify, Cloudflare)
├── .gitignore              ไฟล์ระบุรายการที่ไม่ต้องการเก็บใน Git
├── vercel.json             ไฟล์ตั้งค่าความปลอดภัยสำหรับ Vercel
├── index.html              หน้าหลักเว็บแอป
├── styles.css              CSS ตกแต่ง (Dark Mode Premium)
├── app.js                  Logic หลักและจัดการ pipeline
├── gemini.js               ตัวเรียก OpenRouter API (Script, TTS, SRT Sync)
├── subtitles.js            SRT/ASS text helpers
├── audio-sync.js           PCM duration และ subtitle sync
├── ffmpeg-helpers.js       FFmpeg.wasm helpers
├── config.js               จัดการ API Key ใน LocalStorage
├── fonts/
│   ├── Mitr-Bold.ttf
│   ├── NotoSansThai-Var.ttf
│   └── Sarabun-Bold.ttf
├── music/
│   ├── bgm1.mp3
│   ├── bgm2.mp3
│   └── bgm3.mp3
└── vendor/
    ├── ffmpeg.js
    ├── ffmpeg-core.js
    ├── ffmpeg-core.wasm
    └── util.js
```

---

## ขั้นตอนการทำงาน (Pipeline Flow)

```
User Upload Video (mp4/mov)
       |
[Step 1] Load ffmpeg.wasm (ทำงานบนเครื่องผู้ใช้)
       |
[Step 2] Ingest video -> ffmpeg FS
       |
[Step 3] AI Analyze -> OpenRouter (Gemini Model) เขียนบทพากย์ไทย
       |
[Step 4] TTS -> OpenRouter Speech API (Gemini TTS Model) สร้างไฟล์เสียง PCM
       |
[Step 5] Adjust audio length (ยืดวิดีโอหรือเพิ่มความยาวเสียงให้จังหวะพอดี)
       |
[Step 6] SRT Sync -> OpenRouter (Gemini Model) คำนวณเวลาเริ่มต้น-สิ้นสุดของซับ
       |
[Step 7] Merge video + audio + BGM (ffmpeg)
       |
[Step 8] Burn subtitles -> ฝังซับไตเติลภาษาไทยลงวิดีโอ (Mitr-Bold.ttf)
       |
[Done!] ดาวน์โหลดผลลัพธ์ลงมือถือ/คอมพิวเตอร์ พร้อมก็อปปี้แคปชัน
```

---

## แผนการพัฒนาที่เหลือ
- [x] index.html (โครงสร้างเว็บ)
- [x] styles.css (หน้าตาสุดพรีเมียม)
- [ ] config.js (จัดการ API Key ใน LocalStorage)
- [ ] gemini.js (ปรับไปยิงผ่าน OpenRouter API)
- [ ] app.js, subtitles.js, audio-sync.js, ffmpeg-helpers.js (ปรับปรุงให้สอดคล้องกัน)
- [ ] คัดลอกโฟลเดอร์ fonts, music และ vendor จาก extension เดิมเข้าสู่ webapp
- [ ] ทดสอบการทำงานบน Browser และมือถือ
เดิม
- [x] ออกแบบ design system ใหม่ (dark mode)
- [x] สร้าง PLAN.md

### Phase 2 — Core Files (เสร็จแล้ว)
- [x] styles.css — design tokens + component styles (Dark Mode Premium)
- [x] index.html — structure, layout, modals (ไม่มี membership/login)
- [x] config.js — ปรับ: จัดการ OpenRouter API Key ใน LocalStorage
- [x] Port module files (gemini.js, subtitles.js, audio-sync.js, ffmpeg-helpers.js)

### Phase 3 — Main Logic & Local Server (เสร็จแล้ว)
- [x] app.js — pipeline จัดการวิดีโอ, จัดจังหวะซับ, และดาวน์โหลดผลลัพธ์
- [x] OpenRouter Key Integration สำหรับเรียกเขียนบทและ TTS
- [x] server.js — พัฒนา Node.js Local Server เพื่อส่ง COOP/COEP HTTP headers
- [x] IndexedDB History สำหรับบันทึกประวัติวิดีโอใน Browser หน้าเว็บ


### Phase 4 — Assets (เสร็จแล้ว)
- [x] Copy fonts จาก extension
- [x] Copy music จาก extension
- [x] Copy vendor (ffmpeg.wasm, util.js, qrcode.js) จาก extension

### Phase 5 — Polish
- [ ] Test pipeline ครบ
- [ ] Responsive mobile
- [ ] Error handling + retry UI

---

## Key Technical Decisions

### Google Login
- Extension เดิมใช้ chrome.identity.launchWebAuthFlow ไม่ได้ใน webapp
- Webapp ใหม่ใช้ Google Identity Services (GIS) accounts.google.com/gsi/client
- ได้ credential (id_token JWT) แล้วส่งไป worker เหมือนเดิม

### Chrome Storage -> localStorage
- chrome.storage.local ใช้ไม่ได้ใน webapp
- ใช้ localStorage แทน (token, voice, model settings)
- Token จะหลุดเมื่อ session หมด — ต้อง login ใหม่

### IndexedDB History
- ยังใช้ IndexedDB เหมือนเดิม — ใช้ได้ใน webapp
- เก็บ blob วิดีโอในเครื่อง ไม่ต้องอัปขึ้น server

### CORS / CSP
- Extension มี CSP เข้มงวด → Webapp ผ่อนปรนกว่า
- ffmpeg.wasm ต้อง SharedArrayBuffer → ต้องเซิร์ฟผ่าน HTTPS พร้อม headers:
  - Cross-Origin-Opener-Policy: same-origin
  - Cross-Origin-Embedder-Policy: require-corp

---

## วิธีรัน

```bash
# ต้องรันผ่าน local server (ไม่ใช่ file://) เพราะ SharedArrayBuffer ต้องการ HTTPS/localhost
# ใช้ VS Code Live Server หรือ:
npx serve . -p 3000
# หรือ
python -m http.server 3000
```

เปิดผ่าน http://localhost:3000 — SharedArrayBuffer ไม่ทำงานบน file://

---

## Notes

- Worker URL: https://clip-gemini-proxy.lungnuek.workers.dev
- Google Client ID: 1090218759412-17gb7iq3cept4eo76mj9tlj8u71eki9e.apps.googleusercontent.com
- ffmpeg.wasm: ใช้จาก vendor/ ของ extension เดิม
- เสียงพากย์: Gemini TTS — gemini-2.5-flash-preview-tts
- AI Script/SRT: gemini-2.5-flash
