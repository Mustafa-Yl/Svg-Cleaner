"use strict";

/* ═══════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════ */
const savedTheme = localStorage.getItem("svgc-theme") || "dark";
applyTheme(savedTheme);
function applyTheme(t) {
  $("html").attr("data-theme", t);
  $(".theme-btn").removeClass("active");
  $(`.theme-btn[data-t="${t}"]`).addClass("active");
  localStorage.setItem("svgc-theme", t);
}
$(".theme-btn").on("click", function () {
  applyTheme($(this).data("t"));
});

/* ═══════════════════════════════════════════════
   MODE TABS
═══════════════════════════════════════════════ */
let currentMode = "single";
$(".mode-tab").on("click", function () {
  const m = $(this).data("mode");
  if (m === currentMode) return;
  currentMode = m;
  $(".mode-tab").removeClass("active");
  $(this).addClass("active");
  if (m === "bulk") {
    $("#singleMid,#singleRight").hide();
    $("#pSingleActions").hide();
    $("#pBulkActions,#pBulkPrefix").show();
    $("#bulkArea").css("display", "flex");
    $("#workspace").addClass("bulk-mode");
    $("#topStats").hide();
    $("#bulkStats").show();
  } else {
    $("#singleMid,#singleRight").show();
    $("#pSingleActions").show();
    $("#pBulkActions,#pBulkPrefix").hide();
    $("#bulkArea").hide();
    $("#workspace").removeClass("bulk-mode");
    $("#topStats").show();
    $("#bulkStats").hide();
  }
});

/* ═══════════════════════════════════════════════
   PANEL TOGGLE
═══════════════════════════════════════════════ */
function tp(id) {
  $(`#${id}`).toggleClass("collapsed");
}

/* ═══════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════ */
function fb(n) {
  return n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB";
}

function toast(msg, type) {
  const icons = { ok: "✓", err: "✕", inf: "›" };
  const el = $(
    `<div class="t ${type || "ok"}">${icons[type] || ""} ${msg}</div>`,
  ).appendTo("#rack");
  setTimeout(() => el.fadeOut(280, () => el.remove()), 2800);
}

function rn(s, p) {
  if (isNaN(p) || p < 0) return s;
  return s.replace(/(\d+\.\d+)/g, (m) =>
    parseFloat(parseFloat(m).toFixed(p)).toString(),
  );
}

/* ═══════════════════════════════════════════════
   PREVIEW BG
═══════════════════════════════════════════════ */
$(".bg-btn").on("click", function () {
  const bg = $(this).data("bg");
  $(".bg-btn").removeClass("active");
  $(this).addClass("active");
  $(".canvas").removeClass("grid checker white-bg black-bg").addClass(bg);
});

/* ═══════════════════════════════════════════════
   DIMENSION / LOCK
═══════════════════════════════════════════════ */
let dimLocked = false;
let lastViewboxRatio = null; // w/h

$("#lockBtn").on("click", function () {
  dimLocked = !dimLocked;
  $(this).toggleClass("locked", dimLocked);
  $("#lockIcon").attr("viewBox", "0 0 24 24");
  if (dimLocked) {
    $(this).html(
      `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg> Oran Kilidi: AÇIK`,
    );
    // read current viewbox ratio from cleaned SVG or input
    const svgStr = $("#outCode").val() || $("#inCode").val();
    if (svgStr) {
      const doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (svg) {
        const vb = svg.getAttribute("viewBox");
        if (vb) {
          const p = vb.trim().split(/[\s,]+/);
          if (p.length >= 4) {
            lastViewboxRatio = parseFloat(p[2]) / parseFloat(p[3]);
          }
        } else {
          const w = parseFloat(svg.getAttribute("width") || 0),
            h = parseFloat(svg.getAttribute("height") || 0);
          if (w && h) lastViewboxRatio = w / h;
        }
      }
    }
  } else {
    $(this).html(
      `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg> Oran Kilidi: KAPALI`,
    );
    lastViewboxRatio = null;
  }
});

$("#dimW").on("input", function () {
  if (!dimLocked || !lastViewboxRatio) return;
  const w = parseFloat($(this).val());
  if (w > 0) $("#dimH").val(Math.round(w / lastViewboxRatio));
});
$("#dimH").on("input", function () {
  if (!dimLocked || !lastViewboxRatio) return;
  const h = parseFloat($(this).val());
  if (h > 0) $("#dimW").val(Math.round(h * lastViewboxRatio));
});

