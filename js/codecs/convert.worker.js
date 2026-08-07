/**
 * Dönüştürme worker'ı (module worker).
 *
 * Görev: kaynak (Blob ya da hazır ImageData) -> ölçekle -> encode -> ArrayBuffer
 *
 * Çözümleme (decode) tarayıcının kendi motoruyla yapılır (createImageBitmap):
 * PNG / JPEG / WebP / AVIF / GIF / BMP / ICO hepsi native desteklenir, böylece
 * yalnızca ENCODE tarafı için wasm indirilir. SVG girdisi ana thread'de
 * rasterize edilip buraya ImageData olarak gelir (worker'da SVG çizimi
 * güvenilir değil).
 */

import { CODEC_URLS } from "./codec-meta.js";

/* ── Kodek yükleyici (lazy + tekil) ───────────────────── */

const loading = new Map();

function loadCodec(id) {
  if (loading.has(id)) return loading.get(id);

  const p = (async () => {
    const cfg = CODEC_URLS[id];
    if (!cfg) throw new Error(`Bilinmeyen kodek: ${id}`);

    const mod = await import(/* @vite-ignore */ cfg.module);

    if (id === "oxipng") {
      // wasm-bindgen: wasm dosyasını modülün yanından kendisi bulur
      await mod.init();
      return mod;
    }

    // Emscripten kodekleri: .wasm konumunu açıkça bildir
    await mod.init(undefined, {
      locateFile: (file) => cfg.wasmBase + file,
    });
    return mod;
  })();

  loading.set(id, p);
  p.catch(() => loading.delete(id)); // başarısızsa tekrar denenebilsin
  return p;
}

/* ── Piksel hazırlama ─────────────────────────────────── */

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("Tarayıcı OffscreenCanvas desteklemiyor");
  }
  return new OffscreenCanvas(w, h);
}

/**
 * Kaynağı hedef boyutta ImageData'ya çevirir.
 * flattenOn verilirse (JPEG gibi alfasız formatlar) saydamlık o renkle doldurulur.
 */
async function toImageData(source, sizing, flattenOn) {
  let bitmap = null;
  let srcW;
  let srcH;

  if (source.kind === "blob") {
    bitmap = await createImageBitmap(source.blob, {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    });
    srcW = bitmap.width;
    srcH = bitmap.height;
  } else {
    srcW = source.imageData.width;
    srcH = source.imageData.height;
  }

  const target = sizing(srcW, srcH);
  const needsResize = target.width !== srcW || target.height !== srcH;

  // Hızlı yol: ölçekleme ve düzleştirme gerekmiyorsa ImageData'yı olduğu gibi kullan
  if (source.kind === "imageData" && !needsResize && !flattenOn) {
    return { imageData: source.imageData, srcW, srcH };
  }

  const canvas = makeCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (flattenOn) {
    ctx.fillStyle = flattenOn;
    ctx.fillRect(0, 0, target.width, target.height);
  }

  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();
  } else {
    const tmp = makeCanvas(srcW, srcH);
    tmp.getContext("2d").putImageData(source.imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0, target.width, target.height);
  }

  return {
    imageData: ctx.getImageData(0, 0, target.width, target.height),
    srcW,
    srcH,
  };
}

/* ── Encoder'lar ──────────────────────────────────────── */

const ENCODERS = {
  async webp(imageData, options) {
    const mod = await loadCodec("webp");
    return mod.default(imageData, options);
  },

  async jpeg(imageData, options) {
    const mod = await loadCodec("jpeg");
    return mod.default(imageData, options);
  },

  async avif(imageData, options) {
    const mod = await loadCodec("avif");
    return mod.default(imageData, options);
  },

  async png(imageData, options) {
    const mod = await loadCodec("oxipng");
    // optimise() ImageData verildiğinde ham pikselden doğrudan PNG üretir
    return mod.default(imageData, options);
  },
};

/* ── Mesaj döngüsü ────────────────────────────────────── */

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "warmup") {
    try {
      await loadCodec(msg.codec);
      self.postMessage({ id: msg.id, ok: true });
    } catch (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err) });
    }
    return;
  }

  if (msg.type !== "encode") return;

  try {
    const { format, options, resize, background } = msg;

    const encoder = ENCODERS[format];
    if (!encoder) throw new Error(`Desteklenmeyen çıktı formatı: ${format}`);

    const sizing = (w, h) => computeSize(w, h, resize);
    const { imageData, srcW, srcH } = await toImageData(
      msg.source,
      sizing,
      background || null,
    );

    const buffer = await encoder(imageData, options);

    self.postMessage(
      {
        id: msg.id,
        ok: true,
        buffer,
        width: imageData.width,
        height: imageData.height,
        srcWidth: srcW,
        srcHeight: srcH,
      },
      [buffer],
    );
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: (err && err.message) || String(err),
    });
  }
};

/* utils.js'i worker'a taşımamak için küçük bir kopya —
   ana thread sürümüyle davranışı aynı tutulmalı */
function computeSize(srcW, srcH, opt) {
  const o = opt || {};
  const mode = o.mode || "none";
  let w = srcW;
  let h = srcH;

  if (mode === "width" && o.width > 0) {
    w = o.width;
    h = Math.round((srcH * o.width) / srcW);
  } else if (mode === "height" && o.height > 0) {
    h = o.height;
    w = Math.round((srcW * o.height) / srcH);
  } else if (mode === "fit" && (o.width > 0 || o.height > 0)) {
    const maxW = o.width > 0 ? o.width : Infinity;
    const maxH = o.height > 0 ? o.height : Infinity;
    const r = Math.min(maxW / srcW, maxH / srcH);
    w = Math.round(srcW * r);
    h = Math.round(srcH * r);
  } else if (mode === "scale" && o.scale > 0) {
    w = Math.round(srcW * o.scale);
    h = Math.round(srcH * o.scale);
  } else if (mode === "exact" && o.width > 0 && o.height > 0) {
    w = o.width;
    h = o.height;
  }

  if (o.noUpscale && (w > srcW || h > srcH)) {
    w = srcW;
    h = srcH;
  }

  return { width: Math.max(1, w | 0), height: Math.max(1, h | 0) };
}
