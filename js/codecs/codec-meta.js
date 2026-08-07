/**
 * Format tanımları ve encoder ayar şemaları.
 *
 * Bu dosya SAF VERİDİR — DOM'a dokunmaz, böylece hem ana thread hem worker
 * içinden import edilebilir.
 *
 * ── Bir formatın anatomisi ────────────────────────────────
 *   label/ext/mime   Teknik kimlik
 *   tagline/desc     Arayüzde kullanıcıya gösterilen açıklama
 *   alpha            Saydamlık destekliyor mu (JPEG desteklemez)
 *   presets          Tek tıkla kalite profilleri (sidebar'da segment olur)
 *   schema           Ayar şeması. primary:true olanlar sidebar'da,
 *                    kalanlar "Gelişmiş Ayarlar" modalında görünür.
 *
 * Yeni format eklemek: buraya bir giriş + convert.worker.js içine encode
 * fonksiyonu. Arayüz (kartlar, ayarlar, uzantı, MIME) otomatik gelir.
 */

/* ── Kodek CDN adresleri ──────────────────────────────────
   Modüller esm.sh üzerinden gelir (bare bağımlılıkları çözer, worker içinde
   import map gerekmez). .wasm ikilileri jsDelivr'daki kanonik paket yolundan
   `locateFile` ile açıkça verilir.
   Çevrimdışı çalışmak için: paketleri indir, bu URL'leri "./vendor/..." yap.
   Başka hiçbir dosyaya dokunmana gerek yok.                               */

export const CODEC_URLS = {
  webp: {
    module: "https://esm.sh/@jsquash/webp@1.5.0/encode",
    wasmBase: "https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/codec/enc/",
  },
  jpeg: {
    module: "https://esm.sh/@jsquash/jpeg@1.6.0/encode",
    wasmBase: "https://cdn.jsdelivr.net/npm/@jsquash/jpeg@1.6.0/codec/enc/",
  },
  avif: {
    module: "https://esm.sh/@jsquash/avif@2.1.1/encode",
    wasmBase: "https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/",
  },
  oxipng: {
    module: "https://esm.sh/@jsquash/oxipng@2.3.0/optimise",
    wasm: "https://cdn.jsdelivr.net/npm/@jsquash/oxipng@2.3.0/codec/pkg/squoosh_oxipng_bg.wasm",
  },
};

/* ── Girdi formatları ──────────────────────────────────── */

export const INPUT_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/svg+xml",
];

export const INPUT_EXT = [
  "png", "jpg", "jpeg", "jfif", "webp", "avif", "gif", "bmp", "ico", "svg",
];

/** Uzantı -> arayüzde gösterilecek kısa etiket */
export const EXT_LABEL = {
  png: "PNG",
  jpg: "JPEG",
  jpeg: "JPEG",
  jfif: "JPEG",
  webp: "WEBP",
  avif: "AVIF",
  gif: "GIF",
  bmp: "BMP",
  ico: "ICO",
  svg: "SVG",
};

export function isSupportedInput(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return INPUT_EXT.includes(ext) || INPUT_MIME.includes(file.type);
}

/** Dosyanın kaynak format etiketi — kartlarda "PNG → WEBP" için */
export function sourceLabel(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return EXT_LABEL[ext] || (file.type.split("/")[1] || "?").toUpperCase();
}

/** Saydamlık içerebilecek kaynak formatlar (JPEG uyarısı için) */
const ALPHA_CAPABLE = new Set(["png", "webp", "avif", "gif", "svg", "ico"]);
export function mayHaveAlpha(file) {
  return ALPHA_CAPABLE.has((file.name.split(".").pop() || "").toLowerCase());
}

const SPEED_NOTE = "Yüksek değer = daha küçük dosya, daha uzun süre.";

/* ── Çıktı formatları ──────────────────────────────────── */

