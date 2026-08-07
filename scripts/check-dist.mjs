/**
 * Derleme denetleyicisi — `npm run build` sonrası otomatik çalışır.
 *
 * Yayına çıkmadan önce sessizce bozulabilecek şeyleri yakalar:
 *
 *  1. Kırık göreli import  — bir bundle, dist içinde olmayan bir dosyayı
 *     import ediyorsa (worker'ın paketlenmemesi bu şekilde ortaya çıkar)
 *  2. Sızıntı              — DEVELOPMENT.md, sourcemap, ham kaynak klasörü
 *  3. Paketlenmemiş worker — içinde yorum satırları / okunur kod kalmışsa
 *  4. Eksik kodek URL'i    — CDN adresleri minify sırasında kaybolmuşsa
 *  5. Mutlak yol           — GitHub Pages alt dizininde kırılacak "/assets/…"
 *
 * Sorun bulursa çıkış kodu 1 verir, böylece CI yayını durdurur.
 */

import fs from "node:fs";
import path from "node:path";

const DIST = "dist";
const problems = [];
const notes = [];

/* ── Yardımcılar ─────────────────────────────────────── */

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const rel = (p) => p.split(path.sep).join("/").replace(/^dist\//, "");
const kb = (n) => (n / 1024).toFixed(1) + " kB";

/* ── 0. dist var mı ──────────────────────────────────── */

if (!fs.existsSync(DIST)) {
  console.error("✗ dist/ yok. Önce `npm run build` çalıştır.");
  process.exit(1);
}

const files = walk(DIST);
const present = new Set(files.map(rel));
const jsFiles = files.filter((f) => f.endsWith(".js"));

/* ── 1. Kırık göreli import ──────────────────────────── */

// Minify edilmiş kodda boşluk yoktur (`}from"./x"`), o yüzden \s'e güvenilmez.
// Yakaladıkları:  from"./x"  ·  import"./x"  ·  import("./x")  ·  export*from"./x"
const IMPORT_RE = /\b(?:from|import|require)\s*\(?\s*["'](\.\.?\/[^"']*)["']/g;

for (const file of jsFiles) {
  const src = fs.readFileSync(file, "utf8");
  const dir = path.dirname(rel(file));
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (!spec) continue;
    const target = path.posix.normalize(path.posix.join(dir, spec));
    if (!present.has(target)) {
      problems.push(
        `Kırık import: ${rel(file)} → "${spec}" (dist içinde ${target} yok).\n` +
          `    Sebep genelde worker'ın paketlenmemesidir — engine.js'teki\n` +
          `    new Worker(new URL(...)) ifadesinin tek parça olduğundan emin ol.`,
      );
    }
  }
}

/* ── 2. Sızıntı ──────────────────────────────────────── */

const FORBIDDEN = [
  [/^DEVELOPMENT\.md$/i, "geliştirme kılavuzu"],
  [/^README\.md$/i, "readme"],
  [/^package(-lock)?\.json$/i, "paket tanımı"],
  [/^vite\.config\./i, "derleme yapılandırması"],
  [/\.map$/i, "sourcemap"],
  [/^js\//i, "ham kaynak klasörü"],
  [/^scripts\//i, "yardımcı script klasörü"],
  [/^\.github\//i, "CI yapılandırması"],
  [/^script\.js$/i, "eski script.js"],
];

for (const f of present) {
  for (const [re, what] of FORBIDDEN) {
    if (re.test(f)) problems.push(`Sızıntı: dist/${f} (${what}) yayına girmemeli.`);
  }
}

/* ── 3. Worker paketlenmiş mi ────────────────────────── */

const workers = jsFiles.filter((f) => /worker/i.test(path.basename(f)));
if (!workers.length) {
  problems.push("Worker bundle'ı bulunamadı — dönüştürme çalışmaz.");
} else {
  for (const w of workers) {
    const src = fs.readFileSync(w, "utf8");
    // Minify edilmiş kodda blok yorumu ve girintili satır kalmaz
    if (src.includes("/**") || /\n {2,}\w/.test(src)) {
      problems.push(
        `Worker paketlenmemiş görünüyor: ${rel(w)} ham kaynak gibi duruyor.`,
      );
    }
    notes.push(`worker: ${rel(w)} (${kb(src.length)})`);
  }
}

/* ── 4. Kodek CDN adresleri duruyor mu ───────────────── */

const allJs = jsFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
for (const [name, needle] of [
  ["libwebp", "@jsquash/webp"],
  ["MozJPEG", "@jsquash/jpeg"],
  ["libavif", "@jsquash/avif"],
  ["OxiPNG", "@jsquash/oxipng"],
]) {
  if (!allJs.includes(needle)) {
    problems.push(`Kodek adresi kayıp: ${name} (${needle}) hiçbir bundle'da yok.`);
  }
}

/* ── 5. Mutlak varlık yolu (alt dizinde kırılır) ─────── */

const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="(\/[^/"][^"]*)"/g)) {
  problems.push(
    `Mutlak yol: index.html içinde "${m[1]}" — GitHub Pages alt dizininde kırılır.\n` +
      `    vite.config.js içinde base: "./" olmalı.`,
  );
}

/* ── Rapor ───────────────────────────────────────────── */

const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);

console.log("\n── Derleme denetimi ──");
console.log(`   ${files.length} dosya · ${kb(total)}`);
files
  .sort()
  .forEach((f) => console.log(`   ${rel(f).padEnd(38)} ${kb(fs.statSync(f).size)}`));
notes.forEach((n) => console.log(`   · ${n}`));

if (problems.length) {
  console.error(`\n✗ ${problems.length} sorun:\n`);
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
  process.exit(1);
}

console.log("\n✓ Derleme temiz — yayına hazır.\n");
