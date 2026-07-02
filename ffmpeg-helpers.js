// ffmpeg-helpers.js — จัดการเรียกโหลดและรัน ffmpeg.wasm ในเบราว์เซอร์

let ffmpeg = null;
let loadPromise = null;

export function isMultiThread() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.has("st")) return false;
    if (p.has("mt")) return true;
  } catch {}
  return false;
}

export async function loadFFmpeg(onLog) {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = window.FFmpegWASM;
    const inst = new FFmpeg();
    
    if (onLog) {
      inst.on("log", ({ message }) => onLog(message));
    }

    // แปลง relative path ให้เป็น absolute URL ป้องกันปัญหาตกหล่นไปยัง file:/// ของผู้พัฒนาเดิม
    const resolveAbsolute = (path) => new URL(path, window.location.href).href;

    const cfg = {
      classWorkerURL: resolveAbsolute("./vendor/814.ffmpeg.js"),
      coreURL: resolveAbsolute("./vendor/ffmpeg-core.js"),
      wasmURL: resolveAbsolute("./vendor/ffmpeg-core.wasm"),
    };

    console.log("[ffmpeg] loading core from local vendor/", cfg);
    if (onLog) onLog(`[ffmpeg] core=${cfg.coreURL}`);
    
    await inst.load(cfg);
    ffmpeg = inst;
    return inst;
  })();

  return loadPromise;
}

export function fetchFile(input) {
  return window.FFmpegUtil.fetchFile(input);
}

export async function exec(args) {
  const ff = await loadFFmpeg();
  const code = await ff.exec(args);
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}: ${args.join(" ")}`);
  }
  return code;
}

export async function writeFile(name, data) {
  const ff = await loadFFmpeg();
  await ff.writeFile(name, data);
}

export async function readFile(name) {
  const ff = await loadFFmpeg();
  return ff.readFile(name); // Uint8Array
}

export async function createDir(path) {
  const ff = await loadFFmpeg();
  try {
    await ff.createDir(path);
  } catch {}
}

export async function exists(name) {
  const ff = await loadFFmpeg();
  try {
    await ff.readFile(name);
    return true;
  } catch {
    return false;
  }
}
