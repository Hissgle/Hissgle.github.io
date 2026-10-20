export const MAX_IMAGE_BYTES = 800 * 1024;

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export type CompressedImage = {
  filename: string;
  mime: string;
  data: string;
  size: number;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const index = dataUrl.indexOf(',');
  return index >= 0 ? dataUrl.slice(index + 1) : dataUrl;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法解码，请换一张试试'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片压缩失败'));
      },
      mime,
      quality,
    );
  });
}

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'webp';
  }
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').slice(0, 60) || 'image';
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!ALLOWED.has(file.type)) {
    throw new Error('只支持 JPG / PNG / WebP / GIF / AVIF 图片');
  }
  if (file.size === 0) throw new Error('图片为空');

  // 小图/动图直接保留，避免无谓的有损压缩。
  if (file.size <= MAX_IMAGE_BYTES && file.type === 'image/gif') {
    const dataUrl = await readAsDataUrl(file);
    return {
      filename: `${baseName(file.name)}.gif`,
      mime: 'image/gif',
      data: dataUrlToBase64(dataUrl),
      size: file.size,
    };
  }

  const image = await loadImage(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持图片压缩');
  ctx.drawImage(image, 0, 0, width, height);

  if (file.size <= MAX_IMAGE_BYTES && scale === 1) {
    const dataUrl = await readAsDataUrl(file);
    return {
      filename: `${baseName(file.name)}.${extensionFor(file.type)}`,
      mime: file.type,
      data: dataUrlToBase64(dataUrl),
      size: file.size,
    };
  }

  let quality = 0.84;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);

  while (blob.size > MAX_IMAGE_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    // 再缩一档尺寸
    const ratio = Math.sqrt(MAX_IMAGE_BYTES / blob.size) * 0.95;
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(width * ratio));
    smaller.height = Math.max(1, Math.round(height * ratio));
    const smallerCtx = smaller.getContext('2d');
    if (!smallerCtx) throw new Error('当前浏览器不支持图片压缩');
    smallerCtx.drawImage(image, 0, 0, smaller.width, smaller.height);
    blob = await canvasToBlob(smaller, 'image/webp', 0.72);
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('图片压缩后仍超过 800 KB，请换一张更小的图');
  }

  const mime = blob.type === 'image/png' ? 'image/png' : 'image/webp';
  const dataUrl = await readAsDataUrl(new File([blob], `image.${extensionFor(mime)}`, { type: mime }));
  return {
    filename: `${baseName(file.name)}.${extensionFor(mime)}`,
    mime,
    data: dataUrlToBase64(dataUrl),
    size: blob.size,
  };
}