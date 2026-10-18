import {
  CONFIG_ELEMENT_ID,
  parseConfig,
  parseIntervalSeconds,
  type FitMode,
  type GalleryConfig,
} from './config.ts';
import { catalogs, pickLocale, type Messages } from './i18n.ts';
import { Playlist } from './playlist.ts';

function query<T extends Element>(selector: string, type: new () => T): T {
  const found = document.querySelector(selector);
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

function readConfig(): GalleryConfig {
  const raw = document.getElementById(CONFIG_ELEMENT_ID)?.textContent ?? '';
  return parseConfig(JSON.parse(raw));
}

class Gallery {
  readonly #config: GalleryConfig;
  readonly #t: Messages;
  readonly #playlist: Playlist;
  readonly #layers: readonly [HTMLImageElement, HTMLImageElement];
  readonly #buttons: Record<'previous' | 'next' | 'toggle' | 'interval' | 'fit', HTMLButtonElement>;
  readonly #counter: HTMLElement;
  readonly #editor: {
    root: HTMLElement;
    label: HTMLLabelElement;
    input: HTMLInputElement;
    apply: HTMLButtonElement;
    hint: HTMLElement;
  };
  readonly #failed = new Set<number>();
  #front: 0 | 1 = 0;
  #paused = false;
  #fit: FitMode;
  #intervalMs: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #request = 0;

  constructor(config: GalleryConfig, t: Messages) {
    this.#config = config;
    this.#t = t;
    this.#fit = config.fit;
    this.#intervalMs = config.intervalMs;
    this.#playlist = new Playlist(config.images.length);
    this.#layers = [query('#layer-a', HTMLImageElement), query('#layer-b', HTMLImageElement)];
    this.#counter = query('#counter', HTMLElement);
    const button = (action: string) => query(`[data-action="${action}"]`, HTMLButtonElement);
    this.#buttons = {
      previous: button('previous'),
      next: button('next'),
      toggle: button('toggle'),
      interval: button('interval'),
      fit: button('fit'),
    };
    this.#editor = {
      root: query('#interval-editor', HTMLElement),
      label: query('#interval-label', HTMLLabelElement),
      input: query('#interval-input', HTMLInputElement),
      apply: query('#interval-apply', HTMLButtonElement),
      hint: query('#interval-hint', HTMLElement),
    };
  }

  get #size(): number {
    return this.#config.images.length;
  }

  start(): void {
    document.body.classList.toggle('single', this.#size === 1);
    setLabel(this.#buttons.previous, this.#t.previous);
    setLabel(this.#buttons.next, this.#t.next);
    this.#editor.label.textContent = this.#t.intervalLabel;
    this.#editor.apply.textContent = this.#t.apply;
    this.#renderPaused();
    this.#renderFit();
    this.#renderInterval();

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
      this.#toggleFit();
    });
    this.#buttons.interval.addEventListener('click', () => {
      if (this.#editor.root.hidden) this.#openEditor();
      else this.#closeEditor();
    });
    // Enter and a button instead of a <form>: Orca cancels every submit event inside a panel.
    this.#editor.apply.addEventListener('click', () => {
      this.#applyInterval();
    });
    this.#editor.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#applyInterval();
      }
    });
    this.#editor.input.addEventListener('input', () => {
      this.#showHint(false);
    });
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      const inside =
        target instanceof Node &&
        (this.#editor.root.contains(target) || this.#buttons.interval.contains(target));
      if (!this.#editor.root.hidden && !inside) this.#closeEditor(false);
    });
    for (const layer of this.#layers) {
      layer.addEventListener('click', () => {
        if (this.#size > 1) this.#next();
      });
    }
    document.addEventListener('keydown', (event) => {
      this.#onKey(event);
    });
    document.addEventListener('visibilitychange', () => {
      this.#schedule();
    });

    this.#next();
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

    back.onload = () => {
      if (request !== this.#request) return;
      back.classList.add('visible');
      front.classList.remove('visible');
      this.#front = this.#front === 0 ? 1 : 0;
      this.#renderCounter(index);
      this.#schedule();
    };
    back.onerror = () => {
      if (request !== this.#request) return;
      this.#failed.add(index);
      if (this.#failed.size >= this.#size) {
        clearTimeout(this.#timer);
        showMessage(this.#t.allFailed);
        return;
      }
      this.#next();
    };
    back.alt = image.label;
    back.src = image.src;
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const rotates = this.#intervalMs > 0 && this.#size > 1;
    if (rotates && !this.#paused && !document.hidden) {
      this.#timer = setTimeout(() => {
        this.#next();
      }, this.#intervalMs);
    }
  }

  #togglePause(): void {
    this.#paused = !this.#paused;
    this.#renderPaused();
    this.#schedule();
  }

  #toggleFit(): void {
    this.#fit = this.#fit === 'contain' ? 'cover' : 'contain';
    this.#renderFit();
  }

  #openEditor(): void {
    this.#editor.root.hidden = false;
    this.#buttons.interval.setAttribute('aria-expanded', 'true');
    document.body.classList.add('editing');
    this.#editor.input.value = String(this.#intervalMs / 1000);
    this.#showHint(false);
    this.#editor.input.focus();
    this.#editor.input.select();
  }

  #closeEditor(restoreFocus = true): void {
    this.#editor.root.hidden = true;
    this.#buttons.interval.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('editing');
    if (restoreFocus) this.#buttons.interval.focus();
  }

  #applyInterval(): void {
    const seconds = parseIntervalSeconds(this.#editor.input.value);
    if (seconds === undefined) {
      this.#showHint(true);
      this.#editor.input.focus();
      return;
    }
    this.#intervalMs = seconds * 1000;
    this.#renderInterval();
    this.#closeEditor();
    this.#schedule();
  }

  #showHint(invalid: boolean): void {
    this.#editor.input.setAttribute('aria-invalid', String(invalid));
    this.#editor.hint.classList.toggle('error', invalid);
    this.#editor.hint.textContent = invalid ? this.#t.intervalInvalid : this.#t.intervalHint;
  }

  #renderInterval(): void {
    setLabel(this.#buttons.interval, this.#t.interval(this.#intervalMs / 1000));
  }

  #renderPaused(): void {
    document.body.classList.toggle('paused', this.#paused);
    this.#buttons.toggle.setAttribute('aria-pressed', String(this.#paused));
    setLabel(this.#buttons.toggle, this.#paused ? this.#t.resume : this.#t.pause);
  }

  #renderFit(): void {
    document.body.dataset['fit'] = this.#fit;
    setLabel(this.#buttons.fit, this.#fit === 'contain' ? this.#t.fill : this.#t.fit);
  }

  #renderCounter(index: number): void {
    const position = index + 1;
    this.#counter.textContent = `${String(position)} / ${String(this.#size)}`;
    this.#counter.setAttribute('aria-label', this.#t.counter(position, this.#size));
  }

  #onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && !this.#editor.root.hidden) {
      this.#closeEditor();
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
        this.#toggleFit();
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
}

main();
