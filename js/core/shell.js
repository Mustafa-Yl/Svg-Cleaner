/**
 * Uygulama kabuğu.
 *
 * Sorumluluğu: araç navigasyonunu çizmek, araçları mount/unmount etmek, tema,
 * global sürükle-bırak yönlendirmesi, panel katlama ve responsive davranış.
 * Araçların iç işleyişini bilmez — sözleşme registry.js'te tanımlı.
 *
 * ── Responsive strateji ───────────────────────────────────
 *   ≥1024px  Sol ikon rayı + sabit ayar sidebar'ı + workspace
 *   <1024px  Alt sekme çubuğu (ray yerine) + sidebar bir çekmeceye taşınır,
 *            başlıktaki "Ayarlar" düğmesiyle açılır.
 * Sidebar DOM'u her iki durumda da AYNI düğümdür; sadece yer değiştirir.
 * Böylece araçlar hangi ortamda olduklarını bilmek zorunda kalmaz.
 */

import * as registry from "./registry.js";
import { bindPanelToggles } from "./ui-kit.js";
import { loadSettings, saveSettings, getPref, setPref } from "./store.js";
import { openDrawer } from "./modal.js";
import { toast } from "./toast.js";
import { esc } from "./utils.js";

const MOBILE_Q = "(max-width: 1023px)";

let active = null; // {tool, ctx}
let els = {};
let drawer = null;
let mq = null;

export function boot() {
  els = {
    app: document.getElementById("app"),
    rail: document.getElementById("rail"),
    nav: document.getElementById("bottomNav"),
    sidebar: document.getElementById("sidebar"),
    sidebarHead: document.getElementById("sidebarHead"),
    sidebarBody: document.getElementById("sidebarBody"),
    sidebarSlot: document.getElementById("sidebarSlot"),
    workspace: document.getElementById("workspace"),
    stats: document.getElementById("toolStats"),
    settingsBtn: document.getElementById("settingsBtn"),
  };

  initTheme();
  renderNav();
  bindPanelToggles(els.sidebar);
  bindSettingsButton();
  bindDropZone();
  bindRouting();
  bindViewport();

  const startId =
    idFromHash() || getPref("lastTool") || (registry.first() && registry.first().id);
  activate(startId);
}

/* ── Tema ─────────────────────────────────────────────── */

function initTheme() {
  applyTheme(getPref("theme", "dark"));
  document
    .querySelectorAll("[data-t]")
    .forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.t)));
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  document
    .querySelectorAll("[data-t]")
    .forEach((b) => b.classList.toggle("active", b.dataset.t === t));
  setPref("theme", t);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "dark" ? "#16161c" : "#ffffff";
}

/* ── Navigasyon (ray + alt sekmeler aynı veriden) ─────── */

function renderNav() {
  const tools = registry.list();

  els.rail.innerHTML = tools
    .map(
      (t) => `
      <button class="rail-btn" data-tool="${esc(t.id)}" title="${esc(t.name)} — ${esc(t.tagline || "")}">
        <span class="rail-ico">${t.icon}</span>
        <span class="rail-lbl">${esc(t.short || t.name)}</span>
      </button>`,
    )
    .join("");

  els.nav.innerHTML = tools
    .map(
      (t) => `
      <button class="nav-btn" data-tool="${esc(t.id)}">
        <span class="nav-ico">${t.icon}</span>
        <span class="nav-lbl">${esc(t.navLabel || t.short || t.name)}</span>
      </button>`,
    )
    .join("");

  const go = (e) => {
    const btn = e.target.closest("[data-tool]");
    if (btn) location.hash = btn.dataset.tool;
  };
  els.rail.addEventListener("click", go);
  els.nav.addEventListener("click", go);
}

/* ── Araç aktivasyonu ─────────────────────────────────── */

