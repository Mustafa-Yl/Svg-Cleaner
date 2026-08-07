# MYL Toolkit

Tarayıcıda çalışan görsel araç seti. **Hiçbir dosya sunucuya yüklenmez** —
her şey kendi cihazında, WebAssembly ile işlenir.

| Araç | Ne yapar |
|---|---|
| **SVG Cleaner** | SVG temizler, viewBox'ı sıfırlar, `currentColor`'a çevirir, minify eder |
| **Görsel Dönüştürücü** | PNG · JPEG · WebP · AVIF · GIF · BMP · ICO · SVG → WebP · JPEG · PNG · AVIF |
| **Görsel Optimizasyon** | Formatı değiştirmeden yeniden sıkıştırır |
| **SVG → Raster** | Tek SVG'den çoklu boyutlu ikon seti (favicon, PWA, uygulama ikonu) |

Toplu işlem, ZIP indirme, koyu/açık tema, mobil desteği.

---

## Çalıştırma

> **Yerel sunucu gerekiyor.** Proje ES modülleri ve Web Worker kullanır;
> `index.html`'e çift tıklamak (`file://`) çalışmaz.

```bash
npm install
npm run dev          # http://localhost:8080
```

Build adımı olmadan da çalışır — VS Code **Live Server** eklentisi ya da
`npx http-server -c-1` yeterli. Kaynak kodu paketleyiciye bağımlı değildir.

## Yayınlama

```bash
npm run build        # dist/ → paketlenmiş + minify + denetlenmiş
npm run preview      # dist/'i yerelde önizle
```

`dist/` beş dosyadan oluşur (~143 kB, gzip ~37 kB): `index.html`, hash'li
JS/CSS bundle'ları, worker bundle'ı ve favicon. Kaynak dosyalar, `README.md`
ve `DEVELOPMENT.md` derlemeye **girmez**.

Derleme sonunda `scripts/check-dist.mjs` otomatik çalışır; kırık import,
paketlenmemiş worker, geliştirme dosyası sızıntısı veya alt dizinde kırılacak
mutlak yol bulursa yayını durdurur.

### GitHub Pages

`.github/workflows/deploy.yml` main dalına her push'ta derleyip yayınlar.
Tek seferlik kurulum: **Settings → Pages → Source: GitHub Actions**.

`base: "./"` sayesinde site hem kullanıcı sayfasında hem proje alt dizininde
(`kullanici.github.io/repo-adi/`) ek ayar gerektirmeden çalışır.

---

## Encoder motorları

| Format | Motor |
|---|---|
| WebP | **libwebp** (Google) |
| JPEG | **MozJPEG** |
| PNG | **OxiPNG** |
| AVIF | **libavif** (AOM) |

Kodekler yalnızca kullanıldıklarında indirilir — WebP'ye dönüştürmezsen AVIF
wasm'ı hiç yüklenmez. Görsel çözümleme (decode) tarayıcının kendi motoruyla
yapılır, bu yüzden indirilen wasm boyutu düşük kalır.

Encode işleri bir worker havuzunda paralel çalışır; yüzlerce dosyalık toplu
işlemde arayüz donmaz.

### Ayarlar

Sidebar'da hazır kalite profilleri (Küçük / Dengeli / Yüksek / Kayıpsız) ve
temel ayarlar var. **Gelişmiş** butonu encoder'ın tüm parametrelerini açar —
WebP için `lossless`, `near_lossless`, `method`, `sns_strength`, `image_hint`,
`use_sharp_yuv`; JPEG için trellis, chroma subsampling, kuantizasyon tablosu;
AVIF için `speed`, `tune`, bit derinliği; PNG için OxiPNG seviyesi.

---

## Tarayıcı desteği

`OffscreenCanvas` · module worker · `createImageBitmap` · WebAssembly
→ **Chrome/Edge 89+ · Firefox 114+ · Safari 16.4+**

Desteklenmeyen ortamda araç sessizce bozulmaz; neyin eksik olduğunu söyleyen
bir uyarı ekranı gösterir.

---

## Proje yapısı

```
index.html · style.css
js/
  main.js               Giriş noktası — araçlar burada kaydedilir
  core/                 Kayıt defteri · kabuk · ayar paneli üreticisi · modal
  codecs/               Format tanımları · dönüştürme motoru · worker havuzu
  tools/                Araç modülleri (+ ortak BatchTool tabanı)
scripts/check-dist.mjs  Derleme denetleyicisi
vite.config.js          Yayın derlemesi yapılandırması
```

Yeni araç eklemek için `js/tools/` altına bir dosya yazıp `js/main.js`'e
kaydetmek yeterli. Yeni bir çıktı formatı eklemek için `js/codecs/codec-meta.js`
içine bir giriş ve worker'a bir encode fonksiyonu — arayüz kendiliğinden gelir.

Mimari kararların gerekçeleri ve ayrıntılı ekleme rehberi için
**`DEVELOPMENT.md`** dosyasına bak.

---

## Bağımlılıklar

Çalışma zamanında CDN'den: JSZip (toplu indirme), jSquash kodekleri (yalnızca
kullanılınca yüklenir), Google Fonts.

Geliştirme bağımlılığı yalnızca Vite + terser — uygulama koduna hiçbir npm
paketi girmiyor.
