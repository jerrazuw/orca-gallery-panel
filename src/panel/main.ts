import {
  CONFIG_ELEMENT_ID,
  parseConfig,
  parseIntervalSeconds,
  type GalleryConfig,
  type PanelSettings,
} from './config.ts';
import { catalogs, pickLocale, type Messages } from './i18n.ts';
import { Playlist } from './playlist.ts';

const KEN_BURNS_IDLE_MS = 30_000;

function query<T extends Element>(
  selector: string,
  type: new () => T,
  root: ParentNode = document,
): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing ${type.name} ${selector}`);
  return found;
}

function setLabel(element: HTMLElement, label: string): void {
  element.setAttribute('aria-label', label);
  element.title = label;
}

function showMessage(text: string): void {
  document.body.classList.add('message');
  query('#message', HTMLElement).textContent = text;
}

/** In the sample build, explains how to load a folder of your own photos. */
function showDemoNote(t: Messages): void {
  const note = query('#demo-note', HTMLElement);
  query('#demo-title', HTMLElement).textContent = t.demoTitle;
  query('#demo-run', HTMLElement).textContent = t.demoRun;
  query('#demo-add', HTMLElement).textContent = t.demoAdd;
  query('#demo-watch', HTMLElement).textContent = t.demoWatch;
  const dismiss = query('#demo-dismiss', HTMLButtonElement);
  setLabel(dismiss, t.demoDismiss);
  dismiss.addEventListener('click', () => {
    note.hidden = true;
  });
  note.hidden = false;
}

function readConfig(): GalleryConfig {
  const raw = document.getElementById(CONFIG_ELEMENT_ID)?.textContent ?? '';
  return parseConfig(JSON.parse(raw));
}

/** A toolbar button that opens a panel above it. Only one is open at a time. */
class Popover {
  static #open: Popover | undefined;
  readonly button: HTMLButtonElement;
  readonly root: HTMLElement;
  readonly #onOpen: () => void;

  constructor(button: HTMLButtonElement, root: HTMLElement, onOpen: () => void) {
    this.button = button;
    this.root = root;
    this.#onOpen = onOpen;
    button.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });
  }

  static get current(): Popover | undefined {
    return Popover.#open;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  contains(target: Node): boolean {
    return this.root.contains(target) || this.button.contains(target);
  }

  open(): void {
    Popover.#open?.close(false);
    Popover.#open = this;
    this.root.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('editing');
    this.#onOpen();
  }

  close(restoreFocus = true): void {
    if (!this.isOpen) return;
    if (Popover.#open === this) Popover.#open = undefined;
    this.root.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('editing');
    if (restoreFocus) this.button.focus();
  }
}

type Switch = 'blur' | 'kenburns' | 'caption';

class Gallery {
  readonly #config: GalleryConfig;
  readonly #t: Messages;
  readonly #playlist: Playlist;
  readonly #layers: readonly [HTMLElement, HTMLElement];
  readonly #buttons: Record<'previous' | 'next' | 'toggle' | 'fit', HTMLButtonElement>;
  readonly #counter: HTMLElement;
  readonly #caption: HTMLElement;
  readonly #interval: {
    popover: Popover;
    input: HTMLInputElement;
    apply: HTMLButtonElement;
    hint: HTMLElement;
  };
  readonly #settings: Popover;
  readonly #switches: Record<Switch, HTMLInputElement>;
  readonly #failed = new Set<number>();
  readonly #state: PanelSettings;
  #front: 0 | 1 = 0;
  #shown = 0;
  #paused = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #request = 0;

  constructor(config: GalleryConfig, t: Messages) {
    this.#config = config;
    this.#t = t;
    this.#state = {
      intervalMs: config.intervalMs,
      fit: config.fit,
      blur: config.blur,
      effect: config.effect,
      caption: config.caption,
    };
    this.#playlist = new Playlist(config.images.length);
    this.#layers = [query('#layer-a', HTMLElement), query('#layer-b', HTMLElement)];
    this.#counter = query('#counter', HTMLElement);
    this.#caption = query('#caption', HTMLElement);

    const button = (action: string) => query(`[data-action="${action}"]`, HTMLButtonElement);
    this.#buttons = {
      previous: button('previous'),
      next: button('next'),
      toggle: button('toggle'),
      fit: button('fit'),
    };
    this.#interval = {
      popover: new Popover(button('interval'), query('#interval-editor', HTMLElement), () => {
        this.#interval.input.value = String(this.#state.intervalMs / 1000);
        this.#showIntervalHint(false);
        this.#interval.input.focus();
        this.#interval.input.select();
      }),
      input: query('#interval-input', HTMLInputElement),
      apply: query('#interval-apply', HTMLButtonElement),
      hint: query('#interval-hint', HTMLElement),
    };
    this.#settings = new Popover(button('settings'), query('#settings-panel', HTMLElement), () => {
      this.#switches.blur.focus();
    });
    const toggle = (name: Switch) => query(`[data-setting="${name}"]`, HTMLInputElement);
    this.#switches = {
      blur: toggle('blur'),
      kenburns: toggle('kenburns'),
      caption: toggle('caption'),
    };
  }

  get #size(): number {
    return this.#config.images.length;
  }

  start(): void {
    this.#renderStaticText();
    this.#renderAll();
    this.#bindToolbar();
    this.#bindInterval();
    this.#bindSettings();

    for (const layer of this.#layers) {
      layer.addEventListener('click', () => {
        if (this.#size > 1) this.#next();
      });
    }
    document.addEventListener('pointerdown', (event) => {
      const open = Popover.current;
      if (open && !(event.target instanceof Node && open.contains(event.target))) open.close(false);
    });
    document.addEventListener('keydown', (event) => {
      this.#onKey(event);
    });
    document.addEventListener('visibilitychange', () => {
      this.#schedule();
    });

    this.#next();
  }

  #renderStaticText(): void {
    const text = (selector: string, value: string) => {
      query(selector, HTMLElement).textContent = value;
    };
    document.body.classList.toggle('single', this.#size === 1);
    setLabel(this.#buttons.previous, this.#t.previous);
    setLabel(this.#buttons.next, this.#t.next);
    setLabel(this.#settings.button, this.#t.settings);
    text('#interval-label', this.#t.intervalLabel);
    this.#interval.apply.textContent = this.#t.apply;
    text('#settings-title', this.#t.settings);
    text('#settings-note', this.#t.settingsNote);
    for (const name of ['blur', 'kenburns', 'caption'] as const) {
      query('span', HTMLElement, this.#switches[name].closest('label') ?? document).textContent =
        this.#t[name];
    }
  }

  #bindToolbar(): void {
    this.#buttons.previous.addEventListener('click', () => {
      this.#previous();
    });
    this.#buttons.next.addEventListener('click', () => {
      this.#next();
    });
    this.#buttons.toggle.addEventListener('click', () => {
      this.#togglePause();
    });
    this.#buttons.fit.addEventListener('click', () => {
      this.#update({ fit: this.#state.fit === 'contain' ? 'cover' : 'contain' });
    });
  }

  #bindInterval(): void {
    // Enter and a button instead of a <form>: Orca cancels every submit event inside a panel.
    this.#interval.apply.addEventListener('click', () => {
      this.#applyInterval();
    });
    this.#interval.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#applyInterval();
      }
    });
    this.#interval.input.addEventListener('input', () => {
      this.#showIntervalHint(false);
    });
  }

  #bindSettings(): void {
    this.#switches.blur.addEventListener('change', () => {
      this.#update({ blur: this.#switches.blur.checked });
    });
    this.#switches.kenburns.addEventListener('change', () => {
      this.#update({ effect: this.#switches.kenburns.checked ? 'kenburns' : 'none' });
    });
    this.#switches.caption.addEventListener('change', () => {
      this.#update({ caption: this.#switches.caption.checked });
    });
  }

  #update(change: Partial<PanelSettings>): void {
    Object.assign(this.#state, change);
    this.#renderAll();
    if (change.intervalMs !== undefined) this.#schedule();
  }

  #renderAll(): void {
    const { fit, blur, effect, caption, intervalMs } = this.#state;
    const body = document.body;
    body.dataset['fit'] = fit;
    body.classList.toggle('blur', blur);
    body.classList.toggle('kenburns', effect === 'kenburns');
    body.classList.toggle('show-caption', caption);
    body.classList.toggle('paused', this.#paused);
    body.style.setProperty(
      '--gallery-kenburns',
      `${String(intervalMs > 0 ? intervalMs + 600 : KEN_BURNS_IDLE_MS)}ms`,
    );

    setLabel(this.#buttons.fit, fit === 'contain' ? this.#t.fill : this.#t.fit);
    setLabel(this.#interval.popover.button, this.#t.interval(intervalMs / 1000));
    this.#buttons.toggle.setAttribute('aria-pressed', String(this.#paused));
    setLabel(this.#buttons.toggle, this.#paused ? this.#t.resume : this.#t.pause);

    this.#switches.blur.checked = blur;
    this.#switches.kenburns.checked = effect === 'kenburns';
    this.#switches.caption.checked = caption;
  }

  #next(): void {
    this.#show(this.#playlist.next());
  }

  #previous(): void {
    this.#show(this.#playlist.previous());
  }

  /** Loads into the hidden layer and cross-fades once it is decoded; stale loads are ignored. */
  #show(index: number): void {
    const image = this.#config.images[index];
    if (!image) return;
    const request = ++this.#request;
    const back = this.#layers[this.#front === 0 ? 1 : 0];
    const front = this.#layers[this.#front];
    const photo = query('.photo', HTMLImageElement, back);
    const backdrop = query('.backdrop', HTMLImageElement, back);

    photo.onload = () => {
      if (request !== this.#request) return;
      backdrop.src = image.src;
      back.classList.toggle('alternate', this.#shown++ % 2 === 1);
      // Flushes the removal of "animate" so the zoom restarts even if no frame ran in between.
      back.getBoundingClientRect();
      back.classList.add('visible', 'animate');
      front.classList.remove('visible');
      this.#front = this.#front === 0 ? 1 : 0;
      this.#caption.textContent = image.label;
      this.#renderCounter(index);
      this.#schedule();
    };
    photo.onerror = () => {
      if (request !== this.#request) return;
      this.#failed.add(index);
      if (this.#failed.size >= this.#size) {
        clearTimeout(this.#timer);
        showMessage(this.#t.allFailed);
        return;
      }
      this.#next();
    };
    // The outgoing layer keeps its zoom while it fades; this one restarts it once loaded.
    back.classList.remove('animate');
    photo.alt = image.label;
    photo.src = image.src;
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const rotates = this.#state.intervalMs > 0 && this.#size > 1;
    if (rotates && !this.#paused && !document.hidden) {
      this.#timer = setTimeout(() => {
        this.#next();
      }, this.#state.intervalMs);
    }
  }

  #togglePause(): void {
    this.#paused = !this.#paused;
    this.#renderAll();
    this.#schedule();
  }

  #applyInterval(): void {
    const seconds = parseIntervalSeconds(this.#interval.input.value);
    if (seconds === undefined) {
      this.#showIntervalHint(true);
      this.#interval.input.focus();
      return;
    }
    this.#interval.popover.close();
    this.#update({ intervalMs: seconds * 1000 });
  }

  #showIntervalHint(invalid: boolean): void {
    const { input, hint } = this.#interval;
    input.setAttribute('aria-invalid', String(invalid));
    hint.classList.toggle('error', invalid);
    hint.textContent = invalid ? this.#t.intervalInvalid : this.#t.intervalHint;
  }

  #renderCounter(index: number): void {
    const position = index + 1;
    this.#counter.textContent = `${String(position)} / ${String(this.#size)}`;
    this.#counter.setAttribute('aria-label', this.#t.counter(position, this.#size));
  }

  #onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && Popover.current) {
      Popover.current.close();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === ' ' && event.target instanceof HTMLButtonElement) return;

    const actions: Partial<Record<string, () => void>> = {
      ArrowRight: () => {
        this.#next();
      },
      ArrowLeft: () => {
        this.#previous();
      },
      ' ': () => {
        this.#togglePause();
      },
      f: () => {
        this.#update({ fit: this.#state.fit === 'contain' ? 'cover' : 'contain' });
      },
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }
}

function main(): void {
  const locale = pickLocale(navigator.languages);
  const t = catalogs[locale];
  document.documentElement.lang = locale;

  const config = readConfig();
  if (config.images.length === 0) {
    showMessage(t.empty);
    return;
  }
  new Gallery(config, t).start();
  if (config.demo) showDemoNote(t);
}

main();
