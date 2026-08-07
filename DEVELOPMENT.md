# MYL Toolkit — Geliştirme Kılavuzu

> **Bu dosya yayına çıkmaz.** Yeni bir geliştirme oturumuna başlarken önce bunu
> oku; projenin nasıl düşünüldüğünü, hangi kararların neden alındığını ve nereye
> ne ekleneceğini anlatır. Kodun kendisinden okunamayacak şeyler burada.

---

## 0 · Otuz saniyede özet

Tarayıcıda çalışan, sunucusuz bir görsel araç seti. Dört araç var: SVG Cleaner,
Görsel Dönüştürücü, Görsel Optimizasyon, SVG → Raster. Encode işleri
WebAssembly kodekleriyle (libwebp, MozJPEG, OxiPNG, libavif) bir worker
havuzunda yapılır. Build adımı **yoktur** — tarayıcı ES modüllerini doğrudan
yükler.

```
Kullanıcı → Araç modülü → engine.convert() → WorkerPool → convert.worker.js
                                                              ↓
                                              createImageBitmap (decode, native)
                                                              ↓
                                              OffscreenCanvas (ölçekle/düzleştir)
                                                              ↓
                                              jSquash wasm (encode)
```

---

## 1 · Değiştirilmemesi gereken kararlar

Bunlar bilinçli seçimler. Değiştirmeden önce buradaki gerekçeyi oku.

### 1.1 Decode için wasm kullanılmaz

`createImageBitmap()` tarayıcının kendi decoder'ıdır ve PNG/JPEG/WebP/AVIF/GIF/
BMP/ICO hepsini çözer. jSquash'ın decode paketlerini de yükleseydik indirilen
wasm iki katına çıkardı. **Sadece encode tarafı wasm.**

İstisna: SVG. `createImageBitmap` SVG blob'unu tarayıcılar arasında güvenilir
şekilde kabul etmiyor, bu yüzden SVG ana thread'de `<img>` + `<canvas>` ile
rasterize edilip worker'a `ImageData` olarak gönderiliyor
(`js/codecs/svg-raster.js`).

### 1.2 Kodek URL'leri: modül esm.sh'ten, wasm jsDelivr'dan

`@jsquash/*` paketleri `wasm-feature-detect` diye **bare** bir bağımlılık import
ediyor. Worker'lar import map görmediği için ham jsDelivr yolu çalışmaz.
esm.sh bunu çözer.

Ama jsDelivr'ın `+esm` bundle'ı `.wasm` yolunu **yanlış** hesaplıyor
(`…/webp_enc_simd.js/webp_enc_simd.wasm` → 404). Bu yüzden emscripten
kodeklerine `locateFile` ile jsDelivr'daki kanonik yolu açıkça veriyoruz.
Tek kaynak: `CODEC_URLS` (`js/codecs/codec-meta.js`).

> Çevrimdışı sürüm istersen paketleri indirip bu URL'leri `./vendor/…` yap.
> Başka hiçbir yeri değiştirmen gerekmez.

### 1.3 Yerel sunucu zorunlu

ES modülleri ve module worker'lar `file://` üzerinden çalışmaz. `checkSupport()`
bunu tespit edip kullanıcıya anlaşılır bir ekran gösterir
(`js/tools/shared/fatal.js`). Bu ekranı kaldırma — kullanıcı yoksa neden
çalışmadığını anlayamaz.

### 1.4 Önizleme yalnızca SVG Cleaner'da

Dönüştürücüde de vardı, kaldırıldı. Gerekçe: PNG→WebP'de önce/sonra görseli
birbirinin aynısıdır, ekran yer kaplar ve hiçbir şey söylemez. SVG'de ise
temizlemenin görüntüyü bozup bozmadığını görmek işin ta kendisi. **Yeni bir
dönüştürme aracına önizleme ekleme.**

### 1.5 Ana eylem butonları sidebar'da değil, aksiyon çubuğunda

`BatchTool` her aracın altına sabit bir çubuk basar: solda özet, sağda ZIP +
ana eylem. Mobilde de masaüstünde de aynı yerde, hep görünür. Sidebar sadece
**yapılandırma** içindir. Bu ayrımı bozma.

