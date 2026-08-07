import { esc } from "./utils.js";

const ICONS = { ok: "✓", err: "✕", inf: "›", warn: "!" };

/**
 * Sağ alt köşede bildirim gösterir.
 * @param {string} msg
 * @param {"ok"|"err"|"inf"|"warn"} type
 * @param {number} ttl ms
 */
export function toast(msg, type = "ok", ttl = 2800) {
  const rack = document.getElementById("rack");
  if (!rack) return;

  const el = document.createElement("div");
  el.className = `t ${type}`;
  el.innerHTML = `<span class="t-ico">${ICONS[type] || ""}</span><span>${esc(msg)}</span>`;
  rack.appendChild(el);

  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, ttl);

  return el;
}

/**
 * Kendini güncelleyebilen kalıcı bildirim (uzun işlemler için).
 * @returns {{update:(m:string)=>void, done:(m?:string,t?:string)=>void}}
 */
export function stickyToast(msg, type = "inf") {
  const rack = document.getElementById("rack");
  if (!rack) return { update() {}, done() {} };

  const el = document.createElement("div");
  el.className = `t ${type}`;
  el.innerHTML = `<span class="t-ico spin">◐</span><span class="t-msg"></span>`;
  el.querySelector(".t-msg").textContent = msg;
  rack.appendChild(el);

  return {
    update(m) {
      const t = el.querySelector(".t-msg");
      if (t) t.textContent = m;
    },
    done(m, t = "ok") {
      el.className = `t ${t}`;
      el.innerHTML = `<span class="t-ico">${ICONS[t] || ""}</span><span></span>`;
      el.lastElementChild.textContent = m || msg;
      setTimeout(() => {
        el.classList.add("out");
        setTimeout(() => el.remove(), 260);
      }, 2200);
    },
  };
}