$(".preset-btn").on("click", function () {
  const w = $(this).data("w"),
    h = $(this).data("h");
  $("#dimW").val(w);
  $("#dimH").val(h);
});

/* Apply dimensions to SVG string */
function applyDimensions(svgStr) {
  const w = parseInt($("#dimW").val());
  const h = parseInt($("#dimH").val());
  if (!w && !h) return svgStr;
  return svgStr.replace(/<svg([^>]*)>/, (match, attrs) => {
    let a = attrs
      .replace(/\s+width="[^"]*"/g, "")
      .replace(/\s+height="[^"]*"/g, "");
    if (w) a += ` width="${w}"`;
    if (h) a += ` height="${h}"`;
    return `<svg${a}>`;
  });
}

/* ═══════════════════════════════════════════════
   CORE CLEAN ENGINE
═══════════════════════════════════════════════ */
function doClean(raw) {
  const o = {
    rect: $("#oRect").is(":checked"),
    emptyG: $("#oEmptyG").is(":checked"),
    cmts: $("#oComments").is(":checked"),
    meta: $("#oMeta").is(":checked"),
    data: $("#oData").is(":checked"),
    id: $("#oId").is(":checked"),
    cls: $("#oClass").is(":checked"),
    style: $("#oStyle").is(":checked"),
    editor: $("#oEditor").is(":checked"),
    cc: $("#oCC").is(":checked"),
    ccs: $("#oCCS").is(":checked"),
    vb: $("#oVB").is(":checked"),
    min: $("#oMin").is(":checked"),
    prec: parseInt($("#oPrec").val()) || 3,
  };

  if (o.cmts) raw = raw.replace(/<!--[\s\S]*?-->/g, "");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  if (o.meta)
    ["metadata", "title", "desc", "defs"].forEach((t) =>
      $(svg).find(t).remove(),
    );
  if (o.rect)
    $(svg)
      .find("rect")
      .each(function () {
        if (
          (this.getAttribute("x") || "0") === "0" &&
          (this.getAttribute("y") || "0") === "0"
        )
          this.remove();
      });
  if (o.emptyG) {
    let c = true;
    while (c) {
      c = false;
      $(svg)
        .find("g")
        .each(function () {
          if (!this.children.length) {
            this.remove();
            c = true;
          }
        });
    }
  }
  $(svg)
    .find("*")
    .addBack()
    .each(function () {
      [...this.attributes].forEach((a) => {
        if (o.data && a.name.startsWith("data-")) this.removeAttribute(a.name);
        if (o.id && a.name === "id") this.removeAttribute(a.name);
        if (o.cls && a.name === "class") this.removeAttribute(a.name);
        if (o.style && a.name === "style") this.removeAttribute(a.name);
        if (
          o.editor &&
          /^(sketch:|inkscape:|sodipodi:|xmlns:sketch|xmlns:inkscape|xmlns:sodipodi)/.test(
            a.name,
          )
        )
          this.removeAttribute(a.name);
      });
    });
  if (o.cc)
    $(svg)
      .find("[fill]")
      .each(function () {
        if (this.getAttribute("fill") !== "none")
          this.setAttribute("fill", "currentColor");
      });
  if (o.ccs)
    $(svg)
      .find("[stroke]")
      .each(function () {
        if (this.getAttribute("stroke") !== "none")
          this.setAttribute("stroke", "currentColor");
      });

  if (o.vb) {
    const els = svg.querySelectorAll(
      "path,circle,ellipse,polygon,rect,line,polyline,use",
    );
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tmp.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:2000px;height:2000px;visibility:hidden";
    document.body.appendChild(tmp);
    const cl = [];
    els.forEach((e) => {
      const c = e.cloneNode(true);
      tmp.appendChild(c);
      cl.push(c);
    });
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    cl.forEach((e) => {
      try {
        const b = e.getBBox();
        if (b.width > 0 || b.height > 0) {
          x0 = Math.min(x0, b.x);
          y0 = Math.min(y0, b.y);
          x1 = Math.max(x1, b.x + b.width);
          y1 = Math.max(y1, b.y + b.height);
        }
      } catch (e) {}
    });
    document.body.removeChild(tmp);
    if (isFinite(x0)) {
      const w = parseFloat((x1 - x0).toFixed(o.prec)),
        h = parseFloat((y1 - y0).toFixed(o.prec));
      const out = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      out.setAttribute("viewBox", `0 0 ${w} ${h}`);
      els.forEach((e) => {
        const f = e.cloneNode(true);
        f.setAttribute("transform", `translate(${-x0},${-y0})`);
        out.appendChild(f);
      });
      let res = new XMLSerializer().serializeToString(out);
      res = rn(res, o.prec);
      if (o.min) res = res.replace(/\s+/g, " ").replace(/> </g, "><").trim();
      return res;
    }
  }

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  let res = new XMLSerializer().serializeToString(svg);
  res = rn(res, o.prec);
  if (o.min) res = res.replace(/\s+/g, " ").replace(/> </g, "><").trim();
  return res;
}

