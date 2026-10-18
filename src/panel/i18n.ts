export interface Messages {
  previous: string;
  next: string;
  pause: string;
  resume: string;
  fill: string;
  fit: string;
  interval: (seconds: number) => string;
  intervalLabel: string;
  intervalHint: string;
  intervalInvalid: string;
  apply: string;
  counter: (position: number, total: number) => string;
  empty: string;
  allFailed: string;
}

const en: Messages = {
  previous: 'Previous image',
  next: 'Next image',
  pause: 'Pause slideshow',
  resume: 'Resume slideshow',
  fill: 'Fill panel',
  fit: 'Fit image',
  interval: (seconds) =>
    seconds === 0
      ? 'Change interval (automatic change is off)'
      : `Change interval (${String(seconds)} s)`,
  intervalLabel: 'Seconds between images',
  intervalHint: '0 turns off the automatic change.',
  intervalInvalid: 'Enter a whole number from 0 to 86400.',
  apply: 'Apply',
  counter: (position, total) => `Image ${String(position)} of ${String(total)}`,
  empty: 'No images yet. Rebuild the panel with a folder that contains images.',
  allFailed: 'None of the images could be displayed.',
};

const es: Messages = {
  previous: 'Imagen anterior',
  next: 'Imagen siguiente',
  pause: 'Pausar presentación',
  resume: 'Reanudar presentación',
  fill: 'Llenar el panel',
  fit: 'Ver imagen completa',
  interval: (seconds) =>
    seconds === 0
      ? 'Cambiar intervalo (cambio automático apagado)'
      : `Cambiar intervalo (${String(seconds)} s)`,
  intervalLabel: 'Segundos entre imágenes',
  intervalHint: 'Con 0 no cambia sola.',
  intervalInvalid: 'Escribe un número entero entre 0 y 86400.',
  apply: 'Aplicar',
  counter: (position, total) => `Imagen ${String(position)} de ${String(total)}`,
  empty: 'Todavía no hay imágenes. Vuelve a generar el panel con una carpeta que tenga imágenes.',
  allFailed: 'No se pudo mostrar ninguna de las imágenes.',
};

export const catalogs = { en, es } as const;
export type Locale = keyof typeof catalogs;

export function pickLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base !== undefined && base in catalogs) return base as Locale;
  }
  return 'en';
}
