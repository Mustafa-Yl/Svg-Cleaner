/**
 * SVG Cleaner — projenin ilk aracı.
 *
 * Bu araç önizlemeyi KORUR (diğerlerinde kaldırıldı): SVG'de temizlemenin
 * görüntüyü bozup bozmadığını gözle görmek işin kendisi.
 *
 * Mobilde önizleme ve kod editörü yan yana sığmadığı için sekmeye dönüşür;
 * masaüstünde yan yana kalır.
 */

import { OptionsPanel, panelShell } from "../core/ui-kit.js";
import { BatchTool } from "./base/batch-tool.js";
import { svgIntrinsicSize } from "../codecs/svg-raster.js";
import { toast } from "../core/toast.js";
import { fb, pctDiff, download, baseName, debounce, esc } from "../core/utils.js";

/* ── Temizleme motoru ─────────────────────────────────── */

const SVG_NS = "http://www.w3.org/2000/svg";
const EDITOR_ATTR =
  /^(sketch:|inkscape:|sodipodi:|xmlns:sketch|xmlns:inkscape|xmlns:sodipodi|xmlns:dc|xmlns:cc|xmlns:rdf|xmlns:ns)/;

function roundNums(s, p) {
  if (isNaN(p) || p < 0) return s;
  return s.replace(/(\d+\.\d+)/g, (m) =>
    parseFloat(parseFloat(m).toFixed(p)).toString(),
  );
}

/**
 * @param {string} raw  Ham SVG metni
 * @param {object} o    Temizleme seçenekleri
 * @returns {string}    Temizlenmiş SVG
 * @throws {Error}      Ayrıştırma başarısızsa
 */
export function cleanSvg(raw, o) {
  let src = raw;
  if (o.cmts) src = src.replace(/<!--[\s\S]*?-->/g, "");

  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("SVG ayrıştırılamadı");

  const svg = doc.querySelector("svg");
  if (!svg) throw new Error("Kök <svg> etiketi bulunamadı");

  if (o.meta) svg.querySelectorAll("metadata, title, desc").forEach((n) => n.remove());
  if (o.defs) svg.querySelectorAll("defs").forEach((n) => n.remove());

  if (o.rect) {
    svg.querySelectorAll("rect").forEach((r) => {
      const x = r.getAttribute("x") || "0";
      const y = r.getAttribute("y") || "0";
      if (x === "0" && y === "0") r.remove();
    });
  }

  if (o.emptyG) {
    let changed = true;
    while (changed) {
      changed = false;
      svg.querySelectorAll("g").forEach((g) => {
        if (!g.children.length) {
          g.remove();
          changed = true;
        }
      });
    }
  }

  [svg, ...svg.querySelectorAll("*")].forEach((el) => {
    [...el.attributes].forEach((a) => {
      const n = a.name;
      if (o.data && n.startsWith("data-")) el.removeAttribute(n);
      else if (o.id && n === "id") el.removeAttribute(n);
      else if (o.cls && n === "class") el.removeAttribute(n);
      else if (o.style && n === "style") el.removeAttribute(n);
      else if (o.editor && EDITOR_ATTR.test(n)) el.removeAttribute(n);
    });
  });

  if (o.cc) {
    svg.querySelectorAll("[fill]").forEach((el) => {
      if (el.getAttribute("fill") !== "none") el.setAttribute("fill", "currentColor");
    });
  }
  if (o.ccs) {
    svg.querySelectorAll("[stroke]").forEach((el) => {
      if (el.getAttribute("stroke") !== "none") el.setAttribute("stroke", "currentColor");
    });
  }

  if (o.vb) {
    const refit = refitViewBox(svg, o);
    if (refit) return finalize(refit, o);
  }

  svg.setAttribute("xmlns", SVG_NS);
  return finalize(new XMLSerializer().serializeToString(svg), o);
}

function finalize(str, o) {
  let res = roundNums(str, o.prec);
  if (o.min) res = res.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  return res;
}

