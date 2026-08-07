/**
 * Toplu dosya işleme tabanı.
 *
 * Dosya kuyruğu, kart listesi, ilerleme, tekil/toplu indirme ve ZIP mantığı
 * burada bir kez yazılır; dönüştürücü / optimizasyon / rasterize araçlarının
 * hepsi bunu kullanır.
 *
 * ── Düzen ─────────────────────────────────────────────────
 *   [başlık]  KAYNAK → HEDEF özeti · görünüm · dosya ekle
 *   [ilerleme çubuğu]
 *   [dosya listesi]  her kart: küçük resim · ad · PNG→WEBP · boyut farkı
 *   [aksiyon çubuğu] sabit alt bar: özet + ZIP + ana eylem
 *
 * Ana eylem butonları SIDEBAR'DA DEĞİL bu çubukta durur — mobilde de
 * masaüstünde de aynı yerde, her zaman görünür.
 *
 * ── Araçtan beklenenler ───────────────────────────────────
 *   process(item)      -> {blob, width, height}
 *   outputName(item)   -> "logo.webp"
 *   targetLabel()      -> "WEBP"        (kartlardaki hedef rozeti)
 */

import { fb, pctDiff, uid, esc, download, baseName } from "../../core/utils.js";
import { toast } from "../../core/toast.js";
import { downloadZip } from "../../core/zip.js";
import { sourceLabel } from "../../codecs/codec-meta.js";

export class BatchTool {
  constructor(opts) {
    this.opts = {
      emptyIcon: "🗂",
      emptyTitle: "Dosya Ekle",
      emptyText: "Dosyaları buraya sürükle bırak veya butona tıkla",
      accept: "image/*",
      zipName: "cikti.zip",
      actionLabel: "İŞLE",
      ...opts,
    };

    this.items = [];
    this.selected = null;
    this.running = false;
    this.cancelled = false;
    this.host = opts.host;
    this.view = "list";

    this.render();
    this.bind();
    this.refresh();
  }

  /* ── İskelet ────────────────────────────────────────── */

  render() {
    this.host.innerHTML = `
      <div class="area-hdr">
        <div class="conv-summary" data-el="summary">
          <span class="conv-from" data-el="from">—</span>
          <span class="conv-arrow" aria-hidden="true">→</span>
          <span class="conv-to" data-el="to">—</span>
        </div>
        <div class="hdr-right">
          <div class="seg seg-sm hide-sm" data-el="view">
            <button type="button" class="seg-btn active" data-v="list" title="Liste görünümü">☰</button>
            <button type="button" class="seg-btn" data-v="grid" title="Izgara görünümü">▦</button>
          </div>
          <button class="btn-sm" data-el="add">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            <span class="hide-xs">Dosya Ekle</span>
          </button>
          <button class="btn-sm danger icon-only" data-el="clear" title="Listeyi temizle">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        </div>
      </div>

      <div class="bulk-progress" data-el="progWrap" hidden>
        <div class="bulk-progress-bar" data-el="progBar"></div>
      </div>

      <div class="file-list" data-el="list">
        <div class="drop-zone" data-el="dz">
          <div class="drop-zone-icon">${this.opts.emptyIcon}</div>
          <h3>${esc(this.opts.emptyTitle)}</h3>
          <p>${esc(this.opts.emptyText)}</p>
          <button class="bulk-add-btn" data-el="addInner">Dosya Seç</button>
        </div>
      </div>

      <!-- Toplu sonuç: tek dosyanın değil, TÜM partinin toplamı -->
      <div class="batch-summary" data-el="sum" hidden>
        <div class="sum-cell"><span>Dosya</span><b data-el="sumFiles">0</b></div>
        <div class="sum-cell"><span>Önce</span><b data-el="sumIn">—</b></div>
        <div class="sum-cell"><span>Sonra</span><b data-el="sumOut">—</b></div>
        <div class="sum-cell hi" data-el="sumSavedCell"><span>Kazanç</span><b data-el="sumSaved">—</b></div>
        <div class="sum-cell zip" data-el="sumZipCell" hidden><span>ZIP</span><b data-el="sumZip">—</b></div>
        <div class="sum-cell err" data-el="sumErrCell" hidden><span>Hata</span><b data-el="sumErr">0</b></div>
      </div>

      <div class="action-bar">
        <div class="action-info" data-el="info">Dosya bekleniyor</div>
        <div class="action-btns">
          <button class="btn-sm" data-el="zip" disabled>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>
            ZIP
          </button>
          <button class="btn-go" data-el="run" disabled>
            <span data-el="runLabel">${esc(this.opts.actionLabel)}</span>
          </button>
        </div>
      </div>

      <input type="file" multiple accept="${esc(this.opts.accept)}" data-el="input" hidden>
    `;

    this.el = {};
    this.host.querySelectorAll("[data-el]").forEach((n) => (this.el[n.dataset.el] = n));
  }

