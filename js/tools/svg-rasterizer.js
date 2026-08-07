/**
 * SVG → Raster (çoklu boyut).
 *
 * Tek bir SVG'den seçilen tüm piksel boyutlarını üretir — favicon / uygulama
 * ikonu / mağaza görseli seti çıkarmak için. Tüm boyutlar tek ZIP'te iner.
 * SVG Cleaner ile doğal eş: önce temizle, sonra buradan dışa aktar.
 */

import { BatchTool } from "./base/batch-tool.js";
import { OptionsPanel, isPrimary, isAdvanced, step, infoBox } from "../core/ui-kit.js";
import { openModal } from "../core/modal.js";
import { toast } from "../core/toast.js";
import { fb, baseName, esc } from "../core/utils.js";
import { FORMATS, OUTPUT_FORMATS, defaultsFor } from "../codecs/codec-meta.js";
import { convert, checkSupport, warmup } from "../codecs/engine.js";
import { svgIntrinsicSize } from "../codecs/svg-raster.js";
import { fatalHtml } from "./shared/fatal.js";

const ICON = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>`;

const SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024];
const DEFAULT_SIZES = [32, 128, 512];

/** Yaygın senaryolar — tek tıkla doğru boyut setini seçer */
const SIZE_PRESETS = [
  { id: "favicon", label: "Favicon", hint: "16 · 32 · 48", sizes: [16, 32, 48] },
  { id: "web", label: "Web İkon", hint: "32 · 64 · 128", sizes: [32, 64, 128] },
  { id: "pwa", label: "PWA / Mobil", hint: "180 · 192 · 512", sizes: [180, 192, 512] },
  { id: "full", label: "Tam Set", hint: "16 → 512", sizes: [16, 32, 48, 64, 128, 192, 256, 512] },
];

const OUTPUT_SCHEMA = [
  {
    group: "Zemin",
    items: [
      { key: "transparent", type: "toggle", primary: true, label: "Saydam Zemin",
        desc: "Kapalıysa aşağıdaki renkle doldurulur", def: true },
      { key: "background", type: "color", primary: true, label: "Zemin Rengi",
        def: "#ffffff", showIf: (v) => !v.transparent },
    ],
  },
  {
    group: "Dosya Adı",
    items: [
      { key: "pattern", type: "select", primary: true, label: "Adlandırma Deseni", def: "name-size",
        options: [
          { value: "name-size", label: "logo-128.png" },
          { value: "name-sizex", label: "logo-128x128.png" },
          { value: "name@x", label: "logo@128.png" },
          { value: "size-only", label: "128.png" },
          { value: "folder", label: "logo/128.png" },
        ] },
      { key: "prefix", type: "text", label: "Ön Ek", placeholder: "icon-", def: "" },
    ],
  },
];

let state = null;

export default {
  id: "svg-rasterizer",
  name: "SVG → Raster",
  short: "RAS",
  navLabel: "İkon Seti",
  tagline: "Tek SVG'den çoklu boyutlu ikon seti",
  icon: ICON,
  accent: "orange",
  dropHint: "SVG dosyalarını bırak",

  sidebar() {
    return `
      ${step(1, "Boyutlar", "Hangi piksel boyutları üretilsin?", `
        <div class="preset-cards" data-el="sizePresets">
          ${SIZE_PRESETS.map(
            (p) => `<button type="button" class="preset-card" data-p="${p.id}"><b>${esc(p.label)}</b><span>${esc(p.hint)}</span></button>`,
          ).join("")}
        </div>
        <div class="size-grid" data-el="sizes">
          ${SIZES.map(
            (n) => `<button type="button" class="size-btn ${DEFAULT_SIZES.includes(n) ? "active" : ""}" data-v="${n}">${n}</button>`,
          ).join("")}
        </div>
        <div class="inline-row">
          <input type="number" class="ti" data-el="customSize" placeholder="Özel px" min="1" max="8192">
          <button class="btn-sm" data-el="addSize">Ekle</button>
        </div>
        <div data-el="sizeInfo"></div>
      `)}

      ${step(2, "Çıktı Formatı", null, `
        <div class="fmt-cards compact" data-el="fmt">
          ${OUTPUT_FORMATS.map(
            (f) => `
            <button type="button" class="fmt-card" data-v="${f.id}">
              <div class="fmt-top">
                <span class="fmt-ext">.${esc(f.ext)}</span>
                <span class="fmt-nm">${esc(f.label)}</span>
              </div>
              <span class="fmt-tag">${esc(f.tagline)}</span>
            </button>`,
          ).join("")}
        </div>
        <div class="tune-head">
          <span class="og-lbl bare">İnce Ayar</span>
          <button class="link-btn" data-el="advBtn">Gelişmiş</button>
        </div>
        <div data-el="quick"></div>
      `)}

      ${step(3, "Zemin & Ad", "İsteğe bağlı", `<div data-el="output"></div>`)}
    `;
  },

  workspace() {
    return `<div class="single-col" data-el="listHost"></div>`;
  },

  mount(ctx) {
    const support = checkSupport();
    if (!support.ok) {
      ctx.workspace.innerHTML = fatalHtml(support.problems);
      return;
    }

    const el = {};
    ["sizes", "sizePresets", "customSize", "addSize", "sizeInfo", "fmt", "quick", "advBtn", "output", "listHost"]
      .forEach((k) => (el[k] = ctx.sidebar.querySelector(`[data-el="${k}"]`) || ctx.workspace.querySelector(`[data-el="${k}"]`)));

    const s = ctx.settings;
    let sizes = Array.isArray(s.sizes) && s.sizes.length ? [...s.sizes] : [...DEFAULT_SIZES];
    let format = FORMATS[s.format] ? s.format : "png";
    let quickPanel = null;

    const enc = {};
    OUTPUT_FORMATS.forEach((f) => {
      enc[f.id] = { ...defaultsFor(f.id), ...((s.encode || {})[f.id] || {}) };
    });

    const output = new OptionsPanel(el.output, OUTPUT_SCHEMA, s.output,
      (v) => ctx.save({ output: v }));

    /* ── Boyutlar ── */
    function paintSizes() {
      sizes = [...new Set(sizes)].sort((a, b) => a - b);

      el.sizes.querySelectorAll(".size-btn").forEach((b) =>
        b.classList.toggle("active", sizes.includes(+b.dataset.v)),
      );
      el.sizes.querySelectorAll(".size-btn.custom").forEach((b) => b.remove());
      sizes
        .filter((n) => !SIZES.includes(n))
        .forEach((n) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "size-btn custom active";
          b.dataset.v = n;
          b.textContent = n;
          el.sizes.appendChild(b);
        });

      const activePreset = SIZE_PRESETS.find(
        (p) => p.sizes.length === sizes.length && p.sizes.every((x) => sizes.includes(x)),
      );
      el.sizePresets.querySelectorAll(".preset-card").forEach((b) =>
        b.classList.toggle("active", !!activePreset && b.dataset.p === activePreset.id),
      );

      el.sizeInfo.innerHTML = sizes.length
        ? infoBox(
            `Her SVG için <b>${sizes.length} dosya</b> üretilecek: ${sizes.join(" · ")} px`,
            "ok",
          )
        : infoBox("En az bir boyut seçmelisin.", "warn");

      ctx.save({ sizes });
      if (state && state.batch) state.batch.refresh();
    }

    el.sizes.addEventListener("click", (e) => {
      const b = e.target.closest(".size-btn");
      if (!b) return;
      const n = +b.dataset.v;
      sizes = sizes.includes(n) ? sizes.filter((x) => x !== n) : [...sizes, n];
      paintSizes();
    });

    el.sizePresets.addEventListener("click", (e) => {
      const b = e.target.closest(".preset-card");
      if (!b) return;
      const p = SIZE_PRESETS.find((x) => x.id === b.dataset.p);
      if (p) {
        sizes = [...p.sizes];
        paintSizes();
      }
    });

    const addCustom = () => {
      const n = parseInt(el.customSize.value, 10);
      if (!n || n < 1 || n > 8192) return toast("1–8192 arası bir sayı gir", "err");
      sizes = [...sizes, n];
      el.customSize.value = "";
      paintSizes();
    };
    el.addSize.addEventListener("click", addCustom);
    el.customSize.addEventListener("keydown", (e) => e.key === "Enter" && addCustom());

    /* ── Format ── */
    function buildQuick() {
      if (quickPanel) quickPanel.destroy();
      quickPanel = new OptionsPanel(el.quick, FORMATS[format].schema, enc[format],
        (v) => {
          enc[format] = { ...enc[format], ...v };
          ctx.save({ encode: enc });
        },
        { filter: isPrimary, flat: true },
      );
    }

    function setFormat(id) {
      format = id;
      el.fmt.querySelectorAll(".fmt-card").forEach((b) =>
        b.classList.toggle("active", b.dataset.v === id),
      );
      ctx.save({ format: id });
      buildQuick();
      warmup(id).catch(() => {});
      if (state && state.batch) state.batch.refreshTargets();
    }

    el.fmt.addEventListener("click", (e) => {
      const b = e.target.closest(".fmt-card");
      if (b) setFormat(b.dataset.v);
    });

    el.advBtn.addEventListener("click", () => {
      const host = document.createElement("div");
      host.className = "modal-options";
      const panel = new OptionsPanel(host, FORMATS[format].schema, enc[format],
        (v) => {
          enc[format] = { ...enc[format], ...v };
          ctx.save({ encode: enc });
          quickPanel.setValues(v);
        },
        { filter: isAdvanced },
      );
      openModal({
        title: `${FORMATS[format].label} — Gelişmiş Ayarlar`,
        body: host,
        footer: `<button class="btn-go sm" data-close>Tamam</button>`,
      });
    });

    /* ── Adlandırma ── */
    function nameFor(item, size) {
      const o = output.values;
      const base = (o.prefix || "") + baseName(item.file.name);
      const ext = FORMATS[format].ext;
      switch (o.pattern) {
        case "name-sizex": return `${base}-${size}x${size}.${ext}`;
        case "name@x":     return `${base}@${size}.${ext}`;
        case "size-only":  return `${size}.${ext}`;
        case "folder":     return `${base}/${size}.${ext}`;
        default:           return `${base}-${size}.${ext}`;
      }
    }

    /* ── Kuyruk ── */
    const batch = new BatchTool({
      host: el.listHost,
      accept: ".svg,image/svg+xml",
      actionLabel: "ÜRET",
      emptyIcon: "🎯",
      emptyTitle: "SVG Dosyalarını Buraya Bırak",
      emptyText: "Her SVG için seçtiğin tüm boyutlar üretilir",
      filter: (f) => /\.svg$/i.test(f.name) || f.type === "image/svg+xml",
      readDimensions: async (file) => {
        const d = svgIntrinsicSize(await file.text());
        return d ? { width: Math.round(d.width), height: Math.round(d.height) } : null;
      },
      targetLabel: () =>
        `${sizes.length}× ${FORMATS[format].label.toUpperCase()}`,

      process: async (item) => {
        if (!sizes.length) throw new Error("Hiç boyut seçilmedi");
        const bg = output.values.transparent ? null : output.values.background;
        const outputs = [];

        for (const size of sizes) {
          const res = await convert(item.file, {
            format,
            options: enc[format],
            resize: { mode: "exact", width: size, height: size },
            background: bg,
          });
          outputs.push({ size, blob: res.blob, width: res.width, height: res.height });
        }

        return {
          blob: outputs[outputs.length - 1].blob,
          outputs,
          totalSize: outputs.reduce((s, o) => s + o.blob.size, 0),
          label: `${outputs.length} boyut`,
        };
      },

      entriesFor: (item) =>
        item.result.outputs.map((o) => ({ name: nameFor(item, o.size), data: o.blob })),

      onRun: () => batch.processAll({ concurrency: 2 }),
      // Vektör kaynağı raster çıktıyla boyut olarak kıyaslamak anlamsız
      showDelta: false,
      onStats: (st) => renderStats(ctx.stats, st, sizes.length),
      zipName: "ikon-seti.zip",
    });

    state = { batch };

    paintSizes();
    setFormat(format);
  },

  onFiles(files) {
    if (state && state.batch) state.batch.add(files);
  },

  unmount() {
    if (state && state.batch) state.batch.destroy();
    state = null;
  },
};

function renderStats(host, s, sizeCount) {
  if (!s || !s.done) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `
    <div class="stat-item"><span class="stat-label">SVG</span><span class="stat-value n">${s.done}/${s.total}</span></div>
    <div class="stat-item"><span class="stat-label">Üretilen</span><span class="stat-value">${s.done * sizeCount}</span></div>
    <div class="stat-item"><span class="stat-label">Toplam</span><span class="stat-value n">${fb(s.outBytes)}</span></div>`;
}
