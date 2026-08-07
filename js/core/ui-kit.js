/**
 * Şema tabanlı ayar paneli üreticisi.
 *
 * Yeni bir modül eklerken tek yapman gereken bir şema dizisi tanımlamak:
 *
 *   const schema = [
 *     { group: "Kalite", items: [
 *       { key: "lossless", type: "toggle", primary: true, label: "Lossless", def: false },
 *       { key: "quality",  type: "slider", primary: true, label: "Kalite",
 *         min: 0, max: 100, def: 82, showIf: (v) => !v.lossless },
 *       { key: "sns", type: "slider", label: "SNS", min: 0, max: 100, def: 50 },
 *     ]},
 *   ];
 *
 * `primary: true` olanlar sidebar'da görünür, kalanlar "Gelişmiş Ayarlar"
 * modalına gider — filter parametresiyle ayrıştırılır:
 *
 *   new OptionsPanel(host, schema, values, onChange, { filter: isPrimary });
 *
 * Değerler her iki panelde de aynı nesneden okunur; biri değiştiğinde diğeri
 * setValues() ile tazelenir.
 */

import { esc, uid } from "./utils.js";

export const isPrimary = (item) => item.primary === true || item.type === "note";
export const isAdvanced = (item) => !isPrimary(item);

/* ── Tekil kontrol render'ları ────────────────────────── */

function renderControl(item, value) {
  const id = item._domId;

  switch (item.type) {
    case "toggle":
      return `<label class="tog">
        <input type="checkbox" id="${id}" ${value ? "checked" : ""}>
        <span class="tog-t"></span>
      </label>`;

    case "number":
      return `<input type="number" class="ni" id="${id}" value="${esc(value)}"
        ${item.min != null ? `min="${item.min}"` : ""}
        ${item.max != null ? `max="${item.max}"` : ""}
        ${item.step != null ? `step="${item.step}"` : ""}>`;

    case "color":
      return `<input type="color" class="ci" id="${id}" value="${esc(value)}">`;

    case "select":
      return `<select class="sel" id="${id}">${item.options
        .map(
          (o) =>
            `<option value="${esc(o.value)}" ${
              String(o.value) === String(value) ? "selected" : ""
            }>${esc(o.label)}</option>`,
        )
        .join("")}</select>`;

    case "text":
      return `<input type="text" class="ti" id="${id}" value="${esc(value)}"
        placeholder="${esc(item.placeholder || "")}">`;

    default:
      return "";
  }
}

/** Slider / segment / not kendi satır düzenine sahip — .oi içine sığmazlar */
function renderWideControl(item, value) {
  const id = item._domId;

  if (item.type === "slider") {
    return `<div class="rng-row" data-for="${id}">
      <div class="rng-head">
        <span class="on-lbl">${esc(item.label)}</span>
        <output class="rng-out" id="${id}-out">${esc(value)}${esc(item.unit || "")}</output>
      </div>
      <input type="range" class="rng" id="${id}"
        min="${item.min ?? 0}" max="${item.max ?? 100}" step="${item.step ?? 1}"
        value="${esc(value)}" aria-label="${esc(item.label)}">
      ${item.desc ? `<span class="od">${esc(item.desc)}</span>` : ""}
    </div>`;
  }

  if (item.type === "segment") {
    return `<div class="seg-row" data-for="${id}">
      ${item.label ? `<span class="on-lbl seg-lbl">${esc(item.label)}</span>` : ""}
      <div class="seg" id="${id}">
        ${item.options
          .map(
            (o) =>
              `<button type="button" class="seg-btn ${
                String(o.value) === String(value) ? "active" : ""
              }" data-v="${esc(o.value)}" ${o.title ? `title="${esc(o.title)}"` : ""}>${esc(
                o.label,
              )}</button>`,
          )
          .join("")}
      </div>
      ${item.desc ? `<span class="od">${esc(item.desc)}</span>` : ""}
    </div>`;
  }

  if (item.type === "note") {
    return `<div class="info-box ${item.tone || ""}" data-for="${id}">${
      item.html || esc(item.text || "")
    }</div>`;
  }

  return null;
}

/* ── Panel ────────────────────────────────────────────── */

export class OptionsPanel {
  /**
   * @param {HTMLElement} host
   * @param {Array} schema   [{group, items:[...]}, ...] veya düz [{...item}]
   * @param {object} values  Başlangıç değerleri (eksikler def'ten dolar)
   * @param {(values:object, key:string)=>void} onChange
   * @param {{filter?:(item)=>boolean, flat?:boolean}} [opts]
   */
  constructor(host, schema, values, onChange, opts = {}) {
    this.host = host;
    this.onChange = onChange || (() => {});
    this.opts = opts;

    const all = normalizeSchema(schema);
    // Varsayılanlar TÜM şemadan çıkarılır — filtrelenen alanlar kaybolmasın
    this.allItems = all.flatMap((g) => g.items);

    const keep = opts.filter || (() => true);
    this.groups = all
      .map((g) => ({ group: g.group, items: g.items.filter(keep) }))
      .filter((g) => g.items.length);

    this.items = [];
    this.groups.forEach((g) =>
      g.items.forEach((it) => {
        it._domId = uid("opt");
        this.items.push(it);
      }),
    );

    this.values = { ...this.defaults(), ...(values || {}) };
    this.render();
    this.bind();
    this.applyVisibility();
  }

  defaults() {
    const d = {};
    this.allItems.forEach((it) => {
      if (it.key !== undefined && it.def !== undefined) d[it.key] = it.def;
    });
    return d;
  }

