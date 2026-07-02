// app.js — logic หลักและ pipeline การทำงานของ Do-Subtitle Webapp

import { loadFFmpeg, exec, writeFile, readFile, fetchFile, isMultiThread, createDir } from "./ffmpeg-helpers.js";
import { geminiScript, geminiTTS, geminiSrtFromAudio, blobToBase64 } from "./gemini.js";
import {
  buildSrtFromSegments, splitSubtitleChunks, normalizeSubtitleLines,
  normalizeSrtBlocks, convertToAss, srtQualityOk, srtSpanSeconds, detectSpeechWindow,
  SUBTITLE_MAX_CHARS,
} from "./subtitles.js";
import {
  buildContinuousTextSegments,
  pcmDurationSeconds,
  resolveSubtitleSpeechWindow,
} from "./audio-sync.js";
import {
  getOpenRouterKey, setOpenRouterKey, getSelectedModel, setSelectedModel,
  getSelectedVoice, setSelectedVoice, getSelectedFont, setSelectedFont, hasApiKey
} from "./config.js";

// ---------- DOM Elements Helper ----------
const $ = (id) => document.getElementById(id);

// ---------- Constants ----------
const DB_NAME = "do_subtitle_webapp_db";
const DB_VERSION = 1;
const STORE_NAME = "history_clips";

// ---------- State Variables ----------
let videoFile = null;
let videoMeta = { duration: 0, width: 1080, height: 1920 };
let isProcessing = false;
let db = null;

// ---------- BGM List ----------
const BGM_FILES = ["./music/bgm1.mp3", "./music/bgm2.mp3", "./music/bgm3.mp3"];
function pickBgmFile() {
  const idx = Math.floor(Math.random() * BGM_FILES.length);
  return BGM_FILES[idx];
}

// ---------- Initialize IndexedDB ----------
function initDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}
// ---------- Logging Helper ----------
function logLine(msg) {
  console.log(msg);
  const debugLog = $("debugLog");
  if (debugLog) {
    debugLog.textContent += msg + "\n";
    debugLog.scrollTop = debugLog.scrollHeight;
  }
}

// ---------- UI Logic: Load / Save Settings ----------
function initSettingsUI() {
  const openBtn = $("openSettingsBtn");
  const closeBtn = $("closeSettingsBtn");
  const saveBtn = $("saveSettingsBtn");
  const settingsModal = $("settingsModal");
  const apiKeyInput = $("apiKeyInput");
  const modelSelect = $("modelSelect");
  const voiceSelect = $("voiceSelect");
  const fontSelect = $("fontSelect");
  const warningBanner = $("apiKeyWarning");

  // Helper สำหรับอัปเดตกล่องพรีวิวฟอนต์
  const updateFontPreview = (fontName) => {
    const previewBox = $("fontPreviewBox");
    if (previewBox) {
      previewBox.style.fontFamily = `"${fontName}", sans-serif`;
    }
  };

  // โหลดคีย์และค่าต่างๆ ที่มีอยู่มาแสดง
  apiKeyInput.value = getOpenRouterKey();
  modelSelect.value = getSelectedModel();
  voiceSelect.value = getSelectedVoice();
  if (fontSelect) {
    fontSelect.value = getSelectedFont();
    updateFontPreview(fontSelect.value);
  }

  // ตรวจสอบแบนเนอร์แจ้งเตือน Key
  updateApiKeyWarning();

  openBtn.onclick = () => {
    apiKeyInput.value = getOpenRouterKey();
    settingsModal.classList.add("open");
  };

  closeBtn.onclick = () => {
    settingsModal.classList.remove("open");
  };

  saveBtn.onclick = () => {
    const keyVal = apiKeyInput.value.trim();
    setOpenRouterKey(keyVal);
    
    const modelVal = modelSelect.value;
    setSelectedModel(modelVal);

    const voiceVal = voiceSelect.value;
    setSelectedVoice(voiceVal);

    if (fontSelect) {
      const fontVal = fontSelect.value;
      setSelectedFont(fontVal);
      updateFontPreview(fontVal);
    }

    const msg = $("settingsMsg");
    msg.className = "sheet-msg ok";
    msg.textContent = "บันทึกการตั้งค่าเรียบร้อยแล้ว!";
    
    updateApiKeyWarning();

    setTimeout(() => {
      msg.style.display = "none";
      settingsModal.classList.remove("open");
    }, 1200);
  };

  // ตรวจสอบเมื่อมีการสลับค่าบนฟอร์มหลัก
  modelSelect.onchange = () => setSelectedModel(modelSelect.value);
  voiceSelect.onchange = () => setSelectedVoice(voiceSelect.value);
  if (fontSelect) {
    fontSelect.onchange = () => {
      setSelectedFont(fontSelect.value);
      updateFontPreview(fontSelect.value);
    };
  }
}

