/**
 * Görsel Optimizasyon — format değiştirmeden yeniden sıkıştırır.
 * PNG → OxiPNG · JPEG → MozJPEG · WebP → libwebp · AVIF → libavif
 *
 * Dönüştürücüden farkı: hedef formatı kullanıcı seçmez, her dosya kendi
 * formatında kalır. Kartlarda "PNG → PNG" görünür, bu kasıtlıdır — kullanıcı
 * formatın değişmediğini görmelidir.
 */

import { BatchTool } from "./base/batch-tool.js";
import { OptionsPanel, isPrimary, isAdvanced, step, infoBox } from "../core/ui-kit.js";
import { openModal } from "../core/modal.js";
import { toast } from "../core/toast.js";
import { fb, baseName, extOf, esc } from "../core/utils.js";
import {
  FORMATS,
  OUTPUT_FORMATS,
  defaultsFor,
  matchPreset,
  isSupportedInput,
} from "../codecs/codec-meta.js";
import { convert, readDimensions, checkSupport } from "../codecs/engine.js";
import { fatalHtml } from "./shared/fatal.js";

const ICON = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/></svg>`;

/** Girdi uzantısı -> aynı kalacak hedef encoder */
const KEEP_MAP = {
  png: "png", jpg: "jpeg", jpeg: "jpeg", jfif: "jpeg",
  webp: "webp", avif: "avif",
  // Kodlanamayanlar PNG'ye alınır
  gif: "png", bmp: "png", ico: "png", svg: "png",
};

function targetFor(file) {
  const ext = extOf(file.name);
  if (KEEP_MAP[ext]) return KEEP_MAP[ext];
  if (file.type === "image/jpeg") return "jpeg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/avif") return "avif";
  return "png";
}

const GENERAL_SCHEMA = [
  {
    group: null,
    items: [
      { key: "onlyIfSmaller", type: "toggle", primary: true, label: "Sadece Küçülürse Kabul Et",
        desc: "Çıktı büyürse orijinal dosya korunur", def: true },
      { key: "suffix", type: "text", primary: true, label: "Son Ek",
        placeholder: "-min", def: "-min" },
      { key: "background", type: "color", primary: true, label: "JPEG Zemin Rengi",
        desc: "Saydam alanlar bu renkle doldurulur", def: "#ffffff" },
    ],
  },
];

let state = null;

export default {
  id: "image-optimizer",
  name: "Görsel Optimizasyon",
  short: "OPT",
  navLabel: "Optimize",
  tagline: "Format aynı kalır, dosya küçülür",
  icon: ICON,
  accent: "green",
  dropHint: "Optimize edilecek görselleri bırak",

  sidebar() {
    return `
      ${step(1, "Nasıl Çalışır", null, infoBox(
        `Her dosya <b>kendi formatında</b> kalır — PNG PNG olarak, JPEG JPEG olarak
         yeniden sıkıştırılır. Format değiştirmek istiyorsan
         <a href="#image-converter">Dönüştürücü</a>'yü kullan.`,
        "info",
      ))}

      ${step(2, "Sıkıştırma Ayarı", "Düzenlenecek formatı seç", `
        <div class="seg seg-wide" data-el="fmtTabs">
          ${OUTPUT_FORMATS.map(
            (f, i) => `<button type="button" class="seg-btn ${i === 0 ? "active" : ""}" data-v="${f.id}">${esc(f.label)}</button>`,
          ).join("")}
        </div>
        <div class="preset-cards" data-el="presets"></div>
        <div class="tune-head">
          <span class="og-lbl bare">İnce Ayar</span>
          <button class="link-btn" data-el="advBtn">Gelişmiş</button>
        </div>
        <div data-el="quick"></div>
      `)}

      ${step(3, "Genel", null, `<div data-el="general"></div>`)}
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
    ["fmtTabs", "presets", "quick", "advBtn", "general", "listHost"].forEach(
      (k) => (el[k] = ctx.sidebar.querySelector(`[data-el="${k}"]`) || ctx.workspace.querySelector(`[data-el="${k}"]`)),
    );

    const s = ctx.settings;
    let editing = "webp";
    let quickPanel = null;

    const enc = {};
    OUTPUT_FORMATS.forEach((f) => {
      enc[f.id] = { ...defaultsFor(f.id), ...((s.encode || {})[f.id] || {}) };
    });

    const general = new OptionsPanel(el.general, GENERAL_SCHEMA, s.general,
      (v) => ctx.save({ general: v }));

    function buildPresets() {
      const f = FORMATS[editing];
      const activeId = matchPreset(editing, enc[editing]);
      el.presets.innerHTML =
        (f.presets || [])
          .map((p) => `<button type="button" class="preset-card ${p.id === activeId ? "active" : ""}" data-p="${p.id}"><b>${esc(p.label)}</b><span>${esc(p.hint)}</span></button>`)
          .join("") +
        `<button type="button" class="preset-card ${activeId ? "" : "active"}" data-p="custom"><b>Özel</b><span>Kendi ayarların</span></button>`;
    }

    function showEncoder(id) {
      editing = id;
      el.fmtTabs.querySelectorAll(".seg-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.v === id),
      );
      if (quickPanel) quickPanel.destroy();
      quickPanel = new OptionsPanel(el.quick, FORMATS[id].schema, enc[id],
        (v) => {
          enc[id] = { ...enc[id], ...v };
          ctx.save({ encode: enc });
          buildPresets();
        },
        { filter: isPrimary, flat: true },
      );
      buildPresets();
    }

    el.fmtTabs.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (b) showEncoder(b.dataset.v);
    });

    el.presets.addEventListener("click", (e) => {
      const b = e.target.closest(".preset-card");
      if (!b || b.dataset.p === "custom") return;
      const p = (FORMATS[editing].presets || []).find((x) => x.id === b.dataset.p);
      if (!p) return;
      enc[editing] = { ...enc[editing], ...p.values };
      ctx.save({ encode: enc });
      quickPanel.setValues(p.values);
      buildPresets();
    });

    el.advBtn.addEventListener("click", () => {
      const host = document.createElement("div");
      host.className = "modal-options";
      const panel = new OptionsPanel(host, FORMATS[editing].schema, enc[editing],
        (v) => {
          enc[editing] = { ...enc[editing], ...v };
          ctx.save({ encode: enc });
          quickPanel.setValues(v);
          buildPresets();
        },
        { filter: isAdvanced },
      );
      openModal({
        title: `${FORMATS[editing].label} — Gelişmiş Ayarlar`,
        subtitle: `${FORMATS[editing].engine} encoder parametreleri`,
        body: host,
        footer: `<button class="btn-go sm" data-close>Tamam</button>`,
      });
    });

    const batch = new BatchTool({
      host: el.listHost,
      accept: "image/*,.avif,.bmp,.ico",
      actionLabel: "OPTİMİZE ET",
      emptyIcon: "📉",
      emptyTitle: "Görselleri Buraya Bırak",
      emptyText: "Her dosya kendi formatında yeniden sıkıştırılır",
      filter: isSupportedInput,
      readDimensions,
      targetLabel: (item) =>
        item ? FORMATS[targetFor(item.file)].label.toUpperCase() : "AYNI FORMAT",
      outputName: (item) => {
        const target = item.result ? item.result.format : targetFor(item.file);
        return `${baseName(item.file.name)}${general.values.suffix || ""}.${FORMATS[target].ext}`;
      },
      process: async (item) => {
        const target = targetFor(item.file);
        const res = await convert(item.file, {
          format: target,
          options: enc[target],
          resize: { mode: "none" },
          background: general.values.background,
        });

        if (general.values.onlyIfSmaller && res.blob.size >= item.file.size) {
          return {
            blob: item.file,
            width: res.width,
            height: res.height,
            format: target,
            skipped: true,
            label: "Orijinal korundu",
          };
        }
        return { ...res, format: target };
      },
      onStats: (st) => renderStats(ctx.stats, st),
      zipName: "optimize.zip",
    });

    state = { batch };
    showEncoder(editing);
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
  if (!s || !s.done) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `
    <div class="stat-item"><span class="stat-label">Hazır</span><span class="stat-value n">${s.done}/${s.total}</span></div>
    <div class="stat-item"><span class="stat-label">Kazanç</span><span class="stat-value">${fb(Math.max(0, s.saved))}</span></div>
    <div class="stat-item"><span class="stat-label">Oran</span><span class="stat-value">−${Math.max(0, s.savedPct).toFixed(0)}%</span></div>`;
}
