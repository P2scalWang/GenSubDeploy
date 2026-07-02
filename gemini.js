// gemini.js — การเชื่อมต่อกับ OpenRouter API (รองรับทั้งการเขียนสคริปต์, จัดจังหวะซับ และพากย์เสียง TTS)

import {
  SUBTITLE_MAX_CHARS,
  splitSubtitleChunks,
  normalizeSubtitleLines,
  extractSrtPayload,
} from "./subtitles.js";
import { getOpenRouterKey, getSelectedModel } from "./config.js";

const OPENROUTER_API = "https://openrouter.ai/api/v1";

// แปลงไฟล์เป็น Base64
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// ฟังก์ชันเรียก OpenRouter Chat Completions
async function callOpenRouter(payload, timeoutMs = 90000) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("กรุณากรอก OpenRouter API Key ในการตั้งค่าก่อน");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin || "http://localhost:3000",
        "X-Title": "Do-Subtitle Webapp"
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API Error (${res.status}): ${errText}`);
    }

    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted) {
      throw new Error(`การเชื่อมต่อไทม์เอาท์ (${timeoutMs / 1000} วินาที) กรุณาลองใหม่อีกครั้ง`);
    }
    throw e;
  }
}

// พร้อมใช้สำหรับเขียนบทพากย์
const DEFAULT_PROMPT = `คุณคือคอนเทนต์ครีเอเตอร์สายขายของและนักพากย์มืออาชีพสำหรับคลิปสั้นไวรัล (Reels/TikTok) ที่ยอดวิวสูงและปิดการขายได้

งานของคุณ:
1) วิเคราะห์วิดีโออย่างละเอียดก่อนเขียน: ฉากเปิด, การกระทำหลัก, จุดพีค, จุดขาย/ฟีเจอร์ที่เห็น, อารมณ์ และเจตนาของคลิป
2) เลือกแนวพากย์ให้เหมาะกับเนื้อหาจริง (รีวิวสินค้า/สาธิต/ไวรัล/เล่าเรื่อง/ตลก)
3) เขียนบทพากย์ไทยที่ลื่นไหล ฟังธรรมชาติ มีจังหวะ มีพลัง ไม่ท่องแพทเทิร์นเดิม

โครงบทพากย์ที่ดี (สำคัญมาก):
- 3 วินาทีแรก = HOOK ที่ตรึงคนให้หยุดนิ้ว: ตั้งคำถาม/ยิงจุดเจ็บ/ประกาศผลลัพธ์เด็ด (เช่น "ตัดเหล็กขาดในวินาทีเดียว", "ช่างคนไหนยังไม่มีตัวนี้ คือพลาด")
- กลางคลิป = โชว์จุดขาย/ฟีเจอร์จริงที่เห็นในภาพ ทีละจุด กระชับ มีตัวเลข/ของจริงประกอบ
- ท้ายคลิป = CTA กระตุ้นให้อยากได้/รีบสั่ง สั้นๆ ทรงพลัง

โทนและบทพากย์:
- พูดสั้นตรง ใช้งานจริง ไม่แข็ง ไม่อ่านโฆษณา
- เปิดด้วยปัญหาที่คนดูเจอจริง
- เล่าเป็นประโยคต่อเนื่องที่กระชับไหลตามภาพ
- ห้ามขึ้นต้นด้วยคำว่า "สวัสดี"
- บทต้องจบเป็นประโยคที่สมบูรณ์ ไม่ตัดห้วนค้างคา

⚠️ ข้อกำหนดเรื่องความสอดคล้องของคำบรรยาย (CRITICAL SYNC RULES):
1) ข้อความใน subtitle_lines ทุกบรรทัด เมื่อนำมาต่อกัน ต้องสะกดตรงกับบทพากย์ใน thai_script ทุกคำพูดเป๊ะ ห้ามตัดทอนคำ ห้ามย่อความ ห้ามตัดคำทิ้ง และห้ามเขียนคำบรรยายคนละเวอร์ชันกับเสียงพากย์เด็ดขาด!
2) เสียงพูดพากย์คำไหน ซับไตเติลต้องแสดงคำนั้นแบบตรงตัวอักษร เพื่อให้เสียงพากย์และซับตรงกัน 100%

