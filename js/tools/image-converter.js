/**
 * Görsel Dönüştürücü.
 *
 * Tasarım hedefi: kullanıcı sayfaya ilk baktığında "neyi neye çeviriyorum"
 * sorusunun cevabını okumadan görebilmeli.
 *   · Sidebar numaralı adımlar hâlinde: 1 Format seç → 2 Kalite → 3 Boyut
 *   · Her format kartı ne işe yaradığını ve nerede açıldığını yazar
 *   · Her dosya kartında "PNG → WEBP" rozeti var
 *   · Uzman ayarları modalda; sidebar sade kalır
 */

import { BatchTool } from "./base/batch-tool.js";
import { OptionsPanel, isPrimary, isAdvanced, step, infoBox } from "../core/ui-kit.js";
import { openModal } from "../core/modal.js";
import { toast } from "../core/toast.js";
import { fb, baseName, esc } from "../core/utils.js";
import {
  FORMATS,
  OUTPUT_FORMATS,
  defaultsFor,
  matchPreset,
  isSupportedInput,
  mayHaveAlpha,
} from "../codecs/codec-meta.js";
import { convert, readDimensions, warmup, checkSupport } from "../codecs/engine.js";
import { fatalHtml } from "./shared/fatal.js";

const ICON = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>`;

const RESIZE_SCHEMA = [
  {
    group: null,
    items: [
      {
        key: "mode", type: "select", primary: true, label: "Boyut",
        desc: "Çıktının piksel boyutu", def: "none",
        options: [
          { value: "none", label: "Orijinal boyutu koru" },
          { value: "width", label: "Genişliğe göre ölçekle" },
          { value: "height", label: "Yüksekliğe göre ölçekle" },
          { value: "fit", label: "Kutuya sığdır" },
          { value: "scale", label: "Yüzde olarak ölçekle" },
          { value: "exact", label: "Tam boyut (oran bozulabilir)" },
        ],
      },
      { key: "width", type: "number", primary: true, label: "Genişlik (px)", def: 1920, min: 1,
        showIf: (v) => ["width", "fit", "exact"].includes(v.mode) },
      { key: "height", type: "number", primary: true, label: "Yükseklik (px)", def: 1080, min: 1,
        showIf: (v) => ["height", "fit", "exact"].includes(v.mode) },
      { key: "scale", type: "slider", primary: true, label: "Ölçek", unit: "×",
        min: 0.1, max: 4, step: 0.1, def: 1, showIf: (v) => v.mode === "scale" },
      { key: "noUpscale", type: "toggle", primary: true, label: "Büyütmeyi Engelle",
        desc: "Orijinalden büyük çıktı üretilmez", def: true, showIf: (v) => v.mode !== "none" },
    ],
  },
];

const OUTPUT_SCHEMA = [
  {
    group: "Dosya Adı",
    items: [
      { key: "prefix", type: "text", primary: true, label: "Ön Ek", placeholder: "web-", def: "" },
      { key: "suffix", type: "text", primary: true, label: "Son Ek", placeholder: "-min", def: "" },
      { key: "keepExt", type: "toggle", label: "Kaynak Uzantısını Koru",
        desc: "logo.png → logo.png.webp", def: false },
    ],
  },
  {
    group: "Saydamlık",
    items: [
      { key: "background", type: "color", primary: true, label: "Zemin Rengi",
        desc: "Saydamlık desteklemeyen formatlarda kullanılır", def: "#ffffff" },
    ],
  },
];

let state = null;

export default {
  id: "image-converter",
  name: "Görsel Dönüştürücü",
  short: "DÖN",
  navLabel: "Dönüştür",
  tagline: "PNG · JPEG · WebP · AVIF · GIF · BMP · SVG",
  icon: ICON,
  accent: "blue",
  dropHint: "Görselleri bırak",

  sidebar() {
    return `
      ${step(1, "Çıktı Formatı", "Neye dönüştürmek istiyorsun?", `
        <div class="fmt-cards" data-el="fmt">
          ${OUTPUT_FORMATS.map(
            (f) => `
            <button type="button" class="fmt-card" data-v="${f.id}">
              <div class="fmt-top">
                <span class="fmt-ext">.${esc(f.ext)}</span>
                <span class="fmt-nm">${esc(f.label)}</span>
                ${f.alpha
                  ? `<span class="tag ok" title="Saydamlığı korur">Saydam ✓</span>`
                  : `<span class="tag off" title="Saydam alanlar zeminle doldurulur">Saydam ✕</span>`}
              </div>
              <span class="fmt-tag">${esc(f.tagline)}</span>
              <span class="fmt-dsc">${esc(f.desc)}</span>
              <span class="fmt-meta">${esc(f.engine)} · ${esc(f.support)}</span>
            </button>`,
          ).join("")}
        </div>
        <div data-el="alphaWarn"></div>
      `)}

      ${step(2, "Kalite", "Boyut mu, görüntü mü öncelikli?", `
        <div class="preset-cards" data-el="presets"></div>
        <div class="tune-head">
          <span class="og-lbl bare">İnce Ayar</span>
          <button class="link-btn" data-el="advBtn">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            Gelişmiş
          </button>
        </div>
        <div data-el="quick"></div>
      `)}

      ${step(3, "Boyut & Ad", "İsteğe bağlı", `
        <div data-el="resize"></div>
        <div class="sub-block" data-el="output"></div>
      `)}
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
    ["fmt", "presets", "quick", "advBtn", "resize", "output", "listHost", "alphaWarn"].forEach(
      (k) => (el[k] = ctx.sidebar.querySelector(`[data-el="${k}"]`) || ctx.workspace.querySelector(`[data-el="${k}"]`)),
    );

    const s = ctx.settings;
    let format = FORMATS[s.format] ? s.format : "webp";

    // Her formatın ayarları ayrı tutulur; sekme değişince kaybolmaz
    const enc = {};
    OUTPUT_FORMATS.forEach((f) => {
      enc[f.id] = { ...defaultsFor(f.id), ...((s.encode || {})[f.id] || {}) };
    });

    let quickPanel = null;
    let advPanel = null;

    /* ── Boyut & çıktı panelleri ── */
    const resizePanel = new OptionsPanel(el.resize, RESIZE_SCHEMA, s.resize,
      (v) => ctx.save({ resize: v }));

    const outputPanel = new OptionsPanel(el.output, OUTPUT_SCHEMA, s.output,
      (v) => {
        ctx.save({ output: v });
        batch.refreshTargets();
      });

    /* ── Format ── */
    function setFormat(id, { silent = false } = {}) {
      format = id;
      el.fmt.querySelectorAll(".fmt-card").forEach((b) =>
        b.classList.toggle("active", b.dataset.v === id),
      );
      ctx.save({ format: id });

      buildQuick();
      buildPresets();
      updateAlphaWarning();
      warmup(id).catch(() => {});
      if (!silent) batch.refreshTargets();
    }

    /* ── Kalite: hazır profiller + temel ayarlar ── */
    function buildPresets() {
      const f = FORMATS[format];
      const activeId = matchPreset(format, enc[format]);

      el.presets.innerHTML = (f.presets || [])
        .map(
          (p) => `
          <button type="button" class="preset-card ${p.id === activeId ? "active" : ""}" data-p="${p.id}">
            <b>${esc(p.label)}</b>
            <span>${esc(p.hint)}</span>
          </button>`,
        )
        .join("") + `<button type="button" class="preset-card ${activeId ? "" : "active"}" data-p="custom"><b>Özel</b><span>Kendi ayarların</span></button>`;
    }

    function buildQuick() {
      if (quickPanel) quickPanel.destroy();
      quickPanel = new OptionsPanel(
        el.quick,
        FORMATS[format].schema,
        enc[format],
        (v) => {
          enc[format] = { ...enc[format], ...v };
          ctx.save({ encode: enc });
          buildPresets();
        },
        { filter: isPrimary, flat: true },
      );
    }

    el.presets.addEventListener("click", (e) => {
      const b = e.target.closest(".preset-card");
      if (!b || b.dataset.p === "custom") return;
      const p = (FORMATS[format].presets || []).find((x) => x.id === b.dataset.p);
      if (!p) return;
      enc[format] = { ...enc[format], ...p.values };
      ctx.save({ encode: enc });
      quickPanel.setValues(p.values);
      buildPresets();
    });

    /* ── Gelişmiş ayarlar modalı ── */
    el.advBtn.addEventListener("click", () => {
      const host = document.createElement("div");
      host.className = "modal-options";

      advPanel = new OptionsPanel(
        host,
        FORMATS[format].schema,
        enc[format],
        (v) => {
          enc[format] = { ...enc[format], ...v };
          ctx.save({ encode: enc });
          quickPanel.setValues(v);
          buildPresets();
        },
        { filter: isAdvanced },
      );

      const foot = document.createElement("div");
      foot.innerHTML = `<button class="btn-sm" data-reset>Varsayılanlara Dön</button>
                        <button class="btn-go sm" data-close>Tamam</button>`;
      foot.querySelector("[data-reset]").addEventListener("click", () => {
        enc[format] = defaultsFor(format);
        ctx.save({ encode: enc });
        advPanel.setValues(enc[format]);
        quickPanel.setValues(enc[format]);
        buildPresets();
        toast("Varsayılan ayarlara dönüldü", "inf");
      });

      openModal({
        title: `${FORMATS[format].label} — Gelişmiş Ayarlar`,
        subtitle: `${FORMATS[format].engine} encoder parametreleri`,
        body: host,
        footer: foot,
        onClose: () => {
          advPanel = null;
        },
      });
    });

    /* ── Saydamlık uyarısı ── */
    function updateAlphaWarning() {
      const risky =
        !FORMATS[format].alpha && batch && batch.items.some((i) => mayHaveAlpha(i.file));
      el.alphaWarn.innerHTML = risky
        ? infoBox(
            `<b>${FORMATS[format].label} saydamlık desteklemez.</b> Saydam alanlar
             <span class="swatch" style="background:${esc(outputPanel.values.background)}"></span>
             zemin rengiyle doldurulacak. Rengi 3. adımdan değiştirebilirsin.`,
            "warn",
          )
        : "";
    }

    /* ── Kuyruk ── */
    const batch = new BatchTool({
      host: el.listHost,
      accept: "image/*,.svg,.avif,.bmp,.ico",
      actionLabel: "DÖNÜŞTÜR",
      emptyIcon: "🖼",
      emptyTitle: "Görselleri Buraya Bırak",
      emptyText: "PNG · JPEG · WebP · AVIF · GIF · BMP · ICO · SVG kabul edilir",
      filter: isSupportedInput,
      readDimensions,
      targetLabel: () => FORMATS[format].label.toUpperCase(),
      outputName: (item) => {
        const o = outputPanel.values;
        const base = o.keepExt ? item.file.name : baseName(item.file.name);
        return `${o.prefix || ""}${base}${o.suffix || ""}.${FORMATS[format].ext}`;
      },
      process: (item) =>
        convert(item.file, {
          format,
          options: enc[format],
          resize: resizePanel.values,
          background: outputPanel.values.background,
        }),
      onRun: async () => {
        await batch.processAll({ concurrency: 4 });
      },
      onStats: (st) => {
        renderStats(ctx.stats, st);
        updateAlphaWarning();
      },
      // Fonksiyon da olabilir — hedef format değiştikçe ZIP adı da değişsin
      zipName: () => `donusturulmus-${FORMATS[format].ext}.zip`,
    });

    state = { batch };

    el.fmt.addEventListener("click", (e) => {
      const b = e.target.closest(".fmt-card");
      if (b) setFormat(b.dataset.v);
    });

    setFormat(format, { silent: true });
  },

  onFiles(files) {
    if (state && state.batch) state.batch.add(files);
  },

  unmount() {
    if (state && state.batch) state.batch.destroy();
    state = null;
  },
};

function renderStats(host, s) {
  if (!s || !s.total) {
    host.innerHTML = "";
    return;
  }
  if (!s.done) {
    host.innerHTML = `<div class="stat-item"><span class="stat-label">Kuyruk</span><span class="stat-value n">${s.total}</span></div>`;
    return;
  }
  host.innerHTML = `
    <div class="stat-item"><span class="stat-label">Hazır</span><span class="stat-value n">${s.done}/${s.total}</span></div>
    <div class="stat-item"><span class="stat-label">Önce</span><span class="stat-value n">${fb(s.inBytes)}</span></div>
    <div class="stat-item"><span class="stat-label">Sonra</span><span class="stat-value">${fb(s.outBytes)}</span></div>
    <div class="stat-item"><span class="stat-label">Kazanç</span><span class="stat-value ${s.savedPct >= 0 ? "" : "bad"}">${s.savedPct >= 0 ? "−" : "+"}${Math.abs(s.savedPct).toFixed(0)}%</span></div>`;
}
