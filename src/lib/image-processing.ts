const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be loaded."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type !== type) {
        reject(new Error("Image could not be encoded."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function optimizeImageFile(file: File) {
  const fits = file.size <= MAX_IMAGE_BYTES;
  const original = { file, filename: file.name, contentType: file.type || "image/jpeg" };

  if (file.type === "image/gif") {
    if (!fits) {
      throw new Error("Animated GIFs must already be 2 MB or smaller.");
    }
    return original;
  }

  const preferWebp = file.type !== "image/svg+xml";
  if (fits && (!preferWebp || file.type === "image/webp")) return original;

  const image = await loadImage(file).catch((error: unknown) => {
    if (!fits) throw error;
    return null;
  });
  if (!image) return original;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    if (fits) return original;
    throw new Error("Image processing is unavailable in this browser.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  async function encode(type: string) {
    let quality = 0.9;
    let blob = await canvasToBlob(canvas, type, quality);
    while (blob.size > MAX_IMAGE_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, type, quality);
    }
    return blob;
  }

  let blob = preferWebp ? await encode("image/webp").catch(() => null) : null;
  if (!blob) {
    if (fits) return original;
    blob = await encode("image/jpeg");
  }
  if (fits && blob.size >= file.size) return original;

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is still too large after compression.");
  }

  const contentType = blob.type;
  const filename = file.name.replace(/\.[^.]+$/, "") || "artwork";
  return {
    file: blob,
    filename: `${filename}.${contentType === "image/webp" ? "webp" : "jpg"}`,
    contentType,
  };
}
