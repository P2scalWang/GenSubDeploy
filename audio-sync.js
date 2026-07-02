// audio-sync.js — จัดการความยาวและซิงก์ตำแหน่งซับไตเติลกับเสียงพากย์จริง

export const DEFAULT_TTS_SEGMENT_GAP_SEC = 0.08;

export function pcmDurationSeconds(pcm, sampleRate = 24000, bytesPerSample = 2) {
  const bytes = pcm?.byteLength ?? pcm?.length ?? 0;
  return bytes / Math.max(1, sampleRate * bytesPerSample);
}

export function buildContinuousTextSegments(texts, opts = {}) {
  const lines = (texts || []).map((text) => String(text || "").trim()).filter(Boolean);
  if (!lines.length) return [];

  const start = Math.max(0, Number(opts.start ?? 0));
  const end = Math.max(start + 0.1, Number(opts.end ?? opts.duration ?? start + 1));
  const totalDur = end - start;
  const requestedMinDur = Math.max(0, Number(opts.minDur ?? 0.55));
  
  const minDur = lines.length * requestedMinDur <= totalDur ? requestedMinDur : 0;
  const flexibleDur = Math.max(0, totalDur - (lines.length * minDur));
  const weights = lines.map((line) => Math.max(1, visibleLen(line)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const segments = [];
  let cursor = start;
  lines.forEach((text, i) => {
    const isLast = i === lines.length - 1;
    const dur = isLast
      ? Math.max(0.1, end - cursor)
      : minDur + (flexibleDur * weights[i] / Math.max(1, totalWeight));
    segments.push({ text, start: cursor, dur });
    cursor += dur;
  });

  return segments;
}

function visibleLen(text) {
  return [...String(text || "")].filter((ch) => !/\s/.test(ch)).length;
}

export function resolveSubtitleSpeechWindow({
  speechWindow,
  audioDuration,
  finalDuration,
} = {}) {
  const maxEnd = Math.max(1, Number(finalDuration || 0), Number(audioDuration || 0));
  const start = Math.max(0, Number(speechWindow?.start ?? 0));
  const rawEnd = Number(speechWindow?.end ?? audioDuration ?? finalDuration ?? 1);
  const end = Math.min(Math.max(start + 0.5, rawEnd), maxEnd);
  return { start, end };
}