### 1.6 Sidebar mobilde taşınır, kopyalanmaz

`shell.js` içindeki `openSettings()` **aynı DOM düğümünü** çekmeceye taşır,
kapanınca yuvasına geri koyar. İki ayrı kopya olsaydı panel durumu (açık
seçimler, slider değerleri, olay dinleyicileri) ikiye bölünürdü.

Sidebar iki parçadır: `#sidebarHead` (kabuk yazar — aktif aracın adı) ve
`#sidebarBody` (araç yazar). Araçlar `ctx.sidebar` ile sorgular ama HTML'i
gövdeye basılır.

### 1.7 Aktif araç adı topbar'da değil

Topbar sadece marka + istatistik + kontroller taşır. Araç kimliği üç yerde
zaten var: masaüstünde ayar panelinin başlığında, mobilde çekmece başlığında,
her ikisinde de alt sekme / ray vurgusunda. Topbar'a geri koyma — marka ile
yan yana iki farklı başlık dağınık duruyordu.

### 1.8 Parti toplamları: masaüstünde şerit, mobilde tek satır

`BatchTool` iki yerde toplam gösterir:
- `.batch-summary` şeridi (yalnızca ≥560px) — Dosya · Önce · Sonra · Kazanç · ZIP
- `.action-info` tek satırı (her yerde) — aynı bilgiler sıkıştırılmış hâlde

Telefonda şerit **gizlidir**; ikisini birden göstermek ekranın üçte birini
yiyordu. Bu yüzden ZIP boyutu gibi yeni bir bilgi eklerken **her iki yeri de**
güncelle (`paintSummary()` ve `refresh()` içindeki info bloğu).

ZIP boyutu `zipStamp` ile parti kimliğine bağlıdır: dosya seti veya sonuçlar
değişince eski ZIP rakamı otomatik kaybolur — yanlış rakamı göstermemek için.

---

## 2 · Dosya haritası

```
index.html              Kabuk iskeleti. İçinde mantık yok, sadece yuvalar.
style.css               TEK stil dosyası. Mobil öncelikli, 10 numaralı bölüm.
DEVELOPMENT.md          Bu dosya (yayına çıkmaz)
README.md               Kullanıcıya / GitHub'a bakan doküman

js/
  main.js               ► GİRİŞ NOKTASI. Araçlar burada kaydedilir.

  core/                 Araçtan bağımsız altyapı
    registry.js         Araç kayıt defteri + araç sözleşmesi (JSDoc'a bak)
    shell.js            Navigasyon, mount/unmount, tema, çekmece, sürükle-bırak
    ui-kit.js           Şema → panel üreticisi (OptionsPanel) + step/infoBox
    modal.js            Modal (masaüstü) / bottom-sheet (mobil) / çekmece
    store.js            Araç bazlı ayar kalıcılığı — localStorage "myl:<toolId>"
    toast.js            Bildirimler
    zip.js              JSZip sarmalayıcı (aynı isimli dosyaları çakıştırmaz)
    utils.js            fb() · computeSize() · download() · esc() · baseName()

  codecs/               Görüntü işleme katmanı
    codec-meta.js       ► FORMAT TANIMLARI. Saf veri, DOM'a dokunmaz.
    engine.js           convert() — araçların TEK temas noktası
    pool.js             Worker havuzu (lazy spawn, kuyruk, hata kurtarma)
    convert.worker.js   decode → ölçekle → düzleştir → encode
    svg-raster.js       SVG → ImageData (ana thread)

  tools/
    base/batch-tool.js  Dosya kuyruğu · kartlar · ilerleme · ZIP · aksiyon çubuğu
    shared/fatal.js     "Bu ortamda çalışmaz" ekranı
    svg-cleaner.js      Tek araç ki önizlemesi var
    image-converter.js  Ana dönüştürücü — tasarım referansı olarak buna bak
    image-optimizer.js  Format korunur
    svg-rasterizer.js   Çoklu boyut çıktı (entriesFor kullanır)
```

