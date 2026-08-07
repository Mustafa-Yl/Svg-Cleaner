/**
 * Uygulama giriş noktası.
 *
 * ═══ YENİ MODÜL EKLEME ═══════════════════════════════════
 * 1) js/tools/ altında bir dosya oluştur (registry.js'teki sözleşmeye bak)
 * 2) Buraya import et
 * 3) register() listesine ekle
 * Sıra, bu listedeki sırayla aynıdır.
 * ═════════════════════════════════════════════════════════
 */

import * as registry from "./core/registry.js";
import { boot } from "./core/shell.js";
import { toast } from "./core/toast.js";

import svgCleaner from "./tools/svg-cleaner.js";
import imageConverter from "./tools/image-converter.js";
import imageOptimizer from "./tools/image-optimizer.js";
import svgRasterizer from "./tools/svg-rasterizer.js";

[svgCleaner, imageConverter, imageOptimizer, svgRasterizer].forEach(
  registry.register,
);

boot();

// Beklenmeyen hataları sessizce yutma — kullanıcıya göster
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  const msg = (e.reason && e.reason.message) || String(e.reason);
  if (!/AbortError|iptal/i.test(msg)) toast("Hata: " + msg, "err", 5000);
});