  bind() {
    const open = () => this.el.input.click();
    this.el.add.addEventListener("click", open);
    this.el.addInner.addEventListener("click", open);

    this.el.input.addEventListener("change", () => {
      this.add(this.el.input.files);
      this.el.input.value = "";
    });

    this.el.clear.addEventListener("click", () => this.clear());
    this.el.zip.addEventListener("click", () => this.downloadZip());
    this.el.run.addEventListener("click", () => {
      if (this.opts.onRun) this.opts.onRun();
      else this.processAll();
    });

    this.el.view.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      this.view = b.dataset.v;
      this.el.view
        .querySelectorAll(".seg-btn")
        .forEach((x) => x.classList.toggle("active", x === b));
      this.el.list.classList.toggle("as-grid", this.view === "grid");
    });

    // Kart eylemleri (olay delegasyonu — binlerce kartta da tek dinleyici)
    this.el.list.addEventListener("click", (e) => {
      const card = e.target.closest(".f-card");
      if (!card) return;
      const item = this.items.find((i) => i.id === card.dataset.id);
      if (!item) return;

      const btn = e.target.closest("[data-act]");
      if (!btn) return this.select(item);

      if (btn.dataset.act === "run") this.processOne(item);
      if (btn.dataset.act === "dl") this.downloadOne(item);
      if (btn.dataset.act === "rm") this.remove(item);
    });

    this.el.list.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.el.dz.classList.add("drag-over");
    });
    this.el.list.addEventListener("dragleave", () =>
      this.el.dz.classList.remove("drag-over"),
    );
    this.el.list.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.el.dz.classList.remove("drag-over");
      this.add(e.dataTransfer.files);
    });
  }

  /* ── Kuyruk ─────────────────────────────────────────── */

  add(fileList) {
    const accept = this.opts.filter || (() => true);
    let added = 0;
    let skipped = 0;

    Array.from(fileList || []).forEach((file) => {
      if (!accept(file)) return skipped++;
      const dupe = this.items.some(
        (i) => i.file.name === file.name && i.file.size === file.size,
      );
      if (dupe) return skipped++;

      const item = {
        id: uid("f"),
        file,
        status: "pending",
        result: null,
        error: null,
        dims: null,
        thumb: URL.createObjectURL(file),
      };
      this.items.push(item);
      this.el.list.appendChild(this.card(item));
      this.loadDims(item);
      added++;
    });

    this.refresh();
    if (added) toast(`${added} dosya eklendi`, "ok");
    if (skipped) toast(`${skipped} dosya atlandı (desteklenmiyor veya zaten listede)`, "warn");
    return added;
  }

  async loadDims(item) {
    if (!this.opts.readDimensions) return;
    try {
      item.dims = await this.opts.readDimensions(item.file);
      const el = this.node(item, "[data-f=dims]");
      if (el && item.dims) {
        el.textContent = `${item.dims.width}×${item.dims.height}`;
        el.hidden = false;
      }
    } catch {
      /* boyut okunamadı — kritik değil */
    }
  }

  select(item) {
    this.selected = item || null;
    this.el.list
      .querySelectorAll(".f-card")
      .forEach((c) => c.classList.toggle("selected", !!item && c.dataset.id === item.id));
    if (this.opts.onSelect) this.opts.onSelect(item);
  }

  remove(item) {
    URL.revokeObjectURL(item.thumb);
    this.items = this.items.filter((i) => i !== item);
    const card = this.el.list.querySelector(`.f-card[data-id="${item.id}"]`);
    if (card) card.remove();
    if (this.selected === item) this.select(null);
    this.refresh();
  }

  clear() {
    if (!this.items.length) return;
    this.items.forEach((i) => URL.revokeObjectURL(i.thumb));
    this.items = [];
    this.selected = null;
    this.el.list.querySelectorAll(".f-card").forEach((c) => c.remove());
    this.refresh();
    toast("Liste temizlendi", "inf");
  }

  /* ── Kart ───────────────────────────────────────────── */

  card(item) {
    const el = document.createElement("div");
    el.className = "f-card status-pending";
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="card-thumb"><img src="${item.thumb}" alt="" loading="lazy"></div>

      <div class="card-info">
        <span class="card-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span>

        <div class="card-conv">
          <span class="fmt-pill src">${esc(sourceLabel(item.file))}</span>
          <span class="conv-arrow-sm">→</span>
          <span class="fmt-pill dst" data-f="target">${esc(this.targetLabel(item))}</span>
        </div>

        <div class="card-meta">
          <span class="card-status cs-pending" data-f="status">Bekliyor</span>
          <span class="chip" data-f="dims" hidden>—</span>
          <span class="card-size">
            <span class="chip">${fb(item.file.size)}</span>
            <span class="arrow" data-f="arrow" hidden>→</span>
            <span class="chip out" data-f="outSize" hidden></span>
          </span>
          <span data-f="delta" hidden></span>
        </div>
      </div>

      <div class="card-actions">
        <button class="card-act-btn" data-act="run" title="Bu dosyayı işle" aria-label="İşle">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>
        </button>
        <button class="card-act-btn ok" data-act="dl" title="İndir" aria-label="İndir" hidden>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
        </button>
        <button class="card-act-btn danger" data-act="rm" title="Listeden çıkar" aria-label="Sil">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`;
    return el;
  }

  targetLabel(item) {
    return this.opts.targetLabel ? this.opts.targetLabel(item) : "?";
  }

  /** Hedef format değiştiğinde tüm kartlardaki hedef rozetini tazele */
  refreshTargets() {
    this.items.forEach((item) => {
      const el = this.node(item, "[data-f=target]");
      if (el) el.textContent = this.targetLabel(item);
    });
    this.refresh();
  }

  node(item, sel) {
    const card = this.el.list.querySelector(`.f-card[data-id="${item.id}"]`);
    return card ? card.querySelector(sel) : null;
  }

  paint(item) {
    const card = this.el.list.querySelector(`.f-card[data-id="${item.id}"]`);
    if (!card) return;

    card.className = "f-card status-" + item.status;

    const LABELS = {
      pending: ["Bekliyor", "cs-pending"],
      working: ["İşleniyor…", "cs-processing"],
      done: ["Tamam", "cs-done"],
      error: ["Hata", "cs-error"],
    };
    const [text, cls] = LABELS[item.status] || LABELS.pending;
    const st = card.querySelector("[data-f=status]");
    st.className = "card-status " + cls;
    st.textContent = item.status === "error" ? `Hata: ${item.error}` : text;
    st.title = item.status === "error" ? item.error || "" : "";

    const dl = card.querySelector('[data-act="dl"]');
    const arrow = card.querySelector("[data-f=arrow]");
    const outSize = card.querySelector("[data-f=outSize]");
    const delta = card.querySelector("[data-f=delta]");

    if (item.status === "done" && item.result) {
      dl.hidden = false;
      arrow.hidden = false;
      outSize.hidden = false;
      delta.hidden = false;

      const outBytes = item.result.totalSize ?? item.result.blob.size;
      outSize.textContent = fb(outBytes);
      if (item.result.width) outSize.title = `${item.result.width}×${item.result.height}`;

      if (item.result.label) {
        // Vektör→raster gibi kıyası anlamsız işlerde yüzde yerine açıklama
        delta.className = "chip";
        delta.textContent = item.result.label;
      } else if (this.opts.showDelta === false) {
        delta.hidden = true;
      } else {
        const p = pctDiff(item.file.size, outBytes);
        delta.className = p <= 0 ? "diff-g" : "diff-r";
        delta.textContent = `${p <= 0 ? "−" : "+"}${Math.abs(p).toFixed(1)}%`;
      }
    } else {
      dl.hidden = true;
      arrow.hidden = true;
      outSize.hidden = true;
      delta.hidden = true;
    }
  }

  /* ── Özet / durum ───────────────────────────────────── */

  refresh() {
    const n = this.items.length;
    const s = this.stats();

    this.el.dz.hidden = n > 0;
    this.el.clear.disabled = n === 0;
    this.el.run.disabled = n === 0 || this.running;
    this.el.zip.disabled = s.done === 0;

    // Başlıktaki KAYNAK → HEDEF özeti
    const srcSet = [...new Set(this.items.map((i) => sourceLabel(i.file)))];
    this.el.from.textContent = srcSet.length
      ? srcSet.slice(0, 3).join(" · ") + (srcSet.length > 3 ? ` +${srcSet.length - 3}` : "")
      : "Kaynak";
    this.el.to.textContent = this.opts.targetLabel ? this.opts.targetLabel(null) : "—";
    this.el.summary.classList.toggle("idle", n === 0);

    // Alt çubuk bilgisi. Telefonda özet şeridi gizli olduğu için parti
    // toplamlarını taşıyan TEK yer burasıdır — ZIP boyutu da buraya eklenir.
    if (!n) {
      this.el.info.textContent = "Dosya bekleniyor";
    } else if (s.done) {
      const sign = s.saved >= 0 ? "−" : "+";
      const zipPart =
        this.zipBlob && this.zipStamp === this.stamp()
          ? ` · ZIP <b>${fb(this.zipBlob.size)}</b>`
          : "";
      this.el.info.innerHTML =
        `<b>${s.done}/${n}</b> hazır · ${fb(s.inBytes)} → <b>${fb(s.outBytes)}</b>` +
        (this.opts.showDelta === false
          ? ""
          : ` <span class="${s.saved >= 0 ? "diff-g" : "diff-r"}">${sign}${Math.abs(s.savedPct).toFixed(0)}%</span>`) +
        zipPart;
    } else {
      this.el.info.innerHTML = `<b>${n}</b> dosya · ${fb(s.queuedBytes)}`;
    }

    this.el.runLabel.textContent = n
      ? `${this.opts.actionLabel} (${n})`
      : this.opts.actionLabel;

    this.paintSummary(s);
    if (this.opts.onStats) this.opts.onStats(s);
  }

  /** Parti toplamları — son işlenen dosyanın değil, hepsinin toplamı */
  paintSummary(s) {
    const show = s.done > 0 || s.error > 0;
    this.el.sum.hidden = !show;
    if (!show) {
      this.zipBlob = null;
      this.el.sumZipCell.hidden = true;
      return;
    }

    this.el.sumFiles.textContent = `${s.done}/${s.total}`;
    this.el.sumIn.textContent = fb(s.inBytes);
    this.el.sumOut.textContent = fb(s.outBytes);

    if (this.opts.showDelta === false) {
      this.el.sumSavedCell.hidden = true;
    } else {
      this.el.sumSavedCell.hidden = false;
      const pos = s.saved >= 0;
      this.el.sumSavedCell.classList.toggle("bad", !pos);
      // <i> kısmı dar ekranda gizlenir, yüzde her zaman görünür
      this.el.sumSaved.innerHTML =
        `${pos ? "−" : "+"}${Math.abs(s.savedPct).toFixed(1)}%` +
        `<i> · ${fb(Math.abs(s.saved))}</i>`;
    }

    this.el.sumErrCell.hidden = s.error === 0;
    this.el.sumErr.textContent = s.error;

    // ZIP hücresi yalnızca bu parti için üretilmiş ZIP varsa görünür
    if (this.zipBlob && this.zipStamp === this.stamp()) {
      this.el.sumZipCell.hidden = false;
      this.el.sumZip.textContent = fb(this.zipBlob.size);
    } else {
      this.el.sumZipCell.hidden = true;
    }
  }

  /** Parti kimliği — dosya seti veya sonuçlar değişince ZIP özeti geçersizleşir */
  stamp() {
    return this.items.map((i) => i.id + ":" + (i.result ? i.result.blob.size : 0)).join("|");
  }

  stats() {
    const done = this.items.filter((i) => i.status === "done");
    const inBytes = done.reduce((s, i) => s + i.file.size, 0);
    const outBytes = done.reduce(
      (s, i) => s + (i.result.totalSize ?? i.result.blob.size),
      0,
    );
    return {
      total: this.items.length,
      done: done.length,
      error: this.items.filter((i) => i.status === "error").length,
      pending: this.items.filter((i) => i.status === "pending").length,
      queuedBytes: this.items.reduce((s, i) => s + i.file.size, 0),
      inBytes,
      outBytes,
      saved: inBytes - outBytes,
      savedPct: inBytes ? ((inBytes - outBytes) / inBytes) * 100 : 0,
    };
  }

  /* ── İşleme ─────────────────────────────────────────── */

  async processOne(item) {
    item.status = "working";
    item.error = null;
    this.paint(item);

    try {
      item.result = await this.opts.process(item);
      item.status = "done";
    } catch (err) {
      item.error = (err && err.message) || String(err);
      item.status = "error";
      item.result = null;
    }

    this.paint(item);
    this.refresh();
    if (item === this.selected && this.opts.onSelect) this.opts.onSelect(item);
    return item;
  }

  async processAll({ onlyPending = false, concurrency = 4 } = {}) {
    if (this.running) return;

    const queue = this.items.filter((i) =>
      onlyPending ? i.status === "pending" : i.status !== "working",
    );
    if (!queue.length) {
      toast("İşlenecek dosya yok", "err");
      return;
    }

    this.running = true;
    this.cancelled = false;
    this.el.run.classList.add("busy");
    this.el.progWrap.hidden = false;
    this.el.progBar.style.width = "0%";
    queue.forEach((i) => {
      i.status = "pending";
      this.paint(i);
    });

    let finished = 0;
    let cursor = 0;
    const total = queue.length;

    const runners = Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (cursor < total && !this.cancelled) {
        await this.processOne(queue[cursor++]);
        finished++;
        this.el.progBar.style.width = `${(finished / total) * 100}%`;
        this.el.info.innerHTML = `<b>${finished}/${total}</b> işleniyor…`;
        if (this.opts.onProgress) this.opts.onProgress(finished, total);
      }
    });

    await Promise.all(runners);

    this.running = false;
    this.el.run.classList.remove("busy");
    setTimeout(() => {
      this.el.progWrap.hidden = true;
      this.el.progBar.style.width = "0%";
    }, 900);

    const s = this.stats();
    this.refresh();

    if (s.error) {
      toast(`${s.done} başarılı, ${s.error} hatalı`, s.done ? "warn" : "err");
    } else if (this.opts.showDelta === false) {
      toast(`${s.done} dosya hazır · ${fb(s.outBytes)}`, "ok");
    } else {
      toast(
        `${s.done} dosya hazır · ${s.saved >= 0 ? "−" : "+"}${Math.abs(s.savedPct).toFixed(1)}% boyut`,
        "ok",
      );
    }
    return s;
  }

  cancel() {
    this.cancelled = true;
  }

  /* ── İndirme ────────────────────────────────────────── */

  async downloadOne(item) {
    if (!item.result) return;
    const entries = this.entriesFor(item);

    if (entries.length === 1) {
      download(entries[0].data, entries[0].name);
      toast(`İndirildi: ${entries[0].name}`, "inf");
      return;
    }
    await downloadZip(entries, baseName(item.file.name) + ".zip");
    toast(`${entries.length} dosya ZIP olarak indirildi`, "ok");
  }

  outName(item) {
    return this.opts.outputName ? this.opts.outputName(item) : baseName(item.file.name);
  }

  /** Bir işin indirme girdileri. Varsayılan 1:1; çoklu çıktı üretenler devralır. */
  entriesFor(item) {
    if (this.opts.entriesFor) return this.opts.entriesFor(item);
    return [{ name: this.outName(item), data: item.result.blob }];
  }

  async downloadZip(zipName) {
    const done = this.items.filter((i) => i.status === "done" && i.result);
    if (!done.length) return toast("Önce dosyaları işle", "err");

    const entries = done.flatMap((i) => this.entriesFor(i));
    const s = this.stats();
    const t = toast("ZIP hazırlanıyor…", "inf", 120000);

    try {
      const blob = await downloadZip(entries, zipName || this.opts.zipName);
      this.zipBlob = blob;
      this.zipStamp = this.stamp();
      this.refresh(); // hem özet şeridini hem alt çubuk bilgisini tazeler
      t.remove();

      // Parti toplamını bildir — tek dosyanın değil
      const pct = s.inBytes ? ((s.inBytes - blob.size) / s.inBytes) * 100 : 0;
      toast(
        this.opts.showDelta === false
          ? `${entries.length} dosya · ZIP ${fb(blob.size)}`
          : `${entries.length} dosya · ${fb(s.inBytes)} → ZIP ${fb(blob.size)} (−${pct.toFixed(1)}%)`,
        "ok",
        4500,
      );
    } catch (err) {
      t.remove();
      toast("ZIP oluşturulamadı: " + err.message, "err", 5000);
    }
  }

  destroy() {
    this.cancel();
    this.items.forEach((i) => URL.revokeObjectURL(i.thumb));
    this.items = [];
    this.host.innerHTML = "";
  }
}