function updateApiKeyWarning() {
  const warningBanner = $("apiKeyWarning");
  if (hasApiKey()) {
    warningBanner.style.display = "none";
  } else {
    warningBanner.style.display = "block";
  }
}

// ---------- Drag and Drop Video ----------
function initUploadUI() {
  const dropZone = $("dropZone");
  const fileInput = $("videoFile");

  dropZone.onclick = (e) => {
    if (e.target.closest("button")) return;
    fileInput.click();
  };

  fileInput.onchange = () => {
    if (fileInput.files[0]) {
      loadVideo(fileInput.files[0]);
    }
  };

  ["dragover", "dragenter"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) {
      loadVideo(f);
    }
  });
}

function loadVideo(file) {
  videoFile = file;
  const url = URL.createObjectURL(file);
  const src = $("srcVideo");
  src.src = url;
  src.classList.add("show");

  src.onloadedmetadata = () => {
    videoMeta = {
      duration: src.duration || 0,
      width: src.videoWidth || 1080,
      height: src.videoHeight || 1920,
    };
    
    const chips = $("filesChips");
    chips.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = `${file.name} · ${(file.size / 1e6).toFixed(1)}MB · ${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(1)}s`;
    chips.appendChild(span);
    
    // เปิดใช้งานปุ่มรัน
    $("runBtn").disabled = false;
  };
}

// ---------- Steps Log UI ----------
let activeSteps = [];
function setProcessSteps(defs) {
  activeSteps = defs.map((d) => ({ ...d, status: "pending", t0: 0 }));
  const list = $("stepsList");
  list.innerHTML = "";
  for (const s of activeSteps) {
    const li = document.createElement("li");
    li.className = "pending";
    li.id = "pstep-" + s.key;
    
    const ico = document.createElement("span");
    ico.className = "s-ico";
    ico.textContent = "○";

    const lbl = document.createElement("span");
    lbl.className = "s-lbl";
    lbl.textContent = s.label;

    const t = document.createElement("span");
    t.className = "s-t";

    li.append(ico, lbl, t);
    list.appendChild(li);
  }
}

function startProcessStep(key) {
  const s = activeSteps.find((x) => x.key === key);
  if (!s) return;
  s.status = "active";
  s.t0 = performance.now();
  const li = $("pstep-" + key);
  if (li) {
    li.className = "active";
    li.querySelector(".s-ico").textContent = "◑";
  }
  updateProgressBar(s.label, getPercentageForStep(key));
}

function doneProcessStep(key, note) {
  const s = activeSteps.find((x) => x.key === key);
  if (!s) return;
  s.status = "done";
  const li = $("pstep-" + key);
  if (li) {
    li.className = "done";
    li.querySelector(".s-ico").textContent = "✓";
    const elapsed = s.t0 ? ((performance.now() - s.t0) / 1000).toFixed(1) + "s" : "";
    li.querySelector(".s-t").textContent = note ? `${note} · ${elapsed}` : elapsed;
  }
}

function skipProcessStep(key) {
  const s = activeSteps.find((x) => x.key === key);
  if (!s) return;
  s.status = "skip";
  const li = $("pstep-" + key);
  if (li) {
    li.className = "done";
    li.querySelector(".s-ico").textContent = "–";
    li.querySelector(".s-t").textContent = "ข้าม";
  }
}

function errorProcessStep(key, msg) {
  const li = $("pstep-" + key);
  if (li) {
    li.className = "error";
    li.querySelector(".s-ico").textContent = "✗";
    li.querySelector(".s-t").textContent = msg || "ล้มเหลว";
  }
}

function getPercentageForStep(key) {
  const idx = activeSteps.findIndex((s) => s.key === key);
  if (idx < 0 || !activeSteps.length) return 5;
  return Math.round(((idx + 0.5) / activeSteps.length) * 100);
}

