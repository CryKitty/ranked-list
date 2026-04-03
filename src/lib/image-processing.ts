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
      if (!blob) {
        reject(new Error("Image could not be encoded."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export async function optimizeImageFile(file: File) {
  const isGif = file.type === "image/gif";

  if (isGif) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Animated GIFs must already be 2 MB or smaller.");
    }

    return {
      file,
      filename: file.name,
      contentType: file.type,
    };
  }

  if (file.size <= MAX_IMAGE_BYTES) {
    return {
      file,
      filename: file.name,
      contentType: file.type || "image/jpeg",
    };
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is unavailable in this browser.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);

  while (blob.size > MAX_IMAGE_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is still too large after compression.");
  }

  const filename = file.name.replace(/\.[^.]+$/, "") || "artwork";
  return {
    file: blob,
    filename: `${filename}.jpg`,
    contentType: "image/jpeg",
  };
}