ตอบกลับเป็นข้อมูล JSON ในรูปแบบนี้เท่านั้น (ห้ามมีคำพูดอธิบายอื่นนอกจากก้อน JSON):
{
  "thai_script": "บทพากย์ภาษาไทยที่ตรงกับวิดีโอจริง (ไม่ต้องมีดอกจัน)",
  "subtitle_lines": ["วลีซับสั้น 1", "วลีซับสั้น 2", "..."],
  "hook": "ข้อความฮุคสั้นๆ ไม่เกิน 22 ตัวอักษร ค้างหัวคลิปดึงให้คนหยุดดู",
  "title": "แคปชั่นโพสต์เต็ม มี hook + จุดขาย + CTA + อิโมจิ (1-3 บรรทัด)",
  "hashtags": ["หินเจียรไร้สาย", "เครื่องมือช่าง", "ของมันต้องมี", "..."]
}`;

function buildScriptPrompt(duration, minChars, maxChars, styleHint) {
  const styleStr = styleHint ? `\nสไตล์เพิ่มเติมจากผู้ใช้งาน: ${styleHint}` : "";
  return `${DEFAULT_PROMPT}
${styleStr}

⏱️ ความยาววิดีโอ ${duration.toFixed(1)} วินาที
⚠️ ความยาวสคริปต์รวม (thai_script) ควรพอดีกับเวลา คือประมาณ ${minChars}-${maxChars} ตัวอักษร
⚠️ subtitle_lines ต้องสอดคล้องและตรงตามคำพากย์ของ thai_script ทุกตัวอักษร ห้ามตัดคำและห้ามย่อคำ ความยาว 8-16 ตัวอักษรต่อบรรทัด ไม่มีอิโมจิ`;
}

export async function geminiScript({ base64Images, duration, styleHint }) {
  const model = getSelectedModel();
  const maxChars = Math.min(Math.floor(duration * 10), 800);
  const minChars = Math.max(Math.floor(duration * 7), 80);
  const promptText = buildScriptPrompt(duration, minChars, maxChars, styleHint);

  const contentArray = [
    {
      type: "text",
      text: promptText
    }
  ];

  // เพิ่มแต่ละเฟรมของวิดีโอเข้าไปในลักษณะรูปภาพ
  if (Array.isArray(base64Images)) {
    base64Images.forEach((base64) => {
      contentArray.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64}`
        }
      });
    });
  }

  const payload = {
    model: model,
    messages: [
      {
        role: "user",
        content: contentArray
      }
    ]
  };

  const response = await callOpenRouter(payload);
  const rawText = response.choices?.[0]?.message?.content ?? "";

  let parsed = {};
  try {
    parsed = JSON.parse(rawText.trim());
  } catch (e) {
    // กรณีโมเดลลืมตอบใน JSON หรือตัดแท็ก markdown ออก
    const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(clean);
  }

  const script = (parsed.thai_script || "").toString();
  let subtitleLines = Array.isArray(parsed.subtitle_lines)
    ? parsed.subtitle_lines.map((s) => String(s).trim()).filter(Boolean)
    : [];

  // ตรวจสอบคุณภาพความสอดคล้องระหว่างข้อความซับและบทพากย์จริง (Word parity safeguard)
  const scriptClean = script.replace(/[^ก-๙a-zA-Z0-9]/g, "");
  const subsClean = subtitleLines.join("").replace(/[^ก-๙a-zA-Z0-9]/g, "");
  const diffRatio = Math.abs(scriptClean.length - subsClean.length) / Math.max(1, scriptClean.length);

  // ถ้าตัวอักษรของซับเทียบกับบทพากย์ต่างกันเกิน 15% (AI สรุปย่อคำพากย์ หรือเขียนซับตกหล่น) หรือไม่มีซับส่งมา
  // ให้ยกเลิกซับของ AI และใช้การตัดแบ่งบทพากย์ตรงตัว (Thai Word Segmentation) ทันที เพื่อป้องกันคำหล่นหาย 100%
  if (diffRatio > 0.15 || !subtitleLines.length) {
    console.log(`[gemini] ซับไตเติลคลาดเคลื่อนจากบทพากย์ ${(diffRatio * 100).toFixed(1)}% -> เปลี่ยนไปแบ่งประโยคตรงจากบทพากย์ดั้งเดิมแทน`);
    subtitleLines = splitSubtitleChunks(script, SUBTITLE_MAX_CHARS);
  } else {
    subtitleLines = normalizeSubtitleLines(subtitleLines, SUBTITLE_MAX_CHARS);
  }

  const hook = (parsed.hook || "").toString().trim().slice(0, 40);
  const captionText = (parsed.title || "").toString().trim();
  const tags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((t) => String(t).trim().replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean)
    : [];
  const hashtagLine = tags.length ? tags.map((t) => "#" + t).join(" ") : "";
  const title = captionText + (hashtagLine ? "\n\n" + hashtagLine : "");

  return { script, title, caption: captionText, hashtags: tags, subtitleLines, hook };
}

