/**
 * Modal / bottom-sheet.
 *
 * Aynı bileşen masaüstünde ortalanmış modal, mobilde aşağıdan açılan sheet
 * olarak görünür — fark tamamen CSS'te. Böylece "gelişmiş ayarlar" gibi
 * ikincil içerikler her iki ortamda da yer kaplamadan durur.
 *
 *   const m = openModal({ title: "Gelişmiş Ayarlar", body: el });
 *   m.close();
 */

let openCount = 0;

export function openModal({ title, subtitle, body, footer, size = "md", onClose } = {}) {
  const root = document.createElement("div");
  root.className = `modal-root size-${size}`;
  root.innerHTML = `
    <div class="modal-scrim" data-close></div>
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="${title || ""}">
      <div class="modal-grip"></div>
      <header class="modal-hd">
        <div class="modal-ttl">
          <h2>${title || ""}</h2>
          ${subtitle ? `<span>${subtitle}</span>` : ""}
        </div>
        <button class="modal-x" data-close aria-label="Kapat">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </header>
      <div class="modal-bd"></div>
      ${footer ? `<footer class="modal-ft"></footer>` : ""}
    </div>`;

  const bodyHost = root.querySelector(".modal-bd");
  if (typeof body === "string") bodyHost.innerHTML = body;
  else if (body) bodyHost.appendChild(body);

  if (footer) {
    const f = root.querySelector(".modal-ft");
    if (typeof footer === "string") f.innerHTML = footer;
    else f.appendChild(footer);
  }

  document.body.appendChild(root);
  openCount++;
  document.body.classList.add("modal-open");

  // Girişi bir kare geciktir ki CSS geçişi tetiklensin
  requestAnimationFrame(() => root.classList.add("on"));

  const close = () => {
    if (!root.isConnected) return;
    root.classList.remove("on");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      root.remove();
      if (--openCount <= 0) {
        openCount = 0;
        document.body.classList.remove("modal-open");
      }
      onClose && onClose();
    }, 220);
  };

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);

  root.querySelector(".modal-box").focus?.();

  return { root, body: bodyHost, close };
}

/**
 * Sol kenardan açılan çekmece — mobilde araç ayarları paneli için.
 * Masaüstünde kullanılmaz (sidebar zaten görünür).
 */
export function openDrawer({ title, content, onClose } = {}) {
  const root = document.createElement("div");
  root.className = "drawer-root";
  root.innerHTML = `
    <div class="modal-scrim" data-close></div>
    <aside class="drawer-box" role="dialog" aria-modal="true">
      <header class="modal-hd">
        <div class="modal-ttl"><h2>${title || "Ayarlar"}</h2></div>
        <button class="modal-x" data-close aria-label="Kapat">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </header>
      <div class="drawer-bd"></div>
    </aside>`;

  const host = root.querySelector(".drawer-bd");
  if (content) host.appendChild(content);

  document.body.appendChild(root);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => root.classList.add("on"));

  const close = () => {
    if (!root.isConnected) return;
    root.classList.remove("on");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      root.remove();
      document.body.classList.remove("modal-open");
      onClose && onClose();
    }, 240);
  };

  const onKey = (e) => e.key === "Escape" && close();
  root.addEventListener("click", (e) => e.target.closest("[data-close]") && close());
  document.addEventListener("keydown", onKey);

  return { root, host, close };
}
