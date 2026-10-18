import sharp from 'sharp';

export interface EncodeOptions {
  maxSize: number;
  quality: number;
}

export interface EncodedImage {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  animated: boolean;
}

/**
 * Re-encodes every format to WebP: it keeps transparency and animation, and is
 * much smaller than PNG or GIF, which matters under Orca's 10 MiB panel limit.
 */
export async function encodeImage(
  file: string,
  { maxSize, quality }: EncodeOptions,
): Promise<EncodedImage> {
  const { data, info } = await sharp(file, { animated: true })
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  const frames = info.pages ?? 1;
  return {
    dataUrl: `data:image/webp;base64,${data.toString('base64')}`,
    bytes: data.length,
    width: info.width,
    height: info.pageHeight ?? info.height,
    animated: frames > 1,
  };
}