export const FORMATS = {
  webp: {
    id: "webp",
    label: "WebP",
    engine: "libwebp",
    mime: "image/webp",
    ext: "webp",
    alpha: true,
    tagline: "Web için en iyi denge",
    desc: "Aynı kalitede JPEG'den belirgin küçük. Saydamlık destekler.",
    best: "Web sitesi görselleri, ürün fotoğrafları, ikonlar",
    support: "Chrome · Firefox · Safari 14+ · Edge",
    presets: [
      { id: "small", label: "Küçük", hint: "Boyut öncelikli", values: { lossless: false, quality: 62, method: 3 } },
      { id: "balanced", label: "Dengeli", hint: "Çoğu iş için doğru seçim", values: { lossless: false, quality: 82, method: 4 } },
      { id: "high", label: "Yüksek", hint: "Gözle fark edilmez kayıp", values: { lossless: false, quality: 93, method: 5 } },
      { id: "lossless", label: "Kayıpsız", hint: "Logo ve ikonlar için", values: { lossless: true, method: 5 } },
    ],
    schema: [
      {
        group: "Temel",
        items: [
          { key: "lossless", type: "toggle", primary: true, label: "Kayıpsız (Lossless)", desc: "Hiç kalite kaybı yok — dosya büyür", def: false },
          { key: "quality", type: "slider", primary: true, label: "Kalite", desc: "0 = en küçük dosya · 100 = en iyi görüntü", min: 0, max: 100, def: 82, showIf: (v) => !v.lossless },
          { key: "near_lossless", type: "slider", primary: true, label: "Near-Lossless", desc: "100 = kapalı. Düşürmek kayıpsız çıktıyı küçültür", min: 0, max: 100, def: 100, showIf: (v) => !!v.lossless },
          { key: "method", type: "slider", primary: true, label: "Sıkıştırma Eforu", desc: SPEED_NOTE, min: 0, max: 6, def: 4 },
        ],
      },
      {
        group: "Alfa Kanalı (Saydamlık)",
        items: [
          { key: "alpha_quality", type: "slider", label: "Alfa Kalitesi", desc: "Saydamlık kanalının kalitesi", min: 0, max: 100, def: 100 },
          { key: "alpha_compression", type: "toggle", label: "Alfa Sıkıştırma", desc: "Saydamlık kanalını sıkıştır", def: true },
          { key: "exact", type: "toggle", label: "Exact RGB", desc: "Tam saydam piksellerin RGB değerini koru", def: false },
        ],
      },
      {
        group: "İnce Ayar",
        items: [
          { key: "image_hint", type: "select", label: "Görsel Tipi", desc: "Encoder'a içerik ipucu verir", valueType: "number", def: 0,
            options: [
              { value: 0, label: "Varsayılan" },
              { value: 1, label: "Resim / Portre" },
              { value: 2, label: "Fotoğraf" },
              { value: 3, label: "Grafik / Düz Renk" },
            ] },
          { key: "sns_strength", type: "slider", label: "Spatial Noise Shaping", desc: "Gürültü dağıtımı", min: 0, max: 100, def: 50 },
          { key: "filter_strength", type: "slider", label: "Deblocking Filtresi", desc: "Blok artefaktlarını yumuşatır", min: 0, max: 100, def: 60 },
          { key: "filter_sharpness", type: "slider", label: "Filtre Keskinliği", min: 0, max: 7, def: 0 },
          { key: "segments", type: "slider", label: "Segment Sayısı", desc: "Analiz bölütleri", min: 1, max: 4, def: 4 },
          { key: "pass", type: "slider", label: "Geçiş Sayısı", desc: "Entropi analiz geçişi", min: 1, max: 10, def: 1 },
          { key: "preprocessing", type: "select", label: "Ön İşleme", valueType: "number", def: 0,
            options: [
              { value: 0, label: "Yok" },
              { value: 1, label: "Segment Yumuşatma" },
              { value: 2, label: "Sözde Rastgele Dither" },
            ] },
          { key: "use_sharp_yuv", type: "toggle", label: "Sharp YUV", desc: "Daha yavaş, daha doğru renk dönüşümü", def: false },
          { key: "autofilter", type: "toggle", label: "Otomatik Filtre", desc: "Filtre gücünü otomatik ayarla", def: false },
        ],
      },
    ],
  },

  jpeg: {
    id: "jpeg",
    label: "JPEG",
    engine: "MozJPEG",
    mime: "image/jpeg",
    ext: "jpg",
    alpha: false,
    tagline: "Fotoğraf için evrensel",
    desc: "Her cihazda açılır. Saydamlığı desteklemez — saydam alanlar zeminle doldurulur.",
    best: "Fotoğraflar, e-posta ekleri, eski sistemler",
    support: "Her yerde",
    presets: [
      { id: "small", label: "Küçük", hint: "Boyut öncelikli", values: { quality: 62, progressive: true } },
      { id: "balanced", label: "Dengeli", hint: "Web için önerilen", values: { quality: 80, progressive: true } },
      { id: "high", label: "Yüksek", hint: "Baskı öncesi / arşiv", values: { quality: 92, progressive: true, auto_subsample: false, chroma_subsample: 1 } },
    ],
    schema: [
      {
        group: "Temel",
        items: [
          { key: "quality", type: "slider", primary: true, label: "Kalite", desc: "0 = en küçük dosya · 100 = en iyi görüntü", min: 0, max: 100, def: 80 },
          { key: "progressive", type: "toggle", primary: true, label: "Progressive", desc: "Kademeli yüklenir — web için önerilir", def: true },
          { key: "optimize_coding", type: "toggle", primary: true, label: "Huffman Optimizasyonu", desc: "Kalite kaybı olmadan küçültür", def: true },
          { key: "color_space", type: "select", label: "Renk Uzayı", valueType: "number", def: 3,
            options: [
              { value: 3, label: "YCbCr (renkli)" },
              { value: 1, label: "Gri Tonlama" },
            ] },
        ],
      },
      {
        group: "Chroma (Renk Örnekleme)",
        items: [
          { key: "auto_subsample", type: "toggle", label: "Otomatik Subsampling", desc: "Kaliteye göre encoder seçsin", def: true },
          { key: "chroma_subsample", type: "select", label: "Chroma Subsampling", valueType: "number", def: 2, showIf: (v) => !v.auto_subsample,
            options: [
              { value: 1, label: "4:4:4 — kayıpsız renk" },
              { value: 2, label: "4:2:0 — standart" },
              { value: 3, label: "4:1:1" },
              { value: 4, label: "4:1:0" },
            ] },
          { key: "separate_chroma_quality", type: "toggle", label: "Ayrı Chroma Kalitesi", def: false },
          { key: "chroma_quality", type: "slider", label: "Chroma Kalitesi", min: 0, max: 100, def: 75, showIf: (v) => !!v.separate_chroma_quality },
        ],
      },
      {
        group: "İnce Ayar",
        items: [
          { key: "trellis_multipass", type: "toggle", label: "Trellis Multipass", desc: "Daha iyi sıkıştırma, daha yavaş", def: false },
          { key: "trellis_opt_zero", type: "toggle", label: "Trellis: Sıfır Blok", def: false },
          { key: "trellis_opt_table", type: "toggle", label: "Trellis: Tablo Optimizasyonu", def: false },
          { key: "trellis_loops", type: "slider", label: "Trellis Döngüsü", min: 1, max: 50, def: 1, showIf: (v) => !!v.trellis_multipass },
          { key: "quant_table", type: "select", label: "Kuantizasyon Tablosu", valueType: "number", def: 3,
            options: [
              { value: 0, label: "JPEG Annex K" },
              { value: 1, label: "Flat" },
              { value: 2, label: "MSSIM Ayarlı" },
              { value: 3, label: "ImageMagick" },
              { value: 4, label: "PSNR-HVS Ayarlı" },
              { value: 5, label: "Klein/Silverstein" },
              { value: 6, label: "Watson" },
              { value: 7, label: "Ahumada" },
              { value: 8, label: "Peterson" },
            ] },
          { key: "smoothing", type: "slider", label: "Yumuşatma", desc: "Gürültülü kaynaklarda işe yarar", min: 0, max: 100, def: 0 },
          { key: "baseline", type: "toggle", label: "Baseline", desc: "En geniş uyumluluk (progressive'i kapatır)", def: false },
          { key: "arithmetic", type: "toggle", label: "Aritmetik Kodlama", desc: "Daha küçük ama uyumluluğu düşük", def: false },
        ],
      },
    ],
  },

  png: {
    id: "png",
    label: "PNG",
    engine: "OxiPNG",
    mime: "image/png",
    ext: "png",
    alpha: true,
    tagline: "Kayıpsız ve saydam",
    desc: "Hiç kalite kaybı yok. Saydamlık destekler. Fotoğraflarda dosya büyük kalır.",
    best: "Logo, ikon, ekran görüntüsü, keskin kenarlı grafikler",
    support: "Her yerde",
    presets: [
      { id: "fast", label: "Hızlı", hint: "Anında sonuç", values: { level: 0 } },
      { id: "balanced", label: "Dengeli", hint: "Önerilen", values: { level: 2 } },
      { id: "max", label: "Maksimum", hint: "En küçük dosya, yavaş", values: { level: 6 } },
    ],
    schema: [
      {
        group: "Sıkıştırma",
        items: [
          { key: "level", type: "slider", primary: true, label: "Optimizasyon Seviyesi", desc: SPEED_NOTE, min: 0, max: 6, def: 2 },
          { key: "interlace", type: "toggle", label: "Interlace (Adam7)", desc: "Kademeli yükleme — dosyayı büyütür", def: false },
          { key: "optimiseAlpha", type: "toggle", label: "Alfa Optimizasyonu", desc: "Saydam piksellerin RGB'sini sıfırlar", def: false },
        ],
      },
    ],
  },

  avif: {
    id: "avif",
    label: "AVIF",
    engine: "libavif",
    mime: "image/avif",
    ext: "avif",
    alpha: true,
    tagline: "En küçük dosya boyutu",
    desc: "WebP'den de küçük. Saydamlık destekler. Kodlaması yavaştır, eski tarayıcılar açamaz.",
    best: "Modern web siteleri, bant genişliğinin kritik olduğu yerler",
    support: "Chrome 85+ · Firefox 93+ · Safari 16+",
    presets: [
      { id: "small", label: "Küçük", hint: "Boyut öncelikli", values: { lossless: false, quality: 40, speed: 7 } },
      { id: "balanced", label: "Dengeli", hint: "Önerilen", values: { lossless: false, quality: 55, speed: 6 } },
      { id: "high", label: "Yüksek", hint: "Yavaş ama en iyi", values: { lossless: false, quality: 75, speed: 4, subsample: 3 } },
    ],
    schema: [
      {
        group: "Temel",
        items: [
          { key: "lossless", type: "toggle", primary: true, label: "Kayıpsız (Lossless)", desc: "Hiç kalite kaybı yok — dosya büyür", def: false },
          { key: "quality", type: "slider", primary: true, label: "Kalite", desc: "0 = en küçük dosya · 100 = en iyi görüntü", min: 0, max: 100, def: 55, showIf: (v) => !v.lossless },
          { key: "speed", type: "slider", primary: true, label: "Kodlama Hızı", desc: "0 = en yavaş/en küçük · 10 = en hızlı", min: 0, max: 10, def: 6, showIf: (v) => !v.lossless },
          { key: "subsample", type: "select", label: "Chroma Subsampling", valueType: "number", def: 1, showIf: (v) => !v.lossless,
            options: [
              { value: 3, label: "4:4:4 — en iyi renk" },
              { value: 2, label: "4:2:2" },
              { value: 1, label: "4:2:0 — standart" },
              { value: 0, label: "4:0:0 — gri" },
            ] },
        ],
      },
      {
        group: "İnce Ayar",
        items: [
          { key: "qualityAlpha", type: "slider", label: "Alfa Kalitesi", desc: "-1 = renk kalitesiyle aynı", min: -1, max: 100, def: -1 },
          { key: "sharpness", type: "slider", label: "Keskinlik", min: 0, max: 7, def: 0 },
          { key: "denoiseLevel", type: "slider", label: "Gürültü Azaltma", min: 0, max: 50, def: 0 },
          { key: "chromaDeltaQ", type: "toggle", label: "Chroma Delta Q", desc: "Renk kanalına ekstra bit ayır", def: false },
          { key: "enableSharpYUV", type: "toggle", label: "Sharp YUV", def: false },
          { key: "tune", type: "select", label: "Ayar Metriği", valueType: "number", def: 0,
            options: [
              { value: 0, label: "Otomatik" },
              { value: 1, label: "PSNR" },
              { value: 2, label: "SSIM" },
            ] },
          { key: "bitDepth", type: "select", label: "Bit Derinliği", valueType: "number", def: 8,
            options: [
              { value: 8, label: "8 bit" },
              { value: 10, label: "10 bit" },
              { value: 12, label: "12 bit" },
            ] },
        ],
      },
    ],
  },
};