// ---- OpenRouter Audio TTS (Text-To-Speech) ----
export async function geminiTTS({ script, voice }) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("กรุณากรอก OpenRouter API Key ในการตั้งค่าก่อน");
  }

  // ส่งชื่อเสียงของ Gemini (เช่น Kore, Puck, Charon) ตรงๆ ไปยัง API ของ OpenRouter
  const voiceName = voice || "Kore";

  try {
    const res = await fetch(`${OPENROUTER_API}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        input: script,
        voice: voiceName
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter TTS Error (${res.status}): ${errText}`);
    }

    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (e) {
    throw new Error(`สร้างเสียงพากย์ TTS ล้มเหลว: ${e.message}`);
  }
}

// ---- SRT synced to the generated dub audio ----
export async function geminiSrtFromAudio({ base64Wav, subtitleLines, duration }) {
  const model = getSelectedModel();
  const lines = normalizeSubtitleLines(subtitleLines, SUBTITLE_MAX_CHARS);
  const linesText = lines.length
    ? lines.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(ไม่มี subtitle_lines)";

  const d = Math.max(1, duration);
  const promptText = `ให้ฟังไฟล์เสียงพากย์ภาษาไทยนี้ แล้วสร้างไฟล์ซับ .srt ที่ตรงกับจังหวะเสียงพูดจริง
ข้อบังคับเด็ดขาด:
1) ใช้ข้อความซับจากรายการด้านล่างให้ครบทุกบรรทัด เรียงตามลำดับเดิม
2) แต่ละบรรทัดในรายการ = 1 บล็อกซับ "หนึ่งบล็อกต่อหนึ่งบรรทัด" ห้ามแยกบรรทัดเดียวออกเป็นหลายบล็อก ห้ามตัดคำ ห้ามรวมหลายบรรทัดเป็นบล็อกเดียว
3) ห้ามเปลี่ยน/เพิ่ม/ลด/สลับตัวอักษรในแต่ละบรรทัด — ต้องเหมือนเป๊ะ
4) คืน SRT ล้วนๆ (ไม่มี markdown), เริ่ม 00:00:00,000, จบไม่เกิน ${d.toFixed(3)} วินาที, timecode เรียงต่อเนื่องไม่ย้อนเวลา
5) งานของคุณคือ "จับเวลา" ให้แต่ละบรรทัด ไม่ใช่แก้ข้อความ

รายการซับที่ต้องใช้ (${lines.length} บรรทัด — ต้องได้ ${lines.length} บล็อก):
${linesText}`;

  const payload = {
    model: model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptText
          },
          {
            type: "input_audio",
            input_audio: {
              data: base64Wav,
              format: "wav"
            }
          }
        ]
      }
    ]
  };

  const response = await callOpenRouter(payload);
  const rawSrt = extractSrtPayload(response.choices?.[0]?.message?.content ?? "");
  return realignSrtToLines(rawSrt, lines, d);
}

function realignSrtToLines(rawSrt, lines, maxDur) {
  const times = [];
  const re = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
  let m;
  while ((m = re.exec(rawSrt)) !== null) {
    times.push([m[1], m[2]]);
  }
  if (times.length !== lines.length) return ""; // คืนเป็นค่าว่างเพื่อให้ระบบนำ deterministic fallback ไปรันแทน
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    out += `${i + 1}\n${times[i][0]} --> ${times[i][1]}\n${lines[i]}\n\n`;
  }
  return out;
}