/* ═══════════════════════════════════════════════
   SINGLE MODE – LIVE PREVIEW
═══════════════════════════════════════════════ */
let lt = null;
$("#inCode").on("input", function () {
  const v = $(this).val().trim();
  if (!v) {
    resetBefore();
    $("#sOrig").text("—");
    return;
  }
  clearTimeout(lt);
  lt = setTimeout(() => liveRender(v), 140);
});

function resetBefore() {
  $("#cvBefore").html(
    `<div class="empty"><svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"/></svg>SVG yapıştır veya dosya bırak</div>`,
  );
  $("#origChips").html("");
}

function liveRender(v) {
  const bytes = new Blob([v]).size;
  const color = $("#pColor").val();
  $("#origChips").html(`<span class="chip">${fb(bytes)}</span>`);
  $("#sOrig").text(fb(bytes));
  const doc = new DOMParser().parseFromString(v, "image/svg+xml");
  if (!doc.querySelector("parsererror") && doc.querySelector("svg")) {
    $("#cvBefore").html(
      `<div style="color:${color};display:contents">${v}</div>`,
    );
  } else {
    $("#cvBefore").html(
      `<div class="empty" style="color:var(--danger);opacity:1"><svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>Geçersiz SVG</div>`,
    );
  }
}

$("#pColor").on("input", function () {
  $('[style*="display:contents"]').css("color", $(this).val());
});

/* ═══════════════════════════════════════════════
   SINGLE MODE – PROCESS
═══════════════════════════════════════════════ */
$("#btnProcess").on("click", function () {
  const raw = $("#inCode").val().trim();
  if (!raw) {
    toast("Önce SVG yapıştır", "err");
    return;
  }
  const $b = $(this);
  $b.addClass("processing").html("");
  setTimeout(() => {
    const res = doClean(raw);
    $b.removeClass("processing").html(
      `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>TEMİZLE`,
    );
    if (!res) {
      toast("SVG parse hatası!", "err");
      return;
    }
    $("#outCode").val(res);
    const color = $("#pColor").val();
    $("#cvAfter").html(
      `<div style="color:${color};display:contents">${res}</div>`,
    );
    const ob = new Blob([raw]).size,
      cb = new Blob([res]).size;
    const saved = ob - cb,
      pct = ((saved / ob) * 100).toFixed(1);
    $("#cleanChips").html(
      `<span class="chip">${fb(cb)}</span><span class="${saved >= 0 ? "diff-g" : "diff-r"}">${saved >= 0 ? "−" : "+"}${Math.abs(pct)}%</span>`,
    );
    $("#sClean").text(fb(cb));
    $("#sSave").text(saved > 0 ? `−${pct}%` : "0%");
    toast("Başarıyla temizlendi", "ok");
  }, 50);
});

$("#btnCopy").on("click", function () {
  const v = $("#outCode").val();
  if (!v) {
    toast("Temizlenmiş SVG yok", "err");
    return;
  }
  navigator.clipboard.writeText(v).then(() => {
    $(this)
      .addClass("ok-state")
      .html(
        `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Kopyalandı`,
      );
    setTimeout(
      () =>
        $(this)
          .removeClass("ok-state")
          .html(
            `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg> Kopyala`,
          ),
      2000,
    );
    toast("Panoya kopyalandı", "ok");
  });
});

$("#btnDownload").on("click", function () {
  let v = $("#outCode").val();
  if (!v) {
    toast("Temizlenmiş SVG yok", "err");
    return;
  }
  v = applyDimensions(v);
  let name = $("#fileName").val().trim() || "cleaned-svg";
  if (!name.endsWith(".svg")) name += ".svg";
  dl(v, name);
  toast(`İndirildi: ${name}`, "inf");
});

function dl(content, filename) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "image/svg+xml" })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ═══════════════════════════════════════════════
   SINGLE MODE – FILE OPEN
