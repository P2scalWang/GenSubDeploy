// config.js — จัดการตัวแปรระบบและ API Key ของ OpenRouter ใน LocalStorage

const KEY_OR_API = "openrouter_api_key";
const KEY_MODEL = "openrouter_model";
const KEY_VOICE = "openrouter_voice";

// โหมด Direct เสมอสำหรับการใช้งานส่วนตัว
export function getOpenRouterKey() {
  return localStorage.getItem(KEY_OR_API) || "";
}

export function setOpenRouterKey(key) {
  if (key) {
    localStorage.setItem(KEY_OR_API, key.trim());
  } else {
    localStorage.removeItem(KEY_OR_API);
  }
}

export function getSelectedModel() {
  // เลือกใช้ google/gemini-2.5-flash-image เป็นค่าเริ่มต้นเพื่อความคุ้มค่าและรองรับการดูภาพ (Vision)
  return localStorage.getItem(KEY_MODEL) || "google/gemini-2.5-flash-image";
}

export function setSelectedModel(model) {
  localStorage.setItem(KEY_MODEL, model);
}

export function getSelectedVoice() {
  return localStorage.getItem(KEY_VOICE) || "Kore";
}

export function setSelectedVoice(voice) {
  localStorage.setItem(KEY_VOICE, voice);
}

const KEY_FONT = "openrouter_font";
export function getSelectedFont() {
  return localStorage.getItem(KEY_FONT) || "Mitr";
}

export function setSelectedFont(font) {
  localStorage.setItem(KEY_FONT, font);
}

// ตรวจสอบว่ามี API Key ให้พร้อมใช้เรียก AI หรือยัง
export function hasApiKey() {
  return !!getOpenRouterKey();
}
