/*
 * Bounded self-load endpoints for the "Max Instance Count" (autoscaling) and
 * resource-limit checks. Hard caps keep a stray call from pinning a pod.
 */
const MAX_SECONDS = 60;
const MAX_MEMORY_MIB = 512;

function clampSeconds(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_SECONDS);
}

function burnCpu(seconds) {
  const end = Date.now() + seconds * 1000;
  let x = 0;
  while (Date.now() < end) {
    x = Math.sqrt(x + Math.random());
  }
  return x;
}

const held = [];

function holdMemory(mib, seconds) {
  const bytes = Math.min(mib, MAX_MEMORY_MIB) * 1024 * 1024;
  const buf = Buffer.alloc(bytes, 1);
  held.push(buf);
  setTimeout(() => {
    const i = held.indexOf(buf);
    if (i >= 0) held.splice(i, 1);
  }, seconds * 1000).unref();
  return bytes;
}

module.exports = { clampSeconds, burnCpu, holdMemory, MAX_SECONDS, MAX_MEMORY_MIB };
