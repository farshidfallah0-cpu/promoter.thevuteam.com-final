/**
 * Resumable photo upload in small chunks.
 *
 * Why: the API server is outside Iran; a phone's single long upload request over that
 * lossy/throttled link often died at 80% (nginx logged ~12% of uploads as 408/499/400)
 * and the promoter had to start the photo again. Here each ~96 KB chunk is its own short
 * request with its own retries, a few run in parallel, a dropped connection costs one
 * chunk, and progress never goes backwards. The same upload id is reused when the same
 * file is retried, so a «retry» continues from the chunks the server already has.
 */
const CHUNK_BYTES = 96 * 1024;
const PARALLEL = 3;
const CHUNK_TIMEOUT_MS = 30 * 1000;
const CHUNK_TRIES = 10;

const idByFile = new WeakMap();
export const uploadIdFor = (file) => {
  if (!idByFile.has(file)) {
    idByFile.set(file, globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  }
  return idByFile.get(file);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Offline: wait for the connection to come back (up to 2 min) instead of burning retries.
const waitOnline = () => (typeof navigator === 'undefined' || navigator.onLine ? Promise.resolve() : new Promise((resolve) => {
  const done = () => { window.removeEventListener('online', done); clearTimeout(t); resolve(); };
  const t = setTimeout(done, 120000);
  window.addEventListener('online', done);
}));

class HttpError extends Error {
  constructor(status, body) { super(body?.detail || `HTTP ${status}`); this.status = status; this.body = body; }
}

function request({ method, url, token, body, contentType, timeout = CHUNK_TIMEOUT_MS, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.timeout = timeout;
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new HttpError(xhr.status, data));
    };
    xhr.onerror = () => reject(new HttpError(0, { detail: 'network' }));
    xhr.ontimeout = () => reject(new HttpError(0, { detail: 'timeout' }));
    xhr.send(body ?? null);
  });
}

// 4xx (other than 408/409/429) will not get better by retrying.
const isFinal = (e) => e.status >= 400 && e.status < 500 && ![408, 409, 429].includes(e.status);

async function withRetry(fn, tries) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try { return await fn(); } catch (e) {
      last = e;
      if (isFinal(e)) throw e;
      await waitOnline();
      await sleep(Math.min(8000, 600 * 2 ** i));
    }
  }
  throw last;
}

/** Resolves to the public URL. Throws Error with `.unsupported = true` if the server has no chunk API. */
export async function uploadInChunks({ apiUrl, token, file, onProgress }) {
  const id = uploadIdFor(file);
  const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
  const base = `${apiUrl}/upload/chunk/${id}`;

  // Resume: which chunks does the server already have (from an earlier attempt)?
  let status;
  try {
    status = await withRetry(() => request({ method: 'GET', url: base, token, timeout: 15000 }), 4);
  } catch (e) {
    if (e.status === 404 || e.status === 405) { const err = new Error('chunk api missing'); err.unsupported = true; throw err; }
    throw e;
  }
  if (status.url) { onProgress?.(100); return status.url; }

  const done = new Set(status.received || []);
  const inflight = new Map();
  const sizeOf = (i) => Math.min(CHUNK_BYTES, file.size - i * CHUNK_BYTES);
  let lastPct = -1;
  const report = () => {
    let sent = 0;
    done.forEach((i) => { sent += sizeOf(i); });
    inflight.forEach((n) => { sent += n; });
    // Keep 1% for assembling on the server; never move backwards.
    const pct = Math.min(99, Math.floor((sent / file.size) * 99));
    if (pct > lastPct) { lastPct = pct; onProgress?.(pct); }
  };
  report();

  const sendChunk = (i) => withRetry(async () => {
    inflight.set(i, 0);
    try {
      await request({
        method: 'PUT', url: `${base}/${i}?total=${total}`, token, contentType: 'application/octet-stream',
        body: file.slice(i * CHUNK_BYTES, i * CHUNK_BYTES + sizeOf(i)),
        onProgress: (n) => { inflight.set(i, n); report(); },
      });
      done.add(i);
    } finally {
      inflight.delete(i);
      report();
    }
  }, CHUNK_TRIES);

  const sendAll = async (indexes) => {
    const queue = [...indexes];
    const worker = async () => { while (queue.length) await sendChunk(queue.shift()); };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  };

  await sendAll([...Array(total).keys()].filter((i) => !done.has(i)));

  for (let round = 0; round < 3; round += 1) {
    try {
      const res = await withRetry(() => request({
        method: 'POST', url: `${base}/finish`, token, contentType: 'application/json', timeout: 45000,
        body: JSON.stringify({ total, filename: file.name || 'photo.jpg', content_type: file.type || 'image/jpeg' }),
      }), 6);
      onProgress?.(100);
      return res.url;
    } catch (e) {
      if (e.status === 409 && Array.isArray(e.body?.missing)) {
        e.body.missing.forEach((i) => done.delete(i));
        await sendAll(e.body.missing);
        continue;
      }
      if (e.status === 422) {
        // The server found the assembled photo corrupt and dropped the chunks: send everything again.
        done.clear(); lastPct = -1;
        await sendAll([...Array(total).keys()]);
        continue;
      }
      throw e;
    }
  }
  throw new Error('upload could not be completed');
}
