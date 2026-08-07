/**
 * SVG -> ImageData (ana thread).
 *
 * Worker içinde SVG çizimi tarayıcılar arasında güvenilir değil
 * (createImageBitmap SVG blob'unu her yerde kabul etmez), bu yüzden
 * rasterizasyon ana thread'de yapılır; sonuç ImageData olarak worker'a
 * gönderilip orada encode edilir.
 */

const NS = "http://www.w3.org/2000/svg";

/** SVG'nin doğal boyutunu bulur: width/height -> viewBox -> varsayılan */
export function svgIntrinsicSize(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  if (!svg || svg.nodeName === "parsererror" || doc.querySelector("parsererror")) {
    return null;
  }

  const num = (v) => {
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : 0;
  };

  let w = num(svg.getAttribute("width"));
  let h = num(svg.getAttribute("height"));

  if (!w || !h) {
    const vb = svg.getAttribute("viewBox");
    if (vb) {
      const p = vb.trim().split(/[\s,]+/).map(parseFloat);
      if (p.length >= 4 && p[2] > 0 && p[3] > 0) {
        const ratio = p[2] / p[3];
        if (w && !h) h = w / ratio;
        else if (h && !w) w = h * ratio;
        else {
          w = p[2];
          h = p[3];
        }
      }
    }
  }

  return { width: w || 512, height: h || 512, hasIntrinsic: !!(w && h) };
}

/**
 * SVG metnini verilen piksel boyutunda ImageData'ya çevirir.
 * @param {string} svgText
 * @param {number} width
 * @param {number} height
 * @param {string|null} background CSS rengi — null ise saydam
 * @returns {Promise<ImageData>}
 */
export async function rasterizeSvg(svgText, width, height, background = null) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const prepared = withExplicitSize(svgText, w, h);
  const url = URL.createObjectURL(
    new Blob([prepared], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * <svg>'ye net width/height verir ve viewBox yoksa ekler.
 * Bu olmadan Firefox boyutsuz SVG'leri 0x0 çizer.
 */
function withExplicitSize(svgText, w, h) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("Geçersiz SVG");

  const svg = doc.documentElement;
  if (!svg.getAttribute("viewBox")) {
    const size = svgIntrinsicSize(svgText);
    if (size) svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  }

  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", NS);

  return new XMLSerializer().serializeToString(svg);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("SVG görsel olarak yüklenemedi (harici kaynak içeriyor olabilir)"));
    img.src = url;
  });
}
