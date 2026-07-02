// Subtitle helpers — สำหรับจัดแต่ง จัดเวลา ป้องกันสระจม และลบอิโมจิที่ฟอนต์ไทยไม่รองรับ

export const SUBTITLE_MAX_CHARS = 16;

// ---- time formatting ----
export function formatSrtTime(t) {
  t = Number.isFinite(t) ? Math.max(0, t) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.min(999, Math.round((t - Math.floor(t)) * 1000));
  const p = (n, w) => String(n).padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(ms, 3)}`;
}

export function srtSpanSeconds(srt) {
  let min = Infinity, max = -Infinity;
  const re = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
  let m;
  while ((m = re.exec(srt)) !== null) {
    const t0 = parseSrtTime(m[1]);
    const t1 = parseSrtTime(m[2]);
    if (t0 < min) min = t0;
    if (t1 > max) max = t1;
  }
  return min === Infinity ? 0 : (max - min);
}

function parseSrtTime(str) {
  const t = str.trim().replace(",", ".");
  const parts = t.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(parseFloat);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function graphemes(str) {
  try {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    return [...seg.segment(str)].map((s) => s.segment);
  } catch {
    return [...str]; // fallback
  }
}

export function splitSubtitleChunks(text, maxLen = 16) {
  const words = thaiWords(text);
  const chunks = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + w : w;
    if (graphemes(test).length <= maxLen) {
      current = test;
    } else {
      if (current) chunks.push(current);
      current = w;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function normalizeSubtitleLines(lines, maxLen = 16) {
  if (!Array.isArray(lines)) return [];
  const out = [];
  for (const line of lines) {
    const clean = stripEmoji(line);
    if (!clean) continue;
    if (graphemes(clean).length <= maxLen) {
      out.push(clean);
    } else {
      out.push(...splitSubtitleChunks(clean, maxLen));
    }
  }
  return out;
}

function stripEmoji(str) {
  return normalizeThaiSpacing(String(str)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim());
}

export function normalizeThaiSpacing(str) {
  let out = String(str || "").replace(/\s+/g, " ").trim();
  if (!out) return "";
  let prev;
  do {
    prev = out;
    out = out.replace(/([\p{Script=Thai}])\s+([\p{Script=Thai}])/gu, "$1$2");
  } while (out !== prev);
  return out.replace(/\s{2,}/g, " ").trim();
}

function thaiWords(text) {
  const clean = stripEmoji(text);
  try {
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    return [...seg.segment(clean)].map((s) => s.segment).filter(Boolean);
  } catch {
    return clean.split(/(\s+)/).filter(Boolean);
  }
}

export function extractSrtPayload(text) {
  const t = String(text || "");
  const start = t.indexOf("1\n00:");
  if (start >= 0) return t.slice(start);
  return t;
}

export function buildSrtFromSegments(segments, maxLen = 16) {
  let srt = "";
  segments.forEach((seg, idx) => {
    const t0 = formatSrtTime(seg.start);
    const t1 = formatSrtTime(seg.start + seg.dur);
    srt += `${idx + 1}\n${t0} --> ${t1}\n${seg.text}\n\n`;
  });
  return srt;
}

export function normalizeSrtBlocks(srt, maxDur) {
  let blocks = [];
  const raw = String(srt || "").trim().split(/\n\s*\n/);
  let idx = 1;
  for (const block of raw) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const textLines = lines.slice(2).join(" ");
    const m = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!m) continue;
    let t0 = parseSrtTime(m[1]);
    let t1 = parseSrtTime(m[2]);
    if (t0 > maxDur) continue;
    if (t1 > maxDur) t1 = maxDur;
    if (t1 - t0 < 0.2) t1 = t0 + 0.2;
    blocks.push({ index: idx++, start: t0, end: t1, text: textLines });
  }
  let out = "";
  for (const b of blocks) {
    out += `${b.index}\n${formatSrtTime(b.start)} --> ${formatSrtTime(b.end)}\n${b.text}\n\n`;
  }
  return out;
}

export function srtQualityOk(script, srt, toleranceCharDiff = 120) {
  const clean = (t) => t.replace(/[^ก-๙a-zA-Z0-9]/g, "");
  const scrLen = clean(script).length;
  const srtClean = clean(srt.replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}.*/g, ""));
  return Math.abs(scrLen - srtClean.length) <= toleranceCharDiff;
}

export function detectSpeechWindow(pcm, sampleRate = 24000) {
  // วิเคราะห์หาช่วงที่มีคลื่นเสียงจริงๆ เพื่อตัดซับเปล่าหัว/ท้าย
  const data = new Int16Array(pcm.buffer || pcm);
  const frameSize = Math.round(sampleRate * 0.05); // 50ms frames
  let start = -1, end = -1;
  for (let i = 0; i < data.length; i += frameSize) {
    const frame = data.subarray(i, i + frameSize);
    let energy = 0;
    for (let k = 0; k < frame.length; k++) {
      energy += Math.abs(frame[k]);
    }
    energy = energy / Math.max(1, frame.length);
    if (energy > 280) { // threshold ของเสียง
      const t = i / sampleRate;
      if (start === -1) start = t;
      end = t;
    }
  }
  return { start: start === -1 ? 0 : start, end: end === -1 ? data.length / sampleRate : end };
}

export function convertToAss(srt, vw, vh, { hook = "", fontName = "Mitr" } = {}) {
  // สร้างซับไตเติลภาษาไทยสีสันพรีเมียม สไตล์ TikTok (เหลือง-ขอบดำหนา)
  const header = `[Script Info]
Title: Do-Subtitle Custom ASS
ScriptType: v4.00+
PlayResX: ${vw}
PlayResY: ${vh}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${Math.round(vh * 0.043)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,0,2,20,20,${Math.round(vh * 0.16)},1
Style: Hook,${fontName},${Math.round(vh * 0.052)},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4.5,0,2,20,20,${Math.round(vh * 0.82)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  let events = "";
  
  // บล็อก Hook ค้างด้านบนตลอดวิดีโอ
  if (hook.trim()) {
    const maxTime = "99:59:59.99";
    events += `Dialogue: 1,0:00:00.00,${maxTime},Hook,,0,0,0,,${hook.trim()}\n`;
  }

  const raw = srt.trim().split(/\n\s*\n/);
  for (const block of raw) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const m = lines[1].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!m) continue;
    const formatTime = (hh, mm, ss, ms) => `${parseInt(hh)}:${mm}:${ss}.${ms.slice(0, 2)}`;
    const t0 = formatTime(m[1], m[2], m[3], m[4]);
    const t1 = formatTime(m[5], m[6], m[7], m[8]);
    const text = lines.slice(2).join(" ");
    events += `Dialogue: 0,${t0},${t1},Default,,0,0,0,,${text}\n`;
  }

  return header + events;
}