═══════════════════════════════════════════════ */
$("#btnLoadFile").on("click", () => $("#singleFileBtn").click());
$("#singleFileBtn").on("change", function () {
  const f = this.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    $("#inCode").val(ev.target.result).trigger("input");
    $("#fileName").val(f.name.replace(/\.svg$/i, "") + "-clean");
    toast(`Yüklendi: ${f.name}`, "inf");
  };
  r.readAsText(f);
  this.value = "";
});

/* ═══════════════════════════════════════════════
   BULK MODE – FILE MANAGEMENT
═══════════════════════════════════════════════ */
let bulkFiles = []; // [{name, originalText, cleanedText, status}]

function bulkUpdateStats() {
  const total = bulkFiles.length;
  const done = bulkFiles.filter((f) => f.status === "done").length;
  const err = bulkFiles.filter((f) => f.status === "error").length;
  $("#bTotal").text(total);
  $("#bDone").text(done);
  $("#bErr").text(err);
  $("#bulkBadge").text(total + " dosya");
  if (total === 0) $("#bulkDropZone").show();
  else $("#bulkDropZone").hide();
}

function addBulkFiles(fileList) {
  Array.from(fileList).forEach((f) => {
    if (!f.name.endsWith(".svg") && f.type !== "image/svg+xml") return;
    if (bulkFiles.find((b) => b.name === f.name)) return; // skip dupe
    const reader = new FileReader();
    reader.onload = (ev) => {
      const entry = {
        id: Date.now() + Math.random(),
        name: f.name,
        originalText: ev.target.result,
        cleanedText: null,
        status: "pending",
      };
      bulkFiles.push(entry);
      renderCard(entry);
      bulkUpdateStats();
    };
    reader.readAsText(f);
  });
}

function renderCard(entry) {
  const color = $("#pColor").val();
  // parse SVG for mini preview
  const doc = new DOMParser().parseFromString(
    entry.originalText,
    "image/svg+xml",
  );
  const hasSvg = !doc.querySelector("parsererror") && doc.querySelector("svg");
  const thumb = hasSvg
    ? `<div style="color:${color};display:contents">${entry.originalText}</div>`
    : '<span style="color:var(--muted);font-size:18px">?</span>';
  const origSize = fb(new Blob([entry.originalText]).size);

  const card = $(`
    <div class="svg-card status-${entry.status}" id="card-${entry.id}" data-id="${entry.id}">
      <div class="card-thumb">${thumb}</div>
      <div class="card-info">
        <span class="card-name" title="${entry.name}">${entry.name}</span>
        <div class="card-meta">
          <span class="card-status cs-pending" id="cs-${entry.id}">Bekliyor</span>
          <span class="chip">${origSize}</span>
          <span class="chip cleaned-size" id="csize-${entry.id}" style="display:none"></span>
          <span class="diff-g" id="cdiff-${entry.id}" style="display:none"></span>
        </div>
      </div>
      <div class="card-actions">
        <button class="card-act-btn" onclick="processCard('${entry.id}')">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
          Temizle
        </button>
        <button class="card-act-btn" id="cdl-${entry.id}" onclick="downloadCard('${entry.id}')" style="display:none">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
          İndir
        </button>
        <button class="card-act-btn danger" onclick="removeCard('${entry.id}')">
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          Sil
        </button>
      </div>
    </div>
  `);
  $("#bulkList").append(card);
}

window.processCard = function (id) {
  const entry = bulkFiles.find((f) => f.id == id);
  if (!entry) return;
  $(`#card-${id}`).attr("class", "svg-card status-processing");
  $(`#cs-${id}`).attr("class", "card-status cs-processing").text("İşleniyor…");
  setTimeout(() => {
    const res = doClean(entry.originalText);
    if (!res) {
      entry.status = "error";
      $(`#card-${id}`).attr("class", "svg-card status-error");
      $(`#cs-${id}`).attr("class", "card-status cs-error").text("Hata");
    } else {
      entry.cleanedText = applyDimensions(res);
      entry.status = "done";
      $(`#card-${id}`).attr("class", "svg-card status-done");
      $(`#cs-${id}`).attr("class", "card-status cs-done").text("Temizlendi");
      const ob = new Blob([entry.originalText]).size,
        cb = new Blob([entry.cleanedText]).size;
      const saved = ob - cb,
        pct = ((saved / ob) * 100).toFixed(1);
      $(`#csize-${id}`).text(fb(cb)).show();
      $(`#cdiff-${id}`)
        .text(`−${pct}%`)
        .attr("class", saved >= 0 ? "diff-g" : "diff-r")
        .show();
      $(`#cdl-${id}`).show();
    }
    bulkUpdateStats();
  }, 30);
};

