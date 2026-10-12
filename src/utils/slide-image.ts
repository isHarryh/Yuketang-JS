export interface SlideImage {
  mediaType: "image/jpeg";
  /** Base64 data without the data URL prefix */
  data: string;
  width: number;
  height: number;
}

// Long-edge limit that keeps vision token usage reasonable on most providers
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.85;

function downloadWithGm(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "blob",
      timeout: 15000,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300 && res.response) {
          resolve(res.response);
        } else {
          reject(new Error(`HTTP ${res.status}`));
        }
      },
      onerror: () => reject(new Error("Network error")),
      ontimeout: () => reject(new Error("Timeout")),
    });
  });
}

async function downloadImage(url: string): Promise<Blob> {
  // GM_xmlhttpRequest bypasses CORS on the slide CDN; plain fetch is the fallback
  if (typeof GM_xmlhttpRequest === "function") {
    try {
      return await downloadWithGm(url);
    } catch {
      // Fall through to fetch
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.blob();
}

/**
 * Downloads a slide image, downscales it and re-encodes it as base64 JPEG.
 */
export async function fetchSlideImage(url: string): Promise<SlideImage> {
  const blob = await downloadImage(url);
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable");
  }
  // White background so transparent PNG slides stay readable as JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    mediaType: "image/jpeg",
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    width,
    height,
  };
}