  render() {
    const single = this.groups.length === 1 && !this.groups[0].group;

    this.host.innerHTML = this.groups
      .map((g) => {
        const body = g.items
          .map((it) => {
            const wide = renderWideControl(it, this.values[it.key]);
            if (wide !== null) return wide;
            return `<div class="oi" data-for="${it._domId}">
              <div class="ot">
                <span class="on-lbl">${esc(it.label)}</span>
                ${it.desc ? `<span class="od">${esc(it.desc)}</span>` : ""}
              </div>
              ${renderControl(it, this.values[it.key])}
            </div>`;
          })
          .join("");

        if (single || this.opts.flat) return `<div class="og">${body}</div>`;
        return `<div class="og">${
          g.group ? `<span class="og-lbl">${esc(g.group)}</span>` : ""
        }${body}</div>`;
      })
      .join("");
  }

  bind() {
    this.items.forEach((it) => {
      const el = this.host.querySelector("#" + CSS.escape(it._domId));
      if (!el) return;

      if (it.type === "segment") {
        el.addEventListener("click", (e) => {
          const btn = e.target.closest(".seg-btn");
          if (!btn) return;
          el.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.set(it.key, coerce(it, btn.dataset.v));
        });
        return;
      }

      const evt = it.type === "toggle" || it.type === "select" ? "change" : "input";

      el.addEventListener(evt, () => {
        const v = it.type === "toggle" ? el.checked : coerce(it, el.value);
        if (it.type === "slider") {
          const out = this.host.querySelector("#" + CSS.escape(it._domId) + "-out");
          if (out) out.textContent = v + (it.unit || "");
        }
        this.set(it.key, v);
      });
    });
  }

  set(key, value, silent = false) {
    this.values[key] = value;
    this.applyVisibility();
    if (!silent) this.onChange(this.values, key);
  }

  get(key) {
    return this.values[key];
  }

  /** Dışarıdan toplu değer yükleme (DOM'u da tazeler) */
  setValues(values, silent = true) {
    this.values = { ...this.values, ...values };

    this.items.forEach((it) => {
      const el = this.host.querySelector("#" + CSS.escape(it._domId));
      if (!el) return;
      const v = this.values[it.key];

      if (it.type === "toggle") el.checked = !!v;
      else if (it.type === "segment") {
        el.querySelectorAll(".seg-btn").forEach((b) =>
          b.classList.toggle("active", String(b.dataset.v) === String(v)),
        );
      } else {
        el.value = v;
        if (it.type === "slider") {
          const out = this.host.querySelector("#" + CSS.escape(it._domId) + "-out");
          if (out) out.textContent = v + (it.unit || "");
        }
      }
    });

    this.applyVisibility();
    if (!silent) this.onChange(this.values, null);
  }

  /** showIf koşullarını uygula, tamamen boşalan grupları gizle */
  applyVisibility() {
    this.items.forEach((it) => {
      const row = this.host.querySelector(`[data-for="${it._domId}"]`);
      if (!row) return;
      const visible = typeof it.showIf === "function" ? !!it.showIf(this.values) : true;
      row.classList.toggle("hidden", !visible);
    });

    this.host.querySelectorAll(".og").forEach((og) => {
      const rows = og.querySelectorAll("[data-for]");
      const any = [...rows].some((r) => !r.classList.contains("hidden"));
      og.classList.toggle("hidden", rows.length > 0 && !any);
    });
  }

  destroy() {
    this.host.innerHTML = "";
    this.items = [];
  }
}

function normalizeSchema(schema) {
  if (!Array.isArray(schema)) return [];
  if (schema.length && schema[0] && Array.isArray(schema[0].items)) {
    return schema.map((g) => ({ group: g.group, items: g.items }));
  }
  return [{ group: null, items: schema }];
}

function coerce(item, raw) {
  if (item.type === "number" || item.type === "slider" || item.valueType === "number") {
    const n = parseFloat(raw);
    return isNaN(n) ? (item.def ?? 0) : n;
  }
  if (item.valueType === "boolean") return raw === "true" || raw === true;
  return raw;
}

/* ── HTML parçacıkları ────────────────────────────────── */

/** Numaralı adım bloğu — sidebar'ı "önce şunu, sonra şunu" akışına çevirir */
export function step(n, title, sub, bodyHtml = "") {
  return `<section class="step">
    <div class="step-hd">
      <span class="step-n">${n}</span>
      <div class="step-tx">
        <b>${esc(title)}</b>
        ${sub ? `<span>${esc(sub)}</span>` : ""}
      </div>
    </div>
    <div class="step-bd">${bodyHtml}</div>
  </section>`;
}

/** Açıklama kutusu. tone: info | warn | ok */
export function infoBox(html, tone = "info") {
  return `<div class="info-box ${tone}">${html}</div>`;
}

/** Katlanabilir panel iskeleti (SVG Cleaner gibi ayar-yoğun araçlar için) */
export function panelShell(id, title, { open = true, dot = true } = {}) {
  return `<div class="panel ${open ? "" : "collapsed"}" id="${id}">
    <div class="ph" data-toggle-panel="${id}">
      <span class="pt"><span class="dot ${dot ? "on" : ""}"></span>${esc(title)}</span>
      <span class="chev">▾</span>
    </div>
    <div class="pb"></div>
  </div>`;
}

/** Panel başlıklarına tıklanınca katla — kabuk tarafından bir kez bağlanır */
export function bindPanelToggles(root) {
  root.addEventListener("click", (e) => {
    const h = e.target.closest("[data-toggle-panel]");
    if (!h) return;
    const p = root.querySelector("#" + h.dataset.togglePanel);
    if (p) p.classList.toggle("collapsed");
  });
}
