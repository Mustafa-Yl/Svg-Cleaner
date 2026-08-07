/**
 * Araç kayıt defteri.
 *
 * Yeni bir modül eklemek için:
 *   1) js/tools/ altında bir dosya oluştur, aşağıdaki şekilde bir nesne export et
 *   2) js/main.js içinde import edip register() çağır
 *
 * Araç sözleşmesi:
 * {
 *   id:        "benzersiz-id",
 *   name:      "Görünen Ad",
 *   short:     "Ray etiketi (3-4 harf)",
 *   icon:      "<svg .../>",
 *   accent:    "purple" | "blue" | "green" | "orange",  (opsiyonel)
 *   badge:     "SVG",                                    (opsiyonel, başlıkta rozet)
 *   accepts:   [".png", "image/*"],   sürükle-bırak filtresi
 *   sidebar(ctx) -> HTMLElement|string   Ayar paneli içeriği
 *   workspace(ctx) -> HTMLElement|string Ana çalışma alanı içeriği
 *   mount(ctx)     Araç aktifleştiğinde çağrılır (DOM hazır)
 *   unmount(ctx)   Başka araca geçilirken çağrılır
 *   onFiles(files) Sürükle-bırak / global dosya girişi (opsiyonel)
 * }
 */

const tools = [];
const byId = new Map();

export function register(tool) {
  if (!tool || !tool.id) throw new Error("Araç bir id içermeli");
  if (byId.has(tool.id)) {
    console.warn(`[registry] "${tool.id}" zaten kayıtlı, atlanıyor.`);
    return;
  }
  const normalized = {
    accent: "purple",
    accepts: [],
    badge: null,
    order: tools.length,
    ...tool,
  };
  tools.push(normalized);
  byId.set(tool.id, normalized);
}

export function get(id) {
  return byId.get(id) || null;
}

export function list() {
  return [...tools].sort((a, b) => a.order - b.order);
}

export function first() {
  return list()[0] || null;
}
