# คู่มือการ Deploy (คู่มือการติดตั้งและเผยแพร่เว็บไซต์)

เนื่องจากระบบนี้มีการใช้งาน **FFmpeg.wasm** ซึ่งทำงานบนเบราว์เซอร์ของผู้ใช้ และต้องการฟังก์ชันระดับสูงอย่าง `SharedArrayBuffer` ในการประมวลผลวิดีโอแบบ Multi-threading ทางเบราว์เซอร์จึงมีมาตรการความปลอดภัยสูง โดยกำหนดว่า **เว็บไซต์จะต้องส่ง Headers ความปลอดภัย 2 ตัวนี้เสมอ:**

1. `Cross-Origin-Opener-Policy: same-origin` (COOP)
2. `Cross-Origin-Embedder-Policy: require-corp` (COEP)

หากไม่มี Headers สองตัวนี้ เบราว์เซอร์จะไม่ยอมให้โหลด FFmpeg.wasm และแอปจะไม่สามารถทำงานได้

ด้านล่างนี้คือวิธีการ Deploy บนแพลตฟอร์มต่าง ๆ ที่แนะนำ:

---

## ทางเลือกที่ 1: Deploy บน GitHub Pages (ตรง ๆ ผ่าน GitHub)
เนื่องจาก GitHub Pages เป็น Static Hosting ทั่วไปที่ไม่สามารถตั้งค่า HTTP Headers ได้โดยตรง เราจึงจำเป็นต้องใช้ตัวช่วยในการเลียนแบบ Headers ผ่าน **Service Worker**

### วิธีการทำ:
1. **เพิ่มไฟล์ `coi-serviceworker.js`**:
   ให้ดาวน์โหลดไฟล์ `coi-serviceworker.js` (หรือใช้โค้ดด้านล่างนี้) ไปวางไว้ที่โฟลเดอร์หลักของโปรเจกต์ (คู่กับ `index.html`)

   *โค้ดสำหรับสร้างไฟล์ `coi-serviceworker.js`:*
   ```javascript
   /*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzguidoti/coi-serviceworker */
   if (typeof window === "undefined") {
       self.addEventListener("install", () => self.skipWaiting());
       self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
       self.addEventListener("fetch", e => {
           if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
           e.respondWith(
               fetch(e.request).then(r => {
                   if (r.status === 0) return r;
                   const headers = new Headers(r.headers);
                   headers.set("Cross-Origin-Embedder-Policy", "require-corp");
                   headers.set("Cross-Origin-Opener-Policy", "same-origin");
                   return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
               }).catch(err => console.error(err))
           );
       });
   } else {
       (() => {
           const script = document.currentScript;
           if (window.isSecureContext && "serviceWorker" in navigator) {
               navigator.serviceWorker.register(script.src).then(reg => {
                   reg.addEventListener("updatefound", () => {
                       try {
                           window.location.reload();
                       } catch {}
                   });
                   if (navigator.serviceWorker.controller) {
                       console.log("COI Service Worker Active");
                   } else {
                       window.location.reload();
                   }
               }).catch(err => console.error("COI registration failed", err));
           }
       })();
   }
   ```

2. **เรียกใช้ใน `index.html`**:
   เพิ่มแท็กสคริปต์นี้ในแท็ก `<head>` ของไฟล์ [index.html](file:///c:/Users/usEr/OneDrive/Desktop/work/Do-Subtitle/do-subtitle-webapp/index.html) (แนะนำให้ใส่ไว้บรรทัดแรก ๆ):
   ```html
   <script src="./coi-serviceworker.js"></script>
   ```

3. **อัปโหลดขึ้น GitHub & เปิดใช้งาน GitHub Pages**:
   - Push โค้ดทั้งหมดขึ้น GitHub Repository ของคุณ
   - ไปที่ Repository ของคุณใน GitHub -> **Settings** -> **Pages**
   - ในส่วน **Build and deployment** ให้เลือก Source เป็น **Deploy from a branch**
   - เลือก Branch (เช่น `main` หรือ `master`) และโฟลเดอร์ `/ (root)` แล้วกด **Save**
   - รอ 1-2 นาที คุณจะได้ลิงก์หน้าเว็บสำหรับใช้งานทันที!

---

## ทางเลือกที่ 2: Deploy บน Vercel (แนะนำ - ง่ายที่สุด)
Vercel รองรับการระบุ Headers ผ่านไฟล์การตั้งค่า `vercel.json` ซึ่งมีความเสถียรสูงและไม่ต้องใช้ Service Worker

### วิธีการทำ:
1. สร้างไฟล์ชื่อ `vercel.json` ไว้ที่โฟลเดอร์หลักของโปรเจกต์
2. ใส่โค้ดตั้งค่าดังนี้:
   ```json
   {
     "headers": [
       {
         "source": "/(.*)",
         "headers": [
           {
             "key": "Cross-Origin-Opener-Policy",
             "value": "same-origin"
           },
           {
             "key": "Cross-Origin-Embedder-Policy",
             "value": "require-corp"
           }
         ]
       }
     ]
   }
   ```
3. ทำการ Link GitHub กับ Vercel หรือรันคำสั่ง `vercel deploy` ระบบจะตั้งค่า Headers ให้อัตโนมัติ

---

## ทางเลือกที่ 3: Deploy บน Netlify หรือ Cloudflare Pages
หากคุณใช้งาน Netlify หรือ Cloudflare Pages คุณสามารถกำหนด Headers ผ่านไฟล์ `_headers` ได้โดยตรง

### วิธีการทำ:
1. สร้างไฟล์ชื่อ `_headers` (ไม่มีนามสกุลไฟล์) ไว้ที่โฟลเดอร์หลักของโปรเจกต์
2. ใส่เนื้อหาในไฟล์ดังนี้:
   ```text
   /*
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
   ```
3. Deploy ขึ้น Netlify หรือ Cloudflare Pages ตามขั้นตอนปกติ