window.downloadCard = function (id) {
  const entry = bulkFiles.find((f) => f.id == id);
  if (!entry || !entry.cleanedText) return;
  const prefix = $("#zipPrefix").val().trim();
  const baseName = entry.name.replace(/\.svg$/i, "");
  dl(entry.cleanedText, prefix + baseName + ".svg");
  toast(`İndirildi: ${baseName}.svg`, "inf");
};

window.removeCard = function (id) {
  console.log("Removing card with id:", id);
  bulkFiles = bulkFiles.filter((f) => f.id != id);
  $(`#card-${id}`).remove();
  bulkUpdateStats();
};

/* ── Bulk Process All ── */
$("#btnBulkProcess").on("click", async function () {
  const pending = bulkFiles.filter((f) => f.status !== "done");
  if (pending.length === 0) {
    toast("Temizlenecek dosya yok", "err");
    return;
  }
  $(this).addClass("processing").html("İşleniyor…");
  $("#bulkProgressWrap").show();
  const total = pending.length;
  let done = 0;
  for (const entry of pending) {
    processCard(entry.id);
    await new Promise((r) => setTimeout(r, 40));
    done++;
    $("#bulkBar").css("width", `${(done / total) * 100}%`);
  }
  $(this)
    .removeClass("processing")
    .html(
      `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>TÜMÜNÜ TEMİZLE`,
    );
  toast(`${total} dosya temizlendi`, "ok");
  setTimeout(() => {
    $("#bulkProgressWrap").hide();
    $("#bulkBar").css("width", "0");
  }, 1500);
});

/* ── Bulk ZIP Download ── */
$("#btnBulkZip").on("click", async function () {
  const done = bulkFiles.filter((f) => f.status === "done" && f.cleanedText);
  if (done.length === 0) {
    toast("Önce dosyaları temizle", "err");
    return;
  }
  const zip = new JSZip();
  const prefix = $("#zipPrefix").val().trim();
  done.forEach((entry) => {
    const baseName = entry.name.replace(/\.svg$/i, "");
    zip.file(prefix + baseName + ".svg", entry.cleanedText);
  });
  $(this).addClass("processing").html("ZIP oluşturuluyor…");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  $(this)
    .removeClass("processing")
    .html(
      `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>ZIP İNDİR`,
    );
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "svg-cleaned.zip",
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`${done.length} dosya ZIP olarak indirildi`, "ok");
});

/* ── Bulk file input ── */
$("#bulkFileInput").on("change", function () {
  addBulkFiles(this.files);
  this.value = "";
});
$("#bulkAddBtnInner").on("click", () => $("#bulkFileInput").click());

/* ── Bulk drop zone ── */
const $bulkDZ = $("#bulkDropZone");
$bulkDZ.on("dragover", (e) => {
  e.preventDefault();
  $bulkDZ.addClass("drag-over");
});
$bulkDZ.on("dragleave", () => $bulkDZ.removeClass("drag-over"));
$bulkDZ.on("drop", (e) => {
  e.preventDefault();
  $bulkDZ.removeClass("drag-over");
  addBulkFiles(e.originalEvent.dataTransfer.files);
});

/* ═══════════════════════════════════════════════
   SINGLE DRAG & DROP
═══════════════════════════════════════════════ */
let dc = 0;
document.addEventListener("dragenter", (e) => {
  if (currentMode !== "single") return;
  dc++;
  if (e.dataTransfer.types.includes("Files")) $("#dropOv").addClass("on");
});
document.addEventListener("dragleave", () => {
  if (--dc <= 0) {
    dc = 0;
    $("#dropOv").removeClass("on");
  }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dc = 0;
  $("#dropOv").removeClass("on");
  if (currentMode !== "single") return;
  const f = e.dataTransfer.files[0];
  if (!f) return;
  if (!f.name.endsWith(".svg") && f.type !== "image/svg+xml") {
    toast("Sadece .svg dosyaları", "err");
    return;
  }
  const r = new FileReader();
  r.onload = (ev) => {
    $("#inCode").val(ev.target.result).trigger("input");
    $("#fileName").val(f.name.replace(/\.svg$/i, "") + "-clean");
    toast(`Yüklendi: ${f.name}`, "inf");
  };
  r.readAsText(f);
});

/* ── Bulk area drop (whole area) ── */
const $bulkArea = $("#bulkArea");
$bulkArea.on("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
$bulkArea.on("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  addBulkFiles(e.originalEvent.dataTransfer.files);
});

/* init */
bulkUpdateStats();