/** İçeriğin gerçek sınırlarını ölçüp viewBox'ı yeniden kurar */
function refitViewBox(svg, o) {
  const shapes = svg.querySelectorAll(
    "path,circle,ellipse,polygon,rect,line,polyline,use,text",
  );
  if (!shapes.length) return null;

  const probe = document.createElementNS(SVG_NS, "svg");
  probe.setAttribute(
    "style",
    "position:fixed;top:-9999px;left:-9999px;width:2000px;height:2000px;visibility:hidden",
  );
  document.body.appendChild(probe);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

  try {
    shapes.forEach((el) => {
      const clone = probe.appendChild(el.cloneNode(true));
      try {
        const b = clone.getBBox();
        if (b.width > 0 || b.height > 0) {
          x0 = Math.min(x0, b.x);
          y0 = Math.min(y0, b.y);
          x1 = Math.max(x1, b.x + b.width);
          y1 = Math.max(y1, b.y + b.height);
        }
      } catch {
        /* ölçülemeyen eleman */
      }
    });
  } finally {
    probe.remove();
  }

  if (!isFinite(x0)) return null;

  const w = parseFloat((x1 - x0).toFixed(o.prec));
  const h = parseFloat((y1 - y0).toFixed(o.prec));

  const out = document.createElementNS(SVG_NS, "svg");
  out.setAttribute("xmlns", SVG_NS);
  out.setAttribute("viewBox", `0 0 ${w} ${h}`);
  shapes.forEach((el) => {
    const f = el.cloneNode(true);
    f.setAttribute("transform", `translate(${-x0},${-y0})`);
    out.appendChild(f);
  });

  return new XMLSerializer().serializeToString(out);
}

function applyDimensions(svgStr, w, h) {
  if (!w && !h) return svgStr;
  return svgStr.replace(/<svg([^>]*)>/, (_m, attrs) => {
    let a = attrs.replace(/\s+width="[^"]*"/g, "").replace(/\s+height="[^"]*"/g, "");
    if (w) a += ` width="${w}"`;
    if (h) a += ` height="${h}"`;
    return `<svg${a}>`;
  });
}

/* ── Ayar şemaları ────────────────────────────────────── */

const CLEAN_SCHEMA = [
  {
    group: "Öğe Kaldırma",
    items: [
      { key: "rect", type: "toggle", label: "Arka Plan Dikdörtgeni", desc: "0,0 konumlu <rect>", def: true },
      { key: "emptyG", type: "toggle", label: "Boş Gruplar", desc: "İçeriksiz <g> etiketleri", def: true },
      { key: "cmts", type: "toggle", label: "XML Yorumlar", desc: "<!-- ... --> satırları", def: true },
      { key: "meta", type: "toggle", label: "Metadata / Title", desc: "<metadata> <title> <desc>", def: true },
      { key: "defs", type: "toggle", label: "Defs", desc: "Gradient kullanıyorsan kapalı bırak", def: false },
    ],
  },
  {
    group: "Attribute Temizleme",
    items: [
      { key: "data", type: "toggle", label: "data-* attribute", def: true },
      { key: "id", type: "toggle", label: "id attribute", def: true },
      { key: "cls", type: "toggle", label: "class attribute", def: true },
      { key: "style", type: "toggle", label: "style attribute", desc: "Inline style", def: true },
      { key: "editor", type: "toggle", label: "Editör Attribute", desc: "sketch: inkscape: sodipodi:", def: true },
    ],
  },
];

const TRANSFORM_SCHEMA = [
  {
    group: "Renk",
    items: [
      { key: "cc", type: "toggle", label: "fill → currentColor", desc: "CSS'ten renklendirilebilir olur", def: false },
      { key: "ccs", type: "toggle", label: "stroke → currentColor", def: false },
    ],
  },
  {
    group: "Çıktı",
    items: [
      { key: "vb", type: "toggle", label: "Viewbox Sıfırla", desc: "İçeriğe göre yeniden hesapla", def: true },
      { key: "min", type: "toggle", label: "Minify", desc: "Boşluk ve satırları kaldır", def: true },
      { key: "prec", type: "slider", label: "Ondalık Basamak", desc: "Koordinat hassasiyeti", min: 0, max: 8, def: 3 },
    ],
  },
];