function updateProgressBar(text, percent) {
  $("currentStepText").textContent = text;
  if (typeof percent === "number") {
    $("progressBarFill").style.width = percent + "%";
  }
}

// Show dub text script lines preview
function renderDubScriptPreview(lines) {
  const list = $("scriptLinesList");
  list.innerHTML = "";
  if (!lines || !lines.length) {
    $("scriptPreviewBox").style.display = "none";
    return;
  }
  $("scriptPreviewBox").style.display = "block";
  for (const s of lines) {
    const div = document.createElement("div");
    div.className = "script-line";
    div.textContent = String(s || "").replace(/\*/g, "");
    list.appendChild(div);
  }
}

// ---------- Extract Keyframes for OpenRouter Vision API (Native HTML5 Video + Canvas) ----------
function captureVideoFrame(video, time) {
  return new Promise((resolve) => {
    video.currentTime = time;
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      const canvas = document.createElement("canvas");
      // กำหนดความกว้างสูงสุด 640px ป้องกันการส่ง payload ขนาดใหญ่เกินความจำเป็นไปยัง API
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75); // บีบอัดคุณภาพ 75%
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    video.addEventListener("seeked", onSeeked);
  });
}

async function extractKeyframes(file, duration, count = 4) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    
    const url = URL.createObjectURL(file);
    video.src = url;
    
    video.onloadedmetadata = async () => {
      const frames = [];
      try {
        for (let i = 0; i < count; i++) {
          // ดึงเฟรมช่วง: 10%, 36%, 63%, 90% ของความยาวคลิป
          const time = duration * (0.1 + (i * 0.8) / (count - 1));
          const base64 = await captureVideoFrame(video, time);
          frames.push(base64);
        }
        URL.revokeObjectURL(url);
        resolve(frames);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    
    video.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("ไม่สามารถโหลดไฟล์วิดีโอเพื่อดึงเฟรมภาพได้"));
    };
  });
}