**Katman kuralı:** `tools/` → `codecs/engine.js` → `pool` → `worker`.
Araç modülleri worker, wasm veya CDN bilmez. Tersine bağımlılık yok.

---

## 3 · Tasarım dili

### 3.1 Anlaşılırlık kuralları

Kullanıcı sayfaya baktığında **"neyi neye çeviriyorum"** sorusunu okumadan
cevaplayabilmeli. Bunu üç yerde tekrarlıyoruz:

1. **Başlık özeti** — `PNG · JPEG → WEBP` (`.conv-summary`)
2. **Her kartta** — `PNG → WEBP` rozeti (`.card-conv`)
3. **Format kartında** — uzantı, ad, ne işe yaradığı, nerede açıldığı

Format kartları jargon değil, **sonuç** anlatır:
- ✅ "Her cihazda açılır. Saydamlığı desteklemez."
- ❌ "MozJPEG encoder, YCbCr renk uzayı, 4:2:0 subsampling"

Jargon `Gelişmiş` modalına gider.

### 3.2 Sidebar = numaralı adımlar

`step(n, başlık, altbaşlık, içerik)` (ui-kit.js). Kullanıcı yukarıdan aşağı
okuyunca işi bitmiş olmalı. Adım sayısı 3'ü geçmesin.

### 3.3 Temel / Gelişmiş ayrımı

Şemadaki bir ayar `primary: true` ise sidebar'da, değilse `Gelişmiş` modalında
görünür. Kural: **sidebar'da 5'ten fazla kontrol olmasın.** Bir ayarı sidebar'a
eklemek istiyorsan önce oradan birini çıkar.

Aynı değer nesnesi iki panelde de kullanılır; modal değiştiğinde
`quickPanel.setValues(v)` ile sidebar tazelenir.

### 3.4 Renkler

**Kontrast hedefi:** `--muted` en az 6:1, `--text2` en az 10:1 (kendi teması
`--bg2` üzerinde). Koyu temada bu bir kez düşürüldüğü için yazılar okunmaz
hâle gelmişti. Palet değiştirirken ölç:

```js
// konsolda çalıştır
const lum=c=>{const[r,g,b]=c.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;
  return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
const rgb=h=>{const d=document.createElement('div');d.style.color=h;document.body.append(d);
  const c=getComputedStyle(d).color;d.remove();return c};
const cs=getComputedStyle(document.documentElement);
const r=(a,b)=>{const[x,y]=[lum(rgb(cs.getPropertyValue(a))),lum(rgb(cs.getPropertyValue(b)))]
  .sort((m,n)=>n-m);return ((x+.05)/(y+.05)).toFixed(2)};
console.table({muted:r('--muted','--bg2'), text2:r('--text2','--bg2'), accent:r('--accent','--bg2')});
```

Durum renklerinin soluk zeminleri `--ok-dim` / `--danger-dim` token'larından
gelir. `rgba(...)` sabiti yazma — palet değişince uyumsuz kalır.

Her aracın kendi vurgu rengi var — `<html data-accent>` shell tarafından
ayarlanır, CSS `--accent` / `--accent-rgb` türetilir.

| Araç | accent |
|---|---|
| SVG Cleaner | purple |
| Dönüştürücü | blue |
| Optimizasyon | green |
| SVG → Raster | orange |

Açık temada aynı renklerin koyu varyantları kullanılır (kontrast için).
Yeni renk eklerken **iki temayı da** tanımla.

### 3.5 Responsive kırılımlar

| Genişlik | Ne olur |
|---|---|
| `< 480px` | Butonlarda sadece ikon, araç başlığı gizli, aksiyon çubuğu iki satır |
| `≥ 480px` | Buton etiketleri, araç başlığı görünür |
| `≥ 768px` | Topbar istatistikleri açılır |
| `≥ 1024px` | **Sol ray + sabit sidebar.** Alt sekme çubuğu gizlenir. Modal ortalanır. SVG Cleaner iki sütun olur. |
| `≥ 1400px` | Sidebar genişler |

