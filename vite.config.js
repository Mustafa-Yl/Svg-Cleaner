import { defineConfig } from "vite";

/**
 * Yayın derlemesi.
 *
 * Kaynak kodu geliştirirken hiç değişmiyor — `npm run dev` ile aynı modüler
 * yapıyı çalıştırırsın. `npm run build` yalnızca yayına gidecek `dist/`
 * klasörünü üretir.
 *
 * ── Neden Vite ────────────────────────────────────────────
 * engine.js şu deseni kullanıyor:
 *     new Worker(new URL("./convert.worker.js", import.meta.url), { type: "module" })
 * Bu, worker'ı ayrı bir dosya olarak tutmanın standart yolu ve Vite bunu
 * otomatik tanıyıp worker'ı da paketleyip minify ediyor. Düz esbuild/rollup
 * bu deseni kendiliğinden çözmez.
 *
 * ── dist/ içine ne girer ──────────────────────────────────
 * index.html + hash'li js/css + favicon. Sadece index.html'den ulaşılabilen
 * dosyalar derlemeye girer; DEVELOPMENT.md, README.md, eski script.js gibi
 * dosyalar hiçbir zaman kopyalanmaz.
 */
export default defineConfig({
  // Göreli yol: proje hem kullanici.github.io/ hem kullanici.github.io/repo/
  // altında, hem de dist/index.html çift tıklanarak (file://) aynı şekilde
  // çalışsın diye. Alt dizin adını hiçbir yere yazmana gerek yok.
  base: "./",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022", // module worker + OffscreenCanvas zaten bu seviyeyi gerektiriyor
    minify: "terser",
    cssMinify: true,
    sourcemap: false,
    assetsInlineLimit: 4096, // küçük SVG'ler base64 olarak gömülür

    terserOptions: {
      compress: {
        drop_console: true, // console.log/warn/error yayında sessiz
        drop_debugger: true,
        passes: 2,
      },
      format: {
        comments: false,
      },
    },

    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },

  worker: {
    // ES modülü olarak kalsın: convert.worker.js kodekleri dinamik import()
    // ile yüklüyor, IIFE formatında bu güvenilir çalışmaz.
    format: "es",
  },

  server: {
    port: 8080,
    open: true,
  },

  preview: {
    port: 8080,
  },
});
