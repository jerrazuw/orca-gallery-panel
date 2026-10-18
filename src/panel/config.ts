export const FIT_MODES = ['contain', 'cover'] as const;
export type FitMode = (typeof FIT_MODES)[number];

export const EFFECTS = ['none', 'kenburns'] as const;
export type Effect = (typeof EFFECTS)[number];

export interface GalleryImage {
  src: string;
  label: string;
}

/** The part of the config a viewer can change from the panel while it is open. */
export interface PanelSettings {
  intervalMs: number;
  fit: FitMode;
  blur: boolean;
  effect: Effect;
  caption: boolean;
}

export interface GalleryConfig extends PanelSettings {
  images: GalleryImage[];
}

export const CONFIG_ELEMENT_ID = 'gallery-config';
export const MAX_INTERVAL_SECONDS = 86_400;

export function isFitMode(value: unknown): value is FitMode {
  return FIT_MODES.includes(value as FitMode);
}

export function isEffect(value: unknown): value is Effect {
  return EFFECTS.includes(value as Effect);
}

export function parseConfig(raw: unknown): GalleryConfig {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('Config must be an object');
  const { images, intervalMs, fit, blur, effect, caption } = raw as Record<string, unknown>;

  if (!Array.isArray(images)) throw new TypeError('Config.images must be an array');
  const parsed = images.map((image: unknown, i) => {
    const { src, label } = (image ?? {}) as Record<string, unknown>;
    if (typeof src !== 'string' || !src.startsWith('data:image/')) {
      throw new TypeError(`Config.images[${String(i)}].src must be a data:image URL`);
    }
    return { src, label: typeof label === 'string' ? label : '' };
  });

  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new TypeError('Config.intervalMs must be a non-negative number');
  }
  if (!isFitMode(fit)) throw new TypeError(`Config.fit must be one of ${FIT_MODES.join(', ')}`);
  if (!isEffect(effect)) {
    throw new TypeError(`Config.effect must be one of ${EFFECTS.join(', ')}`);
  }
  if (typeof blur !== 'boolean') throw new TypeError('Config.blur must be a boolean');
  if (typeof caption !== 'boolean') throw new TypeError('Config.caption must be a boolean');

  return { images: parsed, intervalMs, fit, blur, effect, caption };
}

/** Parses what a user typed as the interval; undefined unless it is a whole number of seconds in range. */
export function parseIntervalSeconds(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  return seconds <= MAX_INTERVAL_SECONDS ? seconds : undefined;
}