`1024px` sınırı `shell.js` içindeki `MOBILE_Q` sabitiyle **eşleşmek zorunda**.
Birini değiştirirsen diğerini de değiştir.

Dokunma hedefleri en az ~40px (`.seg-btn`, `.btn-sm`, `.tog` 44×26).

---

## 4 · Nasıl eklerim?

### 4.1 Yeni araç

**1)** `js/tools/benim-aracim.js`:

```js
import { BatchTool } from "./base/batch-tool.js";
import { step, infoBox } from "../core/ui-kit.js";

export default {
  id: "benim-aracim",          // #hash yönlendirmesinde kullanılır
  name: "Benim Aracım",        // topbar başlığı
  short: "BEN",                // masaüstü rayı (3-4 harf)
  navLabel: "Aracım",          // mobil alt sekme (kısa ama okunur)
  tagline: "Tek cümlelik açıklama",
  icon: `<svg …>`,             // 24×24 stroke, fill="none"
  accent: "blue",              // purple | blue | green | orange
  dropHint: "Dosyaları bırak",

  sidebar(ctx) { return step(1, "Ayar", null, `<div data-el="x"></div>`); },
  workspace(ctx) { return `<div class="single-col" data-el="listHost"></div>`; },

  mount(ctx) { /* ctx.settings · ctx.save() · ctx.stats · ctx.isMobile() */ },
  unmount(ctx) { /* batch.destroy() */ },
  onFiles(files, ctx) { /* sürükle-bırak */ },
};
```

**2)** `js/main.js` içine import et ve `register` listesine ekle. Ray/sekme
sırası liste sırasıdır.

**Uyarı:** modül seviyesinde `let state = null` kullanıyoruz ve `unmount`'ta
sıfırlıyoruz. Aynı aracın iki örneği aynı anda mount edilemez — kabuk buna izin
vermiyor, ama bunu varsayarak kod yazma.

### 4.2 Yeni çıktı formatı

Üç dosya:

1. `js/codecs/codec-meta.js` → `FORMATS`'a giriş
   (label, ext, mime, alpha, tagline, desc, best, support, presets, schema)
2. Aynı dosyada `CODEC_URLS`'e modül + wasm adresi
3. `js/codecs/convert.worker.js` → `ENCODERS`'a encode fonksiyonu
4. Gerekiyorsa `toEncoderOptions()` içine tip dönüşümü
   (C imzaları boolean değil int bekler!)

Format kartları, sidebar ayarları, uzantı, MIME, dosya adı — hepsi otomatik.
**Araç dosyalarında hiçbir değişiklik gerekmez.**

### 4.3 Yeni ayar kontrolü tipi

`ui-kit.js` içinde `renderControl()` (satır içi) veya `renderWideControl()`
(kendi satırı olanlar) fonksiyonuna bir `case` ekle, `bind()` içinde olayını
bağla, `setValues()` içinde DOM güncellemesini yaz. Üç yeri de unutma.

Mevcut tipler: `toggle` `slider` `number` `text` `select` `color` `segment` `note`

### 4.4 Çoklu çıktı üreten araç

`process()` normalde tek `{blob}` döner. Birden fazla dosya üretiyorsan
(SVG → Raster gibi):

```js
process: async (item) => ({
  blob: outputs.at(-1).blob,       // temsilî
  outputs,                          // kendi yapın
  totalSize: toplam,                // istatistik bunu kullanır
  label: "3 boyut",                 // yüzde yerine bu gösterilir
}),
entriesFor: (item) => item.result.outputs.map(o => ({ name, data: o.blob })),
showDelta: false,                   // vektör→raster kıyası anlamsız
```

---

## 5 · Bilinen tuzaklar

