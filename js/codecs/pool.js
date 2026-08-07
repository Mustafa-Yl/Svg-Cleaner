/**
 * Basit worker havuzu.
 *
 * Worker'lar ilk iş geldiğinde kurulur (tembel), boşta kalan worker'a iş verilir,
 * hepsi meşgulse iş kuyruğa alınır. Her worker kendi wasm kodeğini bağımsız
 * yükler — bu nedenle havuz boyutunu çekirdek sayısıyla sınırlıyoruz.
 */

export class WorkerPool {
  /**
   * @param {() => Worker} spawn  Worker üreten fabrika.
   *   URL değil fabrika alıyoruz: `new Worker(new URL(...), ...)` ifadesinin
   *   çağıran dosyada tek parça durması gerekiyor, yoksa paketleyiciler
   *   worker'ı derlemez (bkz. engine.js'teki açıklama).
   * @param {number} [size]  Eşzamanlı worker sayısı
   */
  constructor(spawn, size) {
    this.spawn = spawn;
    this.size = Math.max(
      1,
      size || Math.min(4, (navigator.hardwareConcurrency || 4) - 1 || 1),
    );
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.seq = 0;
    this.terminated = false;
  }

  _spawn() {
    const w = this.spawn();

    w.onmessage = (e) => {
      const { id } = e.data;
      const entry = this.pending.get(id);
      if (entry) {
        this.pending.delete(id);
        e.data.ok
          ? entry.resolve(e.data)
          : entry.reject(new Error(e.data.error || "Worker hatası"));
      }
      this._release(w);
    };

    w.onerror = (err) => {
      // Worker tamamen çöktü: bekleyen tüm işleri reddet ve worker'ı değiştir
      const reason = new Error(
        err.message
          ? `Worker hatası: ${err.message}`
          : "Worker başlatılamadı (yerel sunucu üzerinden açtığınızdan emin olun)",
      );
      err.preventDefault && err.preventDefault();

      for (const [id, entry] of this.pending) {
        if (entry.worker === w) {
          this.pending.delete(id);
          entry.reject(reason);
        }
      }

      this.workers = this.workers.filter((x) => x !== w);
      this.idle = this.idle.filter((x) => x !== w);
      w.terminate();
      this._drain();
    };

    this.workers.push(w);
    return w;
  }

  _release(w) {
    if (this.terminated) return;
    this.idle.push(w);
    this._drain();
  }

  _drain() {
    while (this.queue.length) {
      let w = this.idle.pop();

      if (!w) {
        if (this.workers.length < this.size) w = this._spawn();
        else return;
      }

      const job = this.queue.shift();
      const entry = this.pending.get(job.id);
      if (!entry) {
        this.idle.push(w);
        continue;
      }
      entry.worker = w;
      w.postMessage(job.message, job.transfer || []);
    }
  }

  /**
   * @param {object} message      Worker'a gidecek mesaj (type alanı zorunlu)
   * @param {Transferable[]} transfer
   * @returns {Promise<object>}
   */
  run(message, transfer) {
    if (this.terminated) return Promise.reject(new Error("Havuz kapatıldı"));

    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, worker: null });
      this.queue.push({ id, message: { ...message, id }, transfer });
      this._drain();
    });
  }

  /** Tüm worker'larda kodeği önceden yükle (ilk dönüştürmedeki gecikmeyi gizler) */
  warmup(codec) {
    const n = Math.min(this.size, 2);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      if (this.workers.length < this.size) this._spawn();
      jobs.push(this.run({ type: "warmup", codec }).catch(() => {}));
    }
    return Promise.all(jobs);
  }

  terminate() {
    this.terminated = true;
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.idle = [];
    this.queue = [];
    for (const [, entry] of this.pending) {
      entry.reject(new Error("İşlem iptal edildi"));
    }
    this.pending.clear();
  }
}
