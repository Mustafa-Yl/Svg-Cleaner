import { esc } from "../../core/utils.js";

/**
 * Ortam desteklenmiyorsa gösterilen ekran.
 * En sık sebebi projenin file:// ile açılmış olmasıdır.
 */
export function fatalHtml(problems) {
  return `<div class="fatal">
    <div class="fatal-ico">⚠</div>
    <h3>Bu araç burada çalışamıyor</h3>
    <ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <p>Proje klasöründe bir yerel sunucu başlat:</p>
    <div class="fatal-cmds">
      <code>npx http-server</code>
      <code>python -m http.server</code>
      <code>VS Code → Live Server</code>
    </div>
  </div>`;
}
