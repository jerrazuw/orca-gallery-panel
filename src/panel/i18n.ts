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
  settings: string;
  blur: string;
  kenburns: string;
  caption: string;
  stack: string;
  count: string;
  rotateOne: string;
  settingsNote: string;
  counter: (position: number, total: number) => string;
  empty: string;
  allFailed: string;
  demoTitle: string;
  demoRun: string;
  demoAdd: string;
  demoWatch: string;
  demoDismiss: string;
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
  settings: 'Display settings',
  blur: 'Blurred background',
  kenburns: 'Slow zoom (Ken Burns)',
  caption: 'Show image name',
  stack: 'Several images, stacked',
  count: 'Images at once',
  rotateOne: 'Change one at a time',
  settingsNote: 'Changes last until the panel reloads. Set defaults in gallery.config.json.',
  counter: (position, total) => `Image ${String(position)} of ${String(total)}`,
  empty: 'No images yet. Rebuild the panel with a folder that contains images.',
  allFailed: 'None of the images could be displayed.',
  demoTitle: 'These are sample images',
  demoRun: 'To show your own photos, run this in a terminal, with the path to your folder:',
  demoAdd:
    'Then, in Orca, go to Settings → Plugins → Development, click Add path and enter the full path of orca-gallery in your home folder.',
  demoWatch:
    'Leave the command running: photos you add to or remove from your folder show up in the panel on their own.',
  demoDismiss: 'Hide this note',
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
  settings: 'Ajustes de visualización',
  blur: 'Fondo difuminado',
  kenburns: 'Zoom lento (Ken Burns)',
  caption: 'Mostrar nombre',
  stack: 'Varias imágenes apiladas',
  count: 'Imágenes a la vez',
  rotateOne: 'Cambiar de a una',
  settingsNote:
    'Los cambios duran hasta que el panel se recargue. Los valores por defecto van en gallery.config.json.',
  counter: (position, total) => `Imagen ${String(position)} de ${String(total)}`,
  empty: 'Todavía no hay imágenes. Vuelve a generar el panel con una carpeta que tenga imágenes.',
  allFailed: 'No se pudo mostrar ninguna de las imágenes.',
  demoTitle: 'Estas son imágenes de ejemplo',
  demoRun: 'Para ver tus propias fotos, corre esto en una terminal, con la ruta de tu carpeta:',
  demoAdd:
    'Después, en Orca, ve a Settings → Plugins → Development, haz clic en Add path y escribe la ruta completa de orca-gallery en tu carpeta personal.',
  demoWatch:
    'Deja el comando corriendo: las fotos que agregues o quites de tu carpeta aparecen solas en el panel.',
  demoDismiss: 'Ocultar este aviso',
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