| Tuzak | Açıklama |
|---|---|
| `data-el` çakışması | Bir araç hem kendi aksiyon çubuğunu hem BatchTool'u içeriyorsa isimler çakışır. SVG Cleaner'da `sc*` ön eki kullanıldı. Yeni araçlarda da ön ek koy. |
| Toggle input görünmez | `.tog input` opacity:0. Test yazarken `.tog-t`'ye tıkla, input'a değil. |
| `showIf` ve filtre | Bir `showIf` başka gruptaki alana bakıyorsa ve o alan modaldeysa, modal açılırken güncel değerlerle kurulur. Sidebar'daki `primary` alanlar birbirine bakmalı. |
| oxipng çok iş parçacığı | Cross-origin isolation (COOP/COEP) olmadan tek thread'e düşer. Normal. |
| AVIF yavaş | `speed: 0` gerçekten çok yavaş. Varsayılan 6, altına inerken uyar. |
| viewBox sıfırlama büyütebilir | Zaten temiz bir SVG'de her öğeye `transform` eklediği için dosya büyüyebilir. Bu bir hata değil; istatistik dürüstçe kırmızı `+%` gösterir. |
| Toast konumu | Mobilde **üstten**, masaüstünde sağ alttan (`bottom: 132px`) gelir. Alt taraf sekme çubuğu + özet şeridi + aksiyon çubuğuyla dolu; oraya sığdırmaya çalışma. Aksiyon çubuğunun yüksekliğini değiştirirsen `.t-rack`'in masaüstü `bottom` değerini de güncelle. |
| Flex listede kart daralması | `.file-list` bir flex kolonu. İçine koyduğun her kart tipine **`flex-shrink: 0`** ver, yoksa dosya sayısı arttıkça kartlar içeriklerinin altına sıkışıp üst üste biner. |
| `zipName` fonksiyon olabilir | `BatchTool` opsiyonu hem string hem `() => string` kabul eder (hedef formata göre değişen ZIP adı için). `zip.js` içindeki `downloadZip()` ikisini de çözer — orayı sadeleştirirken dikkat. |
| Worker paketlemesi | `new Worker(new URL(...), {type:"module"})` engine.js'te **tek parça** durmalı. Bkz. §7.2 — bozulduğunda yerelde çalışır, yayında çöker. |
| Vite'a özel sözdizimi | `?worker`, `?raw`, `import.meta.env` kullanma. Kaynağın paketleyicisiz (Live Server) çalışabilmesi kasıtlı bir özellik. |

---

## 6 · Test etme

Otomatik test altyapısı yok; Playwright ile elle doğrulanıyor.

```bash
npx http-server -p 8899 -c-1        # sunucu
```

Bir değişiklikten sonra en az şunları kontrol et:

- [ ] Dört araç da hatasız mount oluyor (konsolda hata yok)
- [ ] Beş kırılımda da çalışıyor: 1600 · 1024 · 768 · iPhone · Pixel
- [ ] Yatay taşma yok: `document.documentElement.scrollWidth > innerWidth`
- [ ] **40+ dosya yüklendiğinde kartlar üst üste binmiyor** (regresyon yaşandı)
- [ ] Dört formatın dördü de gerçekten encode ediyor (wasm inip çalışıyor)
- [ ] Ayar çekmecesi açılıp kapanıyor, sidebar yuvasına geri dönüyor
- [ ] Sayfa yenilenince tema + son araç + ayarlar korunuyor
- [ ] ZIP indiriliyor, adı doğru, içindeki dosya sayısı ve adları doğru
- [ ] ZIP sonrası toplam boyut hem şeritte hem alt çubukta görünüyor
- [ ] Bildirimler aksiyon çubuğunu / özet şeridini örtmüyor
- [ ] Koyu ve açık temada kontrast oranları eşikleri geçiyor (§3.4)

Kart üst üste binmesini ölçen kod:

```js
const r=[...document.querySelectorAll('.f-card')].map(c=>c.getBoundingClientRect());
let ov=0; for(let i=1;i<r.length;i++) if(r[i].top < r[i-1].bottom-0.5) ov++;
console.log('üst üste binen:', ov);   // 0 olmalı
```

Referans ölçümler (500×380 saydam PNG, 163 KB):

| Hedef | Sonuç |
|---|---|
| WebP q82 | ~3 KB |
| WebP lossless | ~11 KB |
| JPEG q80 | ~6 KB |
| PNG OxiPNG L2 | ~18 KB |
| AVIF q55 | ~2 KB |