// ---------- Main Pipeline Execution ----------
$("runBtn").onclick = async () => {
  if (isProcessing || !videoFile) return;
  if (!hasApiKey()) {
    alert("กรุณากรอก OpenRouter API Key ก่อนเริ่มทำงาน");
    $("settingsModal").classList.add("open");
    return;
  }

  isProcessing = true;
  $("runBtn").disabled = true;
  
  // ล้างค่า Log เก่าเมื่อเริ่มรันใหม่
  const debugLog = $("debugLog");
  if (debugLog) debugLog.textContent = "";
  logLine("[system] เริ่มต้นการรันวิดีโอ...");
  
  // จัดการ UI เปิดหน้าประมวลผล
  $("previewPlaceholder").style.display = "none";
  $("processStatus").style.display = "block";
  $("result").style.display = "none";
  $("scriptPreviewBox").style.display = "none";
  $("progressBarFill").style.width = "4%";
  
  updateProgressBar("กำลังเตรียมโปรแกรมเรนเดอร์...", 4);

  const voice = getSelectedVoice();
  const doSubs = $("optSubs").checked;
  const bgmVal = $("bgmSelect").value;
  const doMusic = bgmVal !== "none";
  const styleHint = $("styleHint").value.trim();
  const { duration, width: vw, height: vh } = videoMeta;

  setProcessSteps([
    { key: "load", label: "โหลดตัวแปลงวิดีโอ (ffmpeg)" },
    { key: "ingest", label: "จัดเตรียมวิดีโอและโฟลเดอร์ไฟล์ฟอนต์" },
    { key: "analyze", label: "AI วิเคราะห์ภาพและเขียนบทพากย์" },
    { key: "tts", label: "สร้างเสียงพากย์ภาษาไทยด้วย AI" },
    { key: "adjust", label: "ปรับจังหวะเสียงให้ตรงกับความยาว" },
    ...(doSubs ? [{ key: "srt", label: "จับจังหวะคำบรรยาย (SRT)" }] : []),
    { key: "merge", label: "รวมวิดีโอและแทร็กเสียงพากย์" },
    ...(doSubs ? [{ key: "burn", label: "ฝังซับไตเติลภาษาไทยลงคลิป" }] : []),
    { key: "done", label: "เสร็จสิ้นการเรนเดอร์" }
  ]);

  let titleText = "", scriptText = "", finalSrt = "", hookText = "", subtitleLines = [];

  try {
    // 1. Load ffmpeg
    startProcessStep("load");
    logLine("[ffmpeg] กำลังโหลด core Wasm...");
    await loadFFmpeg((msg) => logLine(`[ffmpeg] ${msg}`));
    doneProcessStep("load");

    // 2. Ingest
    startProcessStep("ingest");
    logLine("[system] บันทึกไฟล์วิดีโอและโฟลเดอร์ฟอนต์...");
    await writeFile("video.mp4", await fetchFile(videoFile));
    await createDir("/fonts");
    
    // โหลดฟอนต์ไทยทั้งหมดในระบบเพื่อรองรับการเลือกของลูกค้า
    logLine("[system] กำลังโหลดไฟล์ฟอนต์สำหรับแปลงซับ (Mitr, Noto Sans, Sarabun)...");
    await writeFile("/fonts/Mitr.ttf", await fetchFile("./fonts/Mitr-Bold.ttf"));
    await writeFile("/fonts/Noto Sans Thai.ttf", await fetchFile("./fonts/NotoSansThai-Var.ttf"));
    await writeFile("/fonts/Sarabun.ttf", await fetchFile("./fonts/Sarabun-Bold.ttf"));
    doneProcessStep("ingest");

    // 3. AI Analyze Script (ดึงเฟรมส่งแทนส่งทั้งวิดีโอ)
    startProcessStep("analyze");
    logLine("[ai-vision] กำลังดึงเฟรมภาพจากวิดีโอด้วย Canvas...");
    const base64Images = await extractKeyframes(videoFile, duration, 4);
    logLine(`[ai-vision] ดึงเฟรมสำเร็จ ${base64Images.length} รูป → กำลังส่งให้ OpenRouter เขียนบท...`);
    
    const scriptPack = await geminiScript({
      base64Images: base64Images,
      duration: duration,
      styleHint: styleHint
    });

    scriptText = scriptPack.script;
    titleText = scriptPack.title;
    hookText = scriptPack.hook || "";
    subtitleLines = scriptPack.subtitleLines;

    logLine(`[ai-response] บทพากย์ที่ได้: "${scriptText.slice(0, 50)}..."`);
    logLine(`[ai-response] ซับไตเติลทั้งหมด: ${subtitleLines.length} บรรทัด`);
    
    renderDubScriptPreview(subtitleLines);
    doneProcessStep("analyze", `${scriptText.length} ตัวอักษร`);

    // 4. TTS (Text-to-speech)
    startProcessStep("tts");
    logLine("[ai-tts] ส่งคำพากย์สร้างเสียงบรรยายไทย...");
    const pcmBytes = await geminiTTS({ script: scriptText, voice: voice });
    const speechWindow = detectSpeechWindow(pcmBytes, 24000);
    const audioDuration = pcmDurationSeconds(pcmBytes, 24000);
    logLine(`[ai-tts] โหลดเสียงพากย์สำเร็จ ${audioDuration.toFixed(2)} วินาที, แปลงสัญญาณเสียง...`);
    
    await writeFile("audio_raw.pcm", pcmBytes);
    // แปลง Raw PCM 24kHz เป็น WAV สำหรับ ffmpeg
    await exec(["-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "audio_raw.pcm", "audio_voice.wav"]);
    doneProcessStep("tts", `${audioDuration.toFixed(1)} วินาที`);

    // 5. Adjust audio / video time bounds
    startProcessStep("adjust");
    let finalClipDuration = duration;
    const diff = duration - audioDuration;

    if (Math.abs(diff) < 0.5) {
      finalClipDuration = Math.max(duration, audioDuration);
      await exec(["-y", "-i", "audio_voice.wav", "-c", "copy", "audio_adjusted.wav"]);
    } else if (diff > 0) {
      // เสียงสั้นกว่าวิดีโอ -> เติมความเงียบท้ายเสียง
      finalClipDuration = duration;
      await exec(["-y", "-i", "audio_voice.wav", "-af", `apad=pad_dur=${diff}`, "audio_adjusted.wav"]);
    } else {
      // เสียงยาวกว่าวิดีโอ -> ยืดวิดีโอตามความยาวเสียงพากย์เพื่อป้องกันเสียงขาด
      finalClipDuration = audioDuration + 0.3;
      await exec(["-y", "-i", "audio_voice.wav", "-af", "apad=pad_dur=0.3", "audio_adjusted.wav"]);
    }

    // 5b. ใส่เพลงประกอบด้านหลัง (BGM)
    if (doMusic) {
      try {
        let bgmPath;
        if (bgmVal === "random") {
          bgmPath = pickBgmFile();
        } else {
          bgmPath = `./music/${bgmVal}.mp3`;
        }
        logLine(`[music] เลือกเพลงประกอบ: ${bgmPath}`);
        await writeFile("bgm.mp3", await fetchFile(bgmPath));
        const fadeStart = Math.max(0, finalClipDuration - 1.2);
        
        const bgmVolume = parseFloat($("bgmVolumeSelect").value || "0.14");
        
        // ผสมเสียงพากย์ (ความดังหลัก) + เพลงพื้นหลัง (เบาลงตามระดับเสียงที่เลือก และหรี่เสียงตอนจบ)
        await exec([
          "-y", "-i", "audio_adjusted.wav", "-stream_loop", "-1", "-i", "bgm.mp3",
          "-filter_complex",
          `[1:a]volume=${bgmVolume},afade=t=out:st=${fadeStart.toFixed(2)}:d=1.2[bg];` +
          `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
          "-map", "[a]", "-t", finalClipDuration.toFixed(3), "-ar", "44100", "-ac", "2", "audio_final.wav"
        ]);
        await exec(["-y", "-i", "audio_final.wav", "-c", "copy", "audio_adjusted.wav"]);
        logLine(`[music] รวมเพลงพื้นหลังเรียบร้อย: ${bgmPath} (ระดับเสียง ${Math.round(bgmVolume * 100)}%)`);
      } catch (e) {
        logLine(`[music] ข้ามขั้นตอนผสมเพลงประกอบเนื่องจาก: ${e?.message || e}`);
      }
    }
    doneProcessStep("adjust", `วิดีโอรวม ${finalClipDuration.toFixed(1)}s`);

    // 6. Subtitles timing (SRT)
    if (doSubs) {
      startProcessStep("srt");
      finalSrt = "";
      try {
        const wavBytesForSync = await readFile("audio_adjusted.wav");
        const base64Wav = await blobToBase64(new Blob([wavBytesForSync], { type: "audio/wav" }));
        
        const rawSrt = await geminiSrtFromAudio({
          base64Wav: base64Wav,
          subtitleLines: subtitleLines,
          duration: audioDuration
        });
        
        const candidateSrt = normalizeSrtBlocks(rawSrt, finalClipDuration);
        const spanSec = srtSpanSeconds(candidateSrt);
        const hasGoodWords = srtQualityOk(scriptText, candidateSrt, 120);
        
        if (candidateSrt.trim() && hasGoodWords && spanSec >= 0.6 * audioDuration) {
          finalSrt = candidateSrt;
          logLine(`[srt-sync] ซิงก์เวลาตรงคำจากเสียงสำเร็จ (${finalSrt.split("\n\n").filter(Boolean).length} บล็อก)`);
        }
      } catch (e) {
        logLine(`[srt-sync] ซิงก์ล้มเหลว หล่นลงใช้ deterministic sync: ${e?.message || e}`);
      }

      // Fallback deterministic sync
      if (!finalSrt.trim()) {
        const bounds = resolveSubtitleSpeechWindow({
          speechWindow: speechWindow,
          audioDuration: audioDuration,
          finalDuration: finalClipDuration
        });
        
        finalSrt = buildSrtFromSegments(
          buildContinuousTextSegments(subtitleLines, { start: bounds.start, end: bounds.end, minDur: 0.55 }),
          SUBTITLE_MAX_CHARS
        );
      }

      await writeFile("subtitles.srt", new TextEncoder().encode(finalSrt));
      const doHook = $("optHook").checked;
      const selectedFontName = getSelectedFont();
      const assData = convertToAss(finalSrt, vw, vh, { hook: doHook ? hookText : "", fontName: selectedFontName });
      await writeFile("subtitles.ass", new TextEncoder().encode(assData));
      
      doneProcessStep("srt", `${finalSrt.split("\n\n").filter(Boolean).length} บรรทัด`);
    }

    // 7. Merge video and audio
    startProcessStep("merge");
    await writeFile("video_raw.mp4", await fetchFile(videoFile));
    
    if (finalClipDuration > duration + 0.1) {
      // หากเสียงยาวกว่าวิดีโอ -> ให้วิดีโอเล่นวนภาพซ้ำค้างไว้ที่เฟรมสุดท้าย
      await exec([
        "-y", "-stream_loop", "-1", "-i", "video_raw.mp4", "-i", "audio_adjusted.wav",
        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
        "-map", "0:v:0", "-map", "1:a:0", "-t", finalClipDuration.toFixed(3), "merged_temp.mp4",
      ]);
    } else {
      await exec([
        "-y", "-i", "video_raw.mp4", "-i", "audio_adjusted.wav",
        "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0",
        "-t", finalClipDuration.toFixed(3), "merged_temp.mp4",
      ]);
    }
    doneProcessStep("merge");

    // 8. Burn subtitles
    let exportFileName = "merged_temp.mp4";
    if (doSubs && finalSrt.trim()) {
      startProcessStep("burn");
      await exec([
        "-y", "-i", "merged_temp.mp4",
        "-vf", "ass=subtitles.ass:fontsdir=/fonts:shaping=complex",
        "-c:v", "libx264", "-c:a", "copy", "-preset", "fast",
        "output_finished.mp4"
      ]);
      exportFileName = "output_finished.mp4";
      doneProcessStep("burn");
    }

    // 9. Done, read export file
    updateProgressBar("กำลังจัดเตรียมไฟล์สำหรับดาวน์โหลด...", 98);
    const finalVideoBytes = await readFile(exportFileName);
    const finalVideoBlob = new Blob([finalVideoBytes], { type: "video/mp4" });
    
    // Extract thumbnail
    let thumbBytes = null;
    try {
      await exec([
        "-y", "-ss", "0.1", "-i", exportFileName, "-vframes", "1",
        "-vf", "scale=270:480:force_original_aspect_ratio=increase,crop=270:480",
        "-q:v", "80", "thumb_export.webp"
      ]);
      thumbBytes = await readFile("thumb_export.webp");
    } catch (e) {
      console.log(`[thumb] ข้ามสร้างรูปปกเนื่องจาก: ${e.message}`);
    }

    doneProcessStep("done");
    updateProgressBar("เรนเดอร์สำเร็จ! 🎉", 100);
    
    // บันทึกประวัติและแสดงผลลัพธ์
    showRenderResult(finalVideoBlob, thumbBytes, titleText);

  } catch (err) {
    logLine(`[error] ❌ เกิดความล้มเหลวในระบบ Pipeline: ${err?.stack || err?.message || err}`);
    updateProgressBar("เกิดข้อผิดพลาดในการประมวลผล", 0);
    alert(`เรนเดอร์ล้มเหลว: ${err?.message || err}`);
  } finally {
    isProcessing = false;
    $("runBtn").disabled = false;
  }
};

// ---------- Render Final Result UI ----------
let resultVideoUrl = null;

function showRenderResult(videoBlob, thumbBytes, caption) {
  // เคลียร์ URL เก่า
  if (resultVideoUrl) {
    URL.revokeObjectURL(resultVideoUrl);
  }
  
  resultVideoUrl = URL.createObjectURL(videoBlob);
  
  $("processStatus").style.display = "none";
  $("result").style.display = "block";
  
  const resultDiv = $("result");
  // ลบแท็กวิดีโอเก่าถ้ามี
  const existingVid = resultDiv.querySelector("video");
  if (existingVid) existingVid.remove();
  
  // แทรกวิดีโอใหม่
  const newVid = document.createElement("video");
  newVid.src = resultVideoUrl;
  newVid.controls = true;
  newVid.playsInline = true;
  resultDiv.insertBefore(newVid, resultDiv.firstChild);

  $("resultCaption").value = caption || "";
  $("downloadVideoBtn").href = resultVideoUrl;
  $("downloadVideoBtn").download = `do-subtitle-${Date.now()}.mp4`;

  // บันทึกลงประวัติ (IndexedDB)
  saveClipToHistory(videoBlob, thumbBytes, caption);
}

// ---------- Save and Load History (IndexedDB) ----------
async function saveClipToHistory(videoBlob, thumbBytes, caption) {
  if (!db) return;
  const transaction = db.transaction([STORE_NAME], "readwrite");
  const store = transaction.objectStoreForName(STORE_NAME);
  
  const item = {
    videoBlob: videoBlob,
    thumbBlob: thumbBytes ? new Blob([thumbBytes], { type: "image/webp" }) : null,
    caption: caption,
    createdAt: Date.now()
  };
  
  store.add(item);
  transaction.oncomplete = () => {
    loadHistoryList();
  };
}

function loadHistoryList() {
  if (!db) return;
  const store = db.transaction([STORE_NAME], "readonly").objectStoreForName(STORE_NAME);
  const list = $("historyList");
  list.innerHTML = "";

  const cursorRequest = store.openCursor(null, "prev"); // เรียงจากล่าสุดขึ้นก่อน
  let count = 0;

  cursorRequest.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      count++;
      const item = cursor.value;
      const key = cursor.key;

      const card = document.createElement("div");
      card.className = "hist-item";

      // ใช้รูปปกหรือสีเทาพื้นหลัง
      if (item.thumbBlob) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(item.thumbBlob);
        card.appendChild(img);
      } else {
        const div = document.createElement("div");
        div.style.cssText = "width:100%;height:100%;background:#1a1c24;display:flex;align-items:center;justify-content:center;color:#4a5068;font-size:24px;";
        div.textContent = "🎬";
        card.appendChild(div);
      }

      // ปุ่มเล่นวิดีโอ
      const playBtn = document.createElement("div");
      playBtn.className = "hist-play";
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      playBtn.onclick = () => playHistoryVideo(item.videoBlob);

      // ปุ่มลบประวัติ
      const delBtn = document.createElement("button");
      delBtn.className = "hist-del";
      delBtn.textContent = "×";
      delBtn.onclick = (event) => {
        event.stopPropagation();
        if (confirm("ต้องการลบวิดีโอนี้จากประวัติใช่หรือไม่?")) {
          deleteHistoryItem(key);
        }
      };

      card.appendChild(playBtn);
      card.appendChild(delBtn);
      list.appendChild(card);

      cursor.continue();
    } else if (count === 0) {
      list.innerHTML = `<div class="hist-empty">ยังไม่มีประวัติวิดีโอที่เคยสร้าง</div>`;
    }
  };
}

function deleteHistoryItem(id) {
  if (!db) return;
  const transaction = db.transaction([STORE_NAME], "readwrite");
  const store = transaction.objectStoreForName(STORE_NAME);
  store.delete(id);
  transaction.oncomplete = () => {
    loadHistoryList();
  };
}

// Modal video preview for history
function playHistoryVideo(blob) {
  const modal = $("videoModal");
  const player = $("modalVideoPlayer");
  player.src = URL.createObjectURL(blob);
  modal.classList.add("open");
  player.play();
}

// ---------- DOM Event Listeners ----------
window.addEventListener("DOMContentLoaded", async () => {
  // โหลด IndexedDB บันทึกประวัติ
  await initDb().catch((e) => console.error("IndexedDB error:", e));
  
  // ตั้งค่าปุ่มและ setting ต่างๆ
  initSettingsUI();
  initUploadUI();
  
  if (db) {
    loadHistoryList();
  }

  // ปิด Modal วิดีโอเมื่อกดปิด
  $("closeVideoModalBtn").onclick = () => {
    $("videoModal").classList.remove("open");
    $("modalVideoPlayer").pause();
    $("modalVideoPlayer").src = "";
  };

  // ปิด Modal ตั้งค่า
  $("closeSettingsBtn").onclick = () => {
    $("settingsModal").classList.remove("open");
  };

  // คัดลอกแคปชัน
  $("copyCaptionBtn").onclick = () => {
    const text = $("resultCaption").value;
    navigator.clipboard.writeText(text);
    alert("คัดลอกข้อความแคปชันลงคลิปบอร์ดแล้ว!");
  };

  // รีสตาร์ต/ล้างฟอร์ม
  $("restartBtn").onclick = () => {
    videoFile = null;
    $("srcVideo").src = "";
    $("srcVideo").classList.remove("show");
    $("filesChips").innerHTML = "";
    $("runBtn").disabled = true;
    $("result").style.display = "none";
    $("previewPlaceholder").style.display = "flex";
    $("styleHint").value = "";
  };
});
