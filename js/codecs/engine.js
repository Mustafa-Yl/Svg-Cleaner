/**
 * Dönüştürme motoru — araç modüllerinin tek temas noktası.
 *
 * Araçlar worker'ı, wasm yüklemeyi ya da SVG rasterizasyonunu bilmez;
 * sadece convert() çağırır.
 */

import { WorkerPool } from "./pool.js";
import { FORMATS, toEncoderOptions } from "./codec-meta.js";
import { rasterizeSvg, svgIntrinsicSize } from "./svg-raster.js";
import { computeSize, extOf } from "../core/utils.js";

/**
 * Worker fabrikası.
 *
 * `new Worker(new URL("...", import.meta.url), { type: "module" })` ifadesi
 * TEK PARÇA hâlinde durmak zorunda: paketleyiciler (Vite/Rollup) worker'ı
 * ancak bu deseni birebir görünce tanıyıp ayrı bir bundle olarak derliyor.
 * URL'i değişkene alıp başka dosyaya geçirirsen worker ham kaynak olarak
 * kopyalanır ve yayında `./codec-meta.js` bulunamadığı için çöker.
 *
 * Bu hâliyle hem paketlenmiş derlemede hem de paketleyicisiz (Live Server)
 * çalışır — standart sözdizimi, Vite'a özel bir şey yok.
 */
const spawnWorker = () =>
  new Worker(new URL("./convert.worker.js", import.meta.url), {
    type: "module",
  });

let pool = null;

export function getPool() {
  if (!pool) pool = new WorkerPool(spawnWorker);
  return pool;
}

/** Ortam desteğini kontrol et — eksikse kullanıcıya anlamlı mesaj göster */
export function checkSupport() {
  const problems = [];

  if (location.protocol === "file:") {
    problems.push(
      "Sayfa file:// ile açılmış. ES modülleri ve Web Worker'lar bu şekilde çalışmaz — yerel bir sunucu üzerinden açın.",
    );
  }
  if (typeof OffscreenCanvas === "undefined") {
    problems.push("Tarayıcınız OffscreenCanvas desteklemiyor.");
  }
  if (typeof WebAssembly === "undefined") {
    problems.push("Tarayıcınız WebAssembly desteklemiyor.");
  }
  if (typeof createImageBitmap === "undefined") {
    problems.push("Tarayıcınız createImageBitmap desteklemiyor.");
  }

  return { ok: problems.length === 0, problems };
}

/** Kodeği arka planda önden yükle */
export function warmup(formatId) {
  const codec = formatId === "png" ? "oxipng" : formatId;
  if (!FORMATS[formatId]) return Promise.resolve();
  return getPool().warmup(codec);
}

/**
 * Tek bir dosyayı dönüştürür.
 *
 * @param {File|Blob} file
 * @param {object} cfg
 * @param {string} cfg.format      Çıktı formatı id'si (webp/jpeg/png/avif)
 * @param {object} cfg.options     Ham UI değerleri (toEncoderOptions ile çevrilir)
 * @param {object} [cfg.resize]    {mode,width,height,scale,noUpscale}
 * @param {string} [cfg.background] Alfasız formatlar için zemin rengi
 * @returns {Promise<{blob:Blob,width:number,height:number,srcWidth:number,srcHeight:number,mime:string,ext:string}>}
 */
export async function convert(file, cfg) {
  const fmt = FORMATS[cfg.format];
  if (!fmt) throw new Error(`Bilinmeyen format: ${cfg.format}`);

  const encoderOptions = toEncoderOptions(cfg.format, cfg.options || {});
  const background = fmt.alpha ? null : cfg.background || "#ffffff";
  const resize = cfg.resize || { mode: "none" };

  const source = await buildSource(file, resize, background);

  const res = await getPool().run(
    {
      type: "encode",
      source: source.payload,
      format: cfg.format,
      options: encoderOptions,
      // SVG zaten hedef boyutta rasterize edildi, tekrar ölçekleme
      resize: source.preSized ? { mode: "none" } : resize,
      background,
    },
    source.transfer,
  );

  return {
    blob: new Blob([res.buffer], { type: fmt.mime }),
    width: res.width,
    height: res.height,
    srcWidth: source.srcWidth ?? res.srcWidth,
    srcHeight: source.srcHeight ?? res.srcHeight,
    mime: fmt.mime,
    ext: fmt.ext,
  };
}

/**
 * SVG ise ana thread'de rasterize eder, değilse blob'u olduğu gibi worker'a bırakır.
 */
async function buildSource(file, resize, background) {
  const isSvg =
    file.type === "image/svg+xml" ||
    extOf(file.name || "") === "svg";

  if (!isSvg) {
    return { payload: { kind: "blob", blob: file }, transfer: [] };
  }

  const text = await file.text();
  const intrinsic = svgIntrinsicSize(text);
  if (!intrinsic) throw new Error("SVG ayrıştırılamadı");

  // SVG vektörel: doğrudan hedef çözünürlükte çiz — önce çizip sonra
  // ölçeklemek keskinliği kaybettirir
  const target = computeSize(intrinsic.width, intrinsic.height, {
    ...resize,
    noUpscale: false, // vektörde büyütme kayıp değildir
  });

  const imageData = await rasterizeSvg(
    text,
    target.width,
    target.height,
    background,
  );

  return {
    payload: { kind: "imageData", imageData },
    transfer: [imageData.data.buffer],
    preSized: true,
    srcWidth: Math.round(intrinsic.width),
    srcHeight: Math.round(intrinsic.height),
  };
}

/* ── Yardımcılar (kart/önizleme için) ──────────────────── */

/** Dosyanın piksel boyutunu okur (encode etmeden) */
export async function readDimensions(file) {
  if (file.type === "image/svg+xml" || extOf(file.name || "") === "svg") {
    const size = svgIntrinsicSize(await file.text());
    return size ? { width: Math.round(size.width), height: Math.round(size.height) } : null;
  }
  try {
    const bmp = await createImageBitmap(file);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return null;
  }
}

/** Kart küçük resmi için object URL (SVG dahil hepsi <img> ile gösterilebilir) */
export function thumbUrl(file) {
  return URL.createObjectURL(file);
}