const PREVIEW_SCHEMA = [
  {
    group: null,
    items: [
      { key: "bg", type: "segment", label: "Arka Plan", def: "checker",
        options: [
          { value: "checker", label: "Dama" },
          { value: "grid", label: "Grid" },
          { value: "black-bg", label: "Siyah" },
          { value: "white-bg", label: "Beyaz" },
        ] },
      { key: "color", type: "color", label: "İkon Rengi", desc: "currentColor render rengi", def: "#9664e7" },
    ],
  },
];

/* ── Araç ─────────────────────────────────────────────── */

const ICON = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/></svg>`;

let state = null;

export default {
  id: "svg-cleaner",
  name: "SVG Cleaner",
  short: "SVG",
  navLabel: "Temizle",
  tagline: "Temizle · optimize et · currentColor'a çevir",
  icon: ICON,
  accent: "purple",
  dropHint: "SVG dosyasını bırak",

  sidebar() {
    return `
      ${panelShell("scClean", "Temizleme")}
      ${panelShell("scTrans", "Dönüşüm")}
      ${panelShell("scFile", "Çıktı", { open: false })}
      ${panelShell("scPrev", "Önizleme", { open: false, dot: false })}
    `;
  },

  workspace() {
    return `
      <div class="tool-bar">
        <div class="seg" data-el="mode">
          <button type="button" class="seg-btn active" data-v="single">Tekli</button>
          <button type="button" class="seg-btn" data-v="bulk">Toplu</button>
        </div>
        <!-- Mobilde tek seferde tek panel. Varsayılan "Kod": iş oradan
             başlıyor (yapıştır), temizlendikten sonra otomatik önizlemeye
             geçiyoruz. -->
        <div class="seg show-sm" data-el="pane">
          <button type="button" class="seg-btn" data-v="preview">Önizleme</button>
          <button type="button" class="seg-btn active" data-v="code">Kod</button>
        </div>
        <button class="btn-sm" data-el="open">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          <span class="hide-xs">Dosya Aç</span>
        </button>
      </div>

      <div class="sc-single" data-el="singleView" data-pane="code">
        <section class="col col-preview">
          <div class="vsplit">
            <div class="pane">
              <div class="pane-bar"><span class="led y"></span>Orijinal<span class="ml" data-el="origChips"></span></div>
              <div class="canvas checker" data-el="cvBefore">
                <div class="empty">SVG kodunu yapıştır<br>veya dosya bırak</div>
              </div>
            </div>
            <div class="pane">
              <div class="pane-bar"><span class="led g"></span>Temizlenmiş<span class="ml" data-el="cleanChips"></span></div>
              <div class="canvas checker" data-el="cvAfter">
                <div class="empty">Temizle butonuna bas</div>
              </div>
            </div>
          </div>
        </section>

        <section class="col col-code">
          <div class="vsplit">
            <div class="pane">
              <div class="pane-bar"><span class="led y"></span>Giriş<span class="ml sm">Ctrl+V · Sürükle-bırak</span></div>
              <textarea class="editor" data-el="in" spellcheck="false"
                placeholder="&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 24 24&quot;&gt;&#10;  ...&#10;&lt;/svg&gt;"></textarea>
            </div>
            <div class="pane">
              <div class="pane-bar"><span class="led g"></span>Çıkış</div>
              <textarea class="editor" data-el="out" readonly spellcheck="false"
                placeholder="Temizlenmiş SVG burada görünecek"></textarea>
            </div>
          </div>
        </section>
      </div>

      <div class="action-bar" data-el="singleBar">
        <div class="action-info" data-el="scInfo">SVG bekleniyor</div>
        <div class="action-btns">
          <button class="btn-sm" data-el="scCopy" disabled>Kopyala</button>
          <button class="btn-sm" data-el="scDl" disabled>İndir</button>
          <button class="btn-go" data-el="scRun" disabled>TEMİZLE</button>
        </div>
      </div>

      <div class="sc-bulk" data-el="bulkView" hidden></div>

      <input type="file" accept=".svg,image/svg+xml" data-el="fileInput" hidden>
    `;
  },

  mount(ctx) {
    const q = (k) =>
      ctx.workspace.querySelector(`[data-el="${k}"]`) ||
      ctx.sidebar.querySelector(`[data-el="${k}"]`);

    const el = {};
    ["mode", "pane", "open", "singleView", "bulkView", "singleBar", "in", "out",
     "cvBefore", "cvAfter", "origChips", "cleanChips",
     // sc* ön eki: bu araca ait aksiyon çubuğu. İçindeki BatchTool da
     // "run" / "info" adlarını kullanıyor, çakışmasınlar.
     "scRun", "scCopy", "scDl", "scInfo",
     "fileInput"].forEach((k) => (el[k] = q(k)));

    const s = ctx.settings;
    const panels = {};

    panels.clean = new OptionsPanel(
      ctx.sidebar.querySelector("#scClean .pb"), CLEAN_SCHEMA, s.clean,
      (v) => ctx.save({ clean: v }));

    panels.trans = new OptionsPanel(
      ctx.sidebar.querySelector("#scTrans .pb"), TRANSFORM_SCHEMA, s.trans,
      (v) => ctx.save({ trans: v }));

    panels.prev = new OptionsPanel(
      ctx.sidebar.querySelector("#scPrev .pb"), PREVIEW_SCHEMA, s.prev,
      (v) => {
        ctx.save({ prev: v });
        applyPreview(v);
      });

    panels.file = buildFilePanel(ctx);

    const opts = () => ({ ...panels.clean.values, ...panels.trans.values });

    /* ── Toplu mod ── */
    const batch = new BatchTool({
      host: el.bulkView,
      accept: ".svg,image/svg+xml",
      actionLabel: "TEMİZLE",
      emptyIcon: "📐",
      emptyTitle: "SVG Dosyalarını Buraya Bırak",
      emptyText: "Birden fazla .svg dosyasını aynı anda temizle",
      filter: (f) => /\.svg$/i.test(f.name) || f.type === "image/svg+xml",
      readDimensions: async (file) => {
        const d = svgIntrinsicSize(await file.text());
        return d ? { width: Math.round(d.width), height: Math.round(d.height) } : null;
      },
      targetLabel: () => "SVG",
      outputName: (item) => {
        const f = panels.file.values;
        return `${f.prefix || ""}${baseName(item.file.name)}${f.suffix || ""}.svg`;
      },
      process: async (item) => {
        const text = await item.file.text();
        let cleaned = cleanSvg(text, opts());
        cleaned = applyDimensions(cleaned, panels.file.values.w, panels.file.values.h);
        return { blob: new Blob([cleaned], { type: "image/svg+xml" }) };
      },
      onStats: (st) => renderStats(ctx.stats, st),
      zipName: "svg-temiz.zip",
    });

    state = { el, panels, batch };

    /* ── Mod / sekme ── */
    el.mode.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      const bulk = b.dataset.v === "bulk";
      el.mode.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      el.singleView.hidden = bulk;
      el.singleBar.hidden = bulk;
      el.bulkView.hidden = !bulk;
      el.pane.hidden = bulk;
      ctx.sidebar.querySelectorAll("[data-bulk-only]").forEach((n) => (n.hidden = !bulk));
      ctx.stats.innerHTML = "";
      if (bulk) batch.refresh();
      else updateBar();
    });

    function showPane(v) {
      el.pane
        .querySelectorAll(".seg-btn")
        .forEach((x) => x.classList.toggle("active", x.dataset.v === v));
      el.singleView.dataset.pane = v;
    }

    el.pane.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (b) showPane(b.dataset.v);
    });

    /* ── Tekli akış ── */
    el.in.addEventListener("input", debounce(renderInput, 140));
    el.scRun.addEventListener("click", runSingle);

    el.scCopy.addEventListener("click", async () => {
      if (!el.out.value) return;
      await navigator.clipboard.writeText(el.out.value);
      toast("Panoya kopyalandı", "ok");
    });

    el.scDl.addEventListener("click", () => {
      if (!el.out.value) return;
      const f = panels.file.values;
      const name = (f.name || "temiz-svg").replace(/\.svg$/i, "") + ".svg";
      download(applyDimensions(el.out.value, f.w, f.h), name, "image/svg+xml");
      toast(`İndirildi: ${name}`, "inf");
    });

    el.open.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", () => {
      const f = el.fileInput.files[0];
      if (f) loadFile(f);
      el.fileInput.value = "";
    });

    applyPreview(panels.prev.values);
    updateBar();

    /* ── İç fonksiyonlar ── */

    function updateBar() {
      const has = !!el.in.value.trim();
      const done = !!el.out.value;
      el.scRun.disabled = !has;
      el.scCopy.disabled = !done;
      el.scDl.disabled = !done;

      if (!has) {
        el.scInfo.textContent = "SVG bekleniyor";
      } else if (!done) {
        el.scInfo.innerHTML = `<b>${fb(new Blob([el.in.value]).size)}</b> · temizlenmeyi bekliyor`;
      } else {
        const ob = new Blob([el.in.value]).size;
        const cb = new Blob([el.out.value]).size;
        const p = pctDiff(ob, cb);
        el.scInfo.innerHTML = `${fb(ob)} → <b>${fb(cb)}</b> <span class="${p <= 0 ? "diff-g" : "diff-r"}">${p <= 0 ? "−" : "+"}${Math.abs(p).toFixed(0)}%</span>`;
      }
    }

    function renderInput() {
      const v = el.in.value.trim();
      if (!v) {
        el.cvBefore.innerHTML = `<div class="empty">SVG kodunu yapıştır<br>veya dosya bırak</div>`;
        el.origChips.innerHTML = "";
        updateBar();
        return;
      }

      el.origChips.innerHTML = `<span class="chip">${fb(new Blob([v]).size)}</span>`;

      const doc = new DOMParser().parseFromString(v, "image/svg+xml");
      if (doc.querySelector("parsererror") || !doc.querySelector("svg")) {
        el.cvBefore.innerHTML = `<div class="empty err">Geçersiz SVG</div>`;
      } else {
        el.cvBefore.innerHTML = `<div class="svg-host">${v}</div>`;
        applyPreview(panels.prev.values);
      }
      updateBar();
    }

    function runSingle() {
      const raw = el.in.value.trim();
      if (!raw) return toast("Önce SVG yapıştır", "err");

      el.scRun.classList.add("busy");
      setTimeout(() => {
        try {
          const res = cleanSvg(raw, opts());
          el.out.value = res;
          el.cvAfter.innerHTML = `<div class="svg-host">${res}</div>`;
          applyPreview(panels.prev.values);

          const ob = new Blob([raw]).size;
          const cb = new Blob([res]).size;
          const p = pctDiff(ob, cb);
          el.cleanChips.innerHTML =
            `<span class="chip">${fb(cb)}</span>` +
            `<span class="${p <= 0 ? "diff-g" : "diff-r"}">${p <= 0 ? "−" : "+"}${Math.abs(p).toFixed(1)}%</span>`;

          renderStats(ctx.stats, {
            total: 1, done: 1, error: 0,
            inBytes: ob, outBytes: cb, saved: ob - cb, savedPct: -p,
          });
          // Mobilde sonucu göstermek için önizleme sekmesine geç
          if (ctx.isMobile()) showPane("preview");
          toast("Başarıyla temizlendi", "ok");
        } catch (err) {
          toast(err.message, "err");
        } finally {
          el.scRun.classList.remove("busy");
          updateBar();
        }
      }, 20);
    }

    function applyPreview(v) {
      ctx.workspace.querySelectorAll(".canvas").forEach((c) => {
        c.classList.remove("checker", "grid", "black-bg", "white-bg");
        c.classList.add(v.bg);
      });
      ctx.workspace
        .querySelectorAll(".svg-host")
        .forEach((h) => (h.style.color = v.color));
    }

    async function loadFile(f) {
      el.in.value = await f.text();
      renderInput();
      panels.file.setValues({ name: baseName(f.name) + "-clean" });
      toast(`Yüklendi: ${f.name}`, "inf");
    }

    state.loadFile = loadFile;
    state.isBulk = () => !el.bulkView.hidden;
  },

  onFiles(files, ctx) {
    if (!state) return;
    if (state.isBulk()) return state.batch.add(files);

    const f = files[0];
    if (!f) return;
    if (!/\.svg$/i.test(f.name) && f.type !== "image/svg+xml") {
      return toast("Tekli modda yalnızca .svg kabul edilir", "err");
    }
    state.loadFile(f);
  },

  unmount() {
    if (state && state.batch) state.batch.destroy();
    state = null;
  },
};

/* ── Çıktı paneli (elle yazılmış: dosya adı + boyut) ──── */

function buildFilePanel(ctx) {
  const host = ctx.sidebar.querySelector("#scFile .pb");
  const v = { name: "", prefix: "", suffix: "", w: null, h: null, ...(ctx.settings.file || {}) };

  host.innerHTML = `
    <div class="og">
      <span class="og-lbl">Dosya Adı</span>
      <div class="fn-row">
        <input type="text" class="ti" data-f="name" placeholder="icon-clean" value="${esc(v.name)}">
        <span class="fn-ext">.svg</span>
      </div>
    </div>
    <div class="og">
      <span class="og-lbl">Boyut (px)</span>
      <div class="dim-row">
        <input type="number" class="dim-input" data-f="w" placeholder="G" min="1" value="${v.w ?? ""}">
        <span class="dim-sep">×</span>
        <input type="number" class="dim-input" data-f="h" placeholder="Y" min="1" value="${v.h ?? ""}">
      </div>
      <div class="preset-row">
        ${[16, 24, 32, 48, 64, 128, 256, 512]
          .map((n) => `<button type="button" class="preset-btn" data-size="${n}">${n}</button>`)
          .join("")}
      </div>
      <div class="og-note">Boş bırakılırsa SVG ölçeklenebilir kalır (width/height eklenmez).</div>
    </div>
    <div class="og" data-bulk-only hidden>
      <span class="og-lbl">Toplu Adlandırma</span>
      <div class="dim-row two">
        <input type="text" class="ti" data-f="prefix" placeholder="Ön ek" value="${esc(v.prefix)}">
        <input type="text" class="ti" data-f="suffix" placeholder="Son ek" value="${esc(v.suffix)}">
      </div>
      <div class="og-note">Örn. ön ek <code>icon-</code> → <code>icon-logo.svg</code></div>
    </div>`;

  const num = (x) => {
    const n = parseInt(x, 10);
    return isFinite(n) && n > 0 ? n : null;
  };

  host.addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    v[f] = f === "w" || f === "h" ? num(e.target.value) : e.target.value;
    ctx.save({ file: v });
  });

  host.addEventListener("click", (e) => {
    const b = e.target.closest(".preset-btn");
    if (!b) return;
    const n = parseInt(b.dataset.size, 10);
    v.w = v.h = n;
    host.querySelector('[data-f="w"]').value = n;
    host.querySelector('[data-f="h"]').value = n;
    ctx.save({ file: v });
  });

  return {
    values: v,
    setValues(patch) {
      Object.assign(v, patch);
      Object.entries(patch).forEach(([k, val]) => {
        const input = host.querySelector(`[data-f="${k}"]`);
        if (input) input.value = val ?? "";
      });
      ctx.save({ file: v });
    },
  };
}

function renderStats(host, s) {
  if (!s || !s.total || !s.done) {
    host.innerHTML = "";
    return;
  }
  const pct = s.savedPct ?? 0;
  host.innerHTML = `
    <div class="stat-item"><span class="stat-label">Orijinal</span><span class="stat-value n">${fb(s.inBytes)}</span></div>
    <div class="stat-item"><span class="stat-label">Temizlenmiş</span><span class="stat-value">${fb(s.outBytes)}</span></div>
    <div class="stat-item"><span class="stat-label">Kazanç</span><span class="stat-value ${pct >= 0 ? "" : "bad"}">${pct >= 0 ? "−" : "+"}${Math.abs(pct).toFixed(0)}%</span></div>`;
}