/** Çıktı formatı listesi (format kartları için) */
export const OUTPUT_FORMATS = Object.values(FORMATS);

/** Şemadan varsayılan değerleri çıkar */
export function defaultsFor(formatId) {
  const f = FORMATS[formatId];
  if (!f) return {};
  const out = {};
  f.schema.forEach((g) =>
    g.items.forEach((it) => {
      if (it.key !== undefined && it.def !== undefined) out[it.key] = it.def;
    }),
  );
  return out;
}

/** Verili değerlerin hangi hazır profile karşılık geldiğini bulur (yoksa null) */
export function matchPreset(formatId, values) {
  const f = FORMATS[formatId];
  if (!f || !f.presets) return null;
  const hit = f.presets.find((p) =>
    Object.entries(p.values).every(([k, v]) => values[k] === v),
  );
  return hit ? hit.id : null;
}

/**
 * UI değerlerini encoder'ın beklediği tiplere çevirir.
 * libwebp/mozjpeg C imzaları boolean değil int bekler.
 */
export function toEncoderOptions(formatId, v) {
  const b = (x) => (x ? 1 : 0);

  if (formatId === "webp") {
    return {
      quality: v.quality,
      lossless: b(v.lossless),
      near_lossless: v.lossless ? v.near_lossless : 100,
      method: v.method,
      alpha_quality: v.alpha_quality,
      alpha_compression: b(v.alpha_compression),
      exact: b(v.exact),
      image_hint: v.image_hint,
      sns_strength: v.sns_strength,
      filter_strength: v.filter_strength,
      filter_sharpness: v.filter_sharpness,
      segments: v.segments,
      pass: v.pass,
      preprocessing: v.preprocessing,
      use_sharp_yuv: b(v.use_sharp_yuv),
      autofilter: b(v.autofilter),
    };
  }

  if (formatId === "jpeg") {
    return {
      quality: v.quality,
      baseline: !!v.baseline,
      arithmetic: !!v.arithmetic,
      progressive: !!v.progressive && !v.baseline,
      optimize_coding: !!v.optimize_coding,
      smoothing: v.smoothing,
      color_space: v.color_space,
      quant_table: v.quant_table,
      trellis_multipass: !!v.trellis_multipass,
      trellis_opt_zero: !!v.trellis_opt_zero,
      trellis_opt_table: !!v.trellis_opt_table,
      trellis_loops: v.trellis_loops,
      auto_subsample: !!v.auto_subsample,
      chroma_subsample: v.chroma_subsample,
      separate_chroma_quality: !!v.separate_chroma_quality,
      chroma_quality: v.chroma_quality,
    };
  }

  if (formatId === "png") {
    return {
      level: v.level,
      interlace: !!v.interlace,
      optimiseAlpha: !!v.optimiseAlpha,
    };
  }

  if (formatId === "avif") {
    return {
      quality: v.quality,
      qualityAlpha: v.qualityAlpha,
      denoiseLevel: v.denoiseLevel,
      tileColsLog2: 0,
      tileRowsLog2: 0,
      speed: v.speed,
      subsample: v.subsample,
      chromaDeltaQ: !!v.chromaDeltaQ,
      sharpness: v.sharpness,
      tune: v.tune,
      enableSharpYUV: !!v.enableSharpYUV,
      bitDepth: v.bitDepth,
      lossless: !!v.lossless,
    };
  }

  return { ...v };
}
