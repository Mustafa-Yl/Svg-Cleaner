import { download, safeName } from "./utils.js";

/**
 * JSZip sarmalayıcı. JSZip global script olarak yüklenir (index.html).
 * Aynı isimli dosyalar için otomatik "-1", "-2" eki üretir.
 */
export async function buildZip(entries, { onProgress } = {}) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip yüklenemedi");
  }

  const zip = new JSZip();
  const used = new Map();

  entries.forEach(({ name, data }) => {
    let finalName = safeName(name);

    if (used.has(finalName)) {
      const n = used.get(finalName) + 1;
      used.set(finalName, n);
      const dot = finalName.lastIndexOf(".");
      finalName =
        dot > 0
          ? `${finalName.slice(0, dot)}-${n}${finalName.slice(dot)}`
          : `${finalName}-${n}`;
    } else {
      used.set(finalName, 0);
    }

    zip.file(finalName, data);
  });

  return zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (meta) => onProgress && onProgress(meta.percent),
  );
}

/**
 * @param {string|(()=>string)} zipName  Sabit ad ya da ad üreten fonksiyon
 * @returns {Promise<Blob>} Üretilen ZIP (boyutunu raporlamak için)
 */
export async function downloadZip(entries, zipName, opts) {
  const blob = await buildZip(entries, opts);
  let name = typeof zipName === "function" ? zipName() : zipName;
  name = String(name || "cikti.zip");
  if (!name.toLowerCase().endsWith(".zip")) name += ".zip";
  download(blob, name);
  return blob;
}