export function activate(id) {
  const tool = registry.get(id) || registry.first();
  if (!tool) return;
  if (active && active.tool.id === tool.id) return;

  if (active) {
    try {
      active.tool.unmount && active.tool.unmount(active.ctx);
    } catch (err) {
      console.error("[shell] unmount hatası:", err);
    }
  }

  closeDrawer();

  els.sidebarBody.innerHTML = "";
  els.workspace.innerHTML = "";
  els.stats.innerHTML = "";
  els.workspace.className = "workspace tool-" + tool.id;
  document.documentElement.setAttribute("data-accent", tool.accent || "purple");

  // Aktif aracın kimliği ayar panelinin başında durur — yapılandırdığın
  // şeyin hemen üstünde. Topbar sadece markaya ve istatistiklere ayrıldı.
  els.sidebarHead.innerHTML = `
    <span class="sh-ico">${tool.icon}</span>
    <span class="sh-tx">
      <b>${esc(tool.name)}</b>
      ${tool.tagline ? `<span>${esc(tool.tagline)}</span>` : ""}
    </span>`;

  document.title = `${tool.name} — MYL Toolkit`;

  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool.id));

  const ctx = {
    tool,
    sidebar: els.sidebar,
    workspace: els.workspace,
    stats: els.stats,
    settings: loadSettings(tool.id, tool.defaults || {}),
    save(values) {
      Object.assign(ctx.settings, values || {});
      saveSettings(tool.id, ctx.settings);
    },
    isMobile: () => window.matchMedia(MOBILE_Q).matches,
    openSettings,
    toast,
  };

  setHtml(els.sidebarBody, tool.sidebar ? tool.sidebar(ctx) : "");
  setHtml(els.workspace, tool.workspace ? tool.workspace(ctx) : "");

  active = { tool, ctx };
  setPref("lastTool", tool.id);

  try {
    tool.mount && tool.mount(ctx);
  } catch (err) {
    console.error("[shell] mount hatası:", err);
    toast("Araç yüklenirken hata oluştu: " + err.message, "err", 6000);
  }

  syncViewport();
}

function setHtml(host, content) {
  if (content == null) return;
  if (typeof content === "string") host.innerHTML = content;
  else host.appendChild(content);
}

/* ── Sidebar: masaüstünde yerinde, mobilde çekmecede ──── */

function bindSettingsButton() {
  els.settingsBtn.addEventListener("click", () => {
    if (drawer) closeDrawer();
    else openSettings();
  });
}

/**
 * Ayar panelini açar. Masaüstünde sidebar zaten görünür olduğu için
 * yalnızca dikkat çeker; mobilde çekmeceyi açar.
 */
function openSettings() {
  if (!window.matchMedia(MOBILE_Q).matches) {
    els.app.classList.remove("sidebar-hidden");
    setPref("sidebarHidden", false);
    return;
  }
  if (drawer) return;

  drawer = openDrawer({
    title: active ? active.tool.name + " Ayarları" : "Ayarlar",
    content: els.sidebar, // AYNI düğüm taşınır — durum kaybolmaz
    onClose: () => {
      // Kapanınca sidebar'ı kendi yuvasına geri koy
      els.sidebarSlot.appendChild(els.sidebar);
      drawer = null;
      els.settingsBtn.classList.remove("on");
    },
  });
  els.settingsBtn.classList.add("on");
}

function closeDrawer() {
  if (drawer) drawer.close();
}

/* ── Viewport değişimi ────────────────────────────────── */

function bindViewport() {
  mq = window.matchMedia(MOBILE_Q);
  mq.addEventListener("change", syncViewport);

  // Masaüstünde sidebar'ı gizleme tercihi hatırlanır
  const hidden = getPref("sidebarHidden", false);
  els.app.classList.toggle("sidebar-hidden", hidden);
}

function syncViewport() {
  const mobile = window.matchMedia(MOBILE_Q).matches;
  document.documentElement.classList.toggle("is-mobile", mobile);

  // Mobilden masaüstüne geçilirse açık çekmeceyi kapat
  if (!mobile && drawer) closeDrawer();

  els.settingsBtn.title = mobile ? "Ayarlar" : "Ayar panelini gizle/göster";
}

/* ── Global sürükle-bırak ─────────────────────────────── */

function bindDropZone() {
  const ov = document.getElementById("dropOv");
  const hint = document.getElementById("dropHint");
  let depth = 0;

  const hide = () => {
    depth = 0;
    ov.classList.remove("on");
  };

  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes("Files")) return;
    depth++;
    if (hint && active) hint.textContent = active.tool.dropHint || "Dosyaları bırak";
    ov.classList.add("on");
  });

  document.addEventListener("dragleave", () => {
    if (--depth <= 0) hide();
  });
  document.addEventListener("dragover", (e) => e.preventDefault());

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    hide();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    if (active && active.tool.onFiles) active.tool.onFiles(files, active.ctx);
  });

  window.addEventListener("blur", hide);
}

/* ── Yönlendirme (#araç-id) ───────────────────────────── */

function idFromHash() {
  const id = location.hash.replace(/^#/, "").trim();
  return id && registry.get(id) ? id : null;
}

function bindRouting() {
  window.addEventListener("hashchange", () => {
    const id = idFromHash();
    if (id) activate(id);
  });
}