Bunlardan ciddi sapma varsa encoder ayarları yanlış geçiyor demektir.

---

## 7 · Derleme ve yayın

### 7.1 İki çalışma modu

| Mod | Komut | Ne olur |
|---|---|---|
| Geliştirme | `npm run dev` | Vite dev sunucusu, anlık yenileme |
| Geliştirme (alternatif) | VS Code **Live Server** | Kaynak dosyalar doğrudan, build yok |
| Yayın | `npm run build` | `dist/` → paketlenmiş + minify |

**Kaynak kodu paketleyiciye bağımlı değildir.** Vite'a özel sözdizimi
(`?worker`, `?raw`, `import.meta.env`) kullanma — kullanırsan Live Server
yolu kırılır ve bu, hızlı deneme yapmanın en pratik yolu.

### 7.2 Worker'ın paketlenmesi — dikkat

`js/codecs/engine.js` içindeki şu ifade **tek parça durmak zorunda**:

```js
const spawnWorker = () =>
  new Worker(new URL("./convert.worker.js", import.meta.url), { type: "module" });
```

Paketleyiciler worker'ı ancak bu deseni birebir görünce ayrı bir bundle olarak
derler. URL'i değişkene alıp `WorkerPool`'a geçirirsen (önce öyleydi) Vite
worker'ı **ham kaynak olarak kopyalar**; dosya `dist/`'e girer ama içindeki
`import "./codec-meta.js"` satırı 404 verir ve dönüştürme yayında çöker.
Yerelde fark edilmez çünkü orada `codec-meta.js` gerçekten vardır.

Bu yüzden `WorkerPool` URL değil **fabrika fonksiyonu** alıyor.

`npm run build` sonunda `scripts/check-dist.mjs` bunu otomatik yakalar.

### 7.3 Derleme denetleyicisi

`npm run build` → derler, sonra `scripts/check-dist.mjs` çalışır. Kontrol
ettikleri:

1. **Kırık göreli import** — dist içinde olmayan bir dosyaya import
2. **Sızıntı** — `DEVELOPMENT.md`, `README.md`, sourcemap, `js/`, `.github/`
3. **Paketlenmemiş worker** — içinde okunur kaynak kalmışsa
4. **Kayıp kodek adresi** — dört jSquash URL'inden biri yoksa
5. **Mutlak yol** — `/assets/…` (alt dizinde kırılır)

Sorun bulursa çıkış kodu 1 verir → CI yayını durdurur. Elle çalıştırmak için
`npm run check`.

### 7.4 GitHub Pages

`.github/workflows/deploy.yml` main dalına her push'ta derleyip yayınlar.
**Yayına yalnızca `dist/` gider** — `DEVELOPMENT.md` dahil hiçbir kaynak
dosya siteye kopyalanmaz, çünkü Vite sadece `index.html`'den ulaşılabilen
dosyaları derlemeye alır.

Tek seferlik kurulum: GitHub → repo → **Settings → Pages → Source: GitHub
Actions**. Başka ayar yok.

`vite.config.js` içinde `base: "./"` — bu sayede proje hem
`kullanici.github.io/` hem `kullanici.github.io/repo-adi/` altında, alt dizin
adını hiçbir yere yazmadan çalışır. Buna dokunma; mutlak bir base yazarsan
repo adını değiştirdiğinde site kırılır.

### 7.5 Yayın öncesi gözden geçir

- `<title>` ve `<meta name="description">` hedef kitleye uygun mu
- Kodekleri `vendor/` altına alıp `CODEC_URLS`'i yerelleştirmeyi düşün —
  şu an CDN kesintisinde dönüştürme çalışmaz (SVG Cleaner etkilenmez)
- Eski `script.js` hâlâ repoda duruyor ve hiçbir yerden çağrılmıyor; silinebilir
- `drop_console: true` açık, yayında konsol sessiz. Hata ayıklarken
  `vite.config.js`'ten kapat.
