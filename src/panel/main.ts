import {
  CONFIG_ELEMENT_ID,
  MAX_STACK_COUNT,
  parseConfig,
  parseIntervalSeconds,
  type GalleryConfig,
  type GalleryImage,
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

type Switch = 'blur' | 'kenburns' | 'caption' | 'stack' | 'rotateOne';
const SWITCHES = ['blur', 'kenburns', 'caption', 'stack', 'rotateOne'] as const;
/** Steps "previous" can walk back through in the stack layout. */
const MAX_SNAPSHOTS = 100;

/** One place for an image: two layers that cross-fade, a blurred backdrop each, and a caption. */
class Slot {
  readonly root: HTMLElement;
  readonly #layers: readonly [HTMLElement, HTMLElement];
  readonly #caption: HTMLElement;
  #front: 0 | 1 = 0;
  #shown = 0;
  #request = 0;
  /** The image shown or loading here; undefined while the slot is not in use. */
  index: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    const layers = root.querySelectorAll<HTMLElement>('.layer');
    const [a, b] = [layers[0], layers[1]];
    if (!a || !b) throw new Error('A slot needs two layers');
    this.#layers = [a, b];
    this.#caption = query('.caption', HTMLElement, root);
  }

  /** Loads into the hidden layer and cross-fades once it is decoded; stale loads are ignored. */
  show(image: GalleryImage, index: number, loaded: () => void, failed: () => void): void {
    this.index = index;
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
      loaded();
    };
    photo.onerror = () => {
      if (request !== this.#request) return;
      failed();
    };
    // The outgoing layer keeps its zoom while it fades; this one restarts it once loaded.
    back.classList.remove('animate');
    photo.alt = image.label;
    photo.src = image.src;
  }

  /** Takes the slot out of use, drops any load still in flight, and blanks it. */
  clear(): void {
    this.index = undefined;
    this.#request++;
    for (const layer of this.#layers) layer.classList.remove('visible', 'animate');
    this.#caption.textContent = '';
  }
}

class Gallery {
  readonly #config: GalleryConfig;
  readonly #t: Messages;
  readonly #playlist: Playlist;
  readonly #slots: readonly Slot[];
  readonly #buttons: Record<'previous' | 'next' | 'toggle' | 'fit', HTMLButtonElement>;
  readonly #counter: HTMLElement;
  readonly #interval: {
    popover: Popover;
    input: HTMLInputElement;
    apply: HTMLButtonElement;
    hint: HTMLElement;
  };
  readonly #settings: Popover;
  readonly #switches: Record<Switch, HTMLInputElement>;
  readonly #counts: readonly HTMLInputElement[];
  readonly #failed = new Set<number>();
  readonly #state: PanelSettings;
  /** In the stack layout, which slot changes next when they take turns. */
  #turn = 0;
  /** In the stack layout, what was on screen before each change, for "previous". */
  #snapshots: number[][] = [];
  #paused = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: GalleryConfig, t: Messages) {
    this.#config = config;
    this.#t = t;
    this.#state = {
      intervalMs: config.intervalMs,
      fit: config.fit,
      blur: config.blur,
      effect: config.effect,
      caption: config.caption,
      layout: config.layout,
      count: config.count,
      rotate: config.rotate,
    };
    this.#playlist = new Playlist(config.images.length);
    this.#counter = query('#counter', HTMLElement);

    const container = query('#slots', HTMLElement);
    const template = query('#slot-template', HTMLTemplateElement);
    this.#slots = Array.from({ length: MAX_STACK_COUNT }, () => {
      const root = query(
        '.slot',
        HTMLElement,
        template.content.cloneNode(true) as DocumentFragment,
      );
      container.append(root);
      return new Slot(root);
    });

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
      stack: toggle('stack'),
      rotateOne: toggle('rotateOne'),
    };
    this.#counts = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="count"]'));
  }

  get #size(): number {
    return this.#config.images.length;
  }

  /** How many slots are in use: one for the slideshow, up to `count` for the stack. */
  get #active(): number {
    return this.#state.layout === 'stack' ? Math.min(this.#state.count, this.#size) : 1;
  }

  get #activeSlots(): readonly Slot[] {
    return this.#slots.slice(0, this.#active);
  }

  start(): void {
    this.#renderStaticText();
    this.#renderAll();
    this.#bindToolbar();
    this.#bindInterval();
    this.#bindSettings();

    this.#slots.forEach((slot) => {
      slot.root.addEventListener('click', () => {
        if (this.#size <= 1) return;
        if (this.#state.layout === 'stack') {
          this.#remember();
          this.#replace(slot);
        } else {
          this.#next();
        }
      });
    });
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

    this.#applyLayout();
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
    text('#count-label', this.#t.count);
    for (const name of SWITCHES) {
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
    this.#switches.stack.addEventListener('change', () => {
      this.#update({ layout: this.#switches.stack.checked ? 'stack' : 'slideshow' });
    });
    this.#switches.rotateOne.addEventListener('change', () => {
      this.#update({ rotate: this.#switches.rotateOne.checked ? 'one' : 'all' });
    });
    for (const radio of this.#counts) {
      radio.addEventListener('change', () => {
        if (radio.checked) this.#update({ count: Number(radio.value) });
      });
    }
  }

  #update(change: Partial<PanelSettings>): void {
    Object.assign(this.#state, change);
    this.#renderAll();
    if (change.layout !== undefined || change.count !== undefined) this.#applyLayout();
    else if (change.intervalMs !== undefined || change.rotate !== undefined) this.#schedule();
  }

  #renderAll(): void {
    const { fit, blur, effect, caption, intervalMs, layout, count, rotate } = this.#state;
    const body = document.body;
    body.dataset['fit'] = fit;
    body.dataset['layout'] = layout;
    body.classList.toggle('blur', blur);
    body.classList.toggle('kenburns', effect === 'kenburns');
    body.classList.toggle('show-caption', caption);
    body.classList.toggle('paused', this.#paused);
    // Taking turns, each image stays up for one interval per slot.
    const visibleMs =
      layout === 'stack' && rotate === 'one' ? intervalMs * this.#active : intervalMs;
    body.style.setProperty(
      '--gallery-kenburns',
      `${String(visibleMs > 0 ? visibleMs + 600 : KEN_BURNS_IDLE_MS)}ms`,
    );

    setLabel(this.#buttons.fit, fit === 'contain' ? this.#t.fill : this.#t.fit);
    setLabel(this.#interval.popover.button, this.#t.interval(intervalMs / 1000));
    this.#buttons.toggle.setAttribute('aria-pressed', String(this.#paused));
    setLabel(this.#buttons.toggle, this.#paused ? this.#t.resume : this.#t.pause);

    this.#switches.blur.checked = blur;
    this.#switches.kenburns.checked = effect === 'kenburns';
    this.#switches.caption.checked = caption;
    this.#switches.stack.checked = layout === 'stack';
    this.#switches.rotateOne.checked = rotate === 'one';
    this.#switches.rotateOne.disabled = layout !== 'stack';
    for (const radio of this.#counts) {
      radio.checked = Number(radio.value) === count;
      radio.disabled = layout !== 'stack';
    }
  }

  /** Shows the slots the layout uses, hides the rest, and fills any that are empty. */
  #applyLayout(): void {
    const active = this.#active;
    this.#slots.forEach((slot, i) => {
      slot.root.hidden = i >= active;
      if (i >= active) slot.clear();
    });
    this.#snapshots = [];
    this.#turn = 0;
    for (const slot of this.#activeSlots) {
      if (slot.index === undefined) this.#replace(slot);
    }
    const [first] = this.#slots;
    if (this.#state.layout === 'slideshow' && first?.index !== undefined) {
      this.#renderCounter(first.index);
    }
    this.#schedule();
  }

  /** The next image from the playlist that hasn't failed and isn't in `exclude`. */
  #draw(exclude: ReadonlySet<number>): number | undefined {
    // Every cycle holds each image once, so two cycles always reach any free image.
    for (let tries = 0; tries < this.#size * 2; tries++) {
      const index = this.#playlist.next();
      if (!this.#failed.has(index) && !exclude.has(index)) return index;
    }
    return undefined;
  }

  /** Images on screen in the slots in use, except in `slot`. */
  #onScreen(except?: Slot): Set<number> {
    const shown = new Set<number>();
    for (const slot of this.#activeSlots) {
      if (slot !== except && slot.index !== undefined) shown.add(slot.index);
    }
    return shown;
  }

  /** Puts a different image, not on screen elsewhere, in one slot. */
  #replace(slot: Slot): void {
    const exclude = this.#onScreen(slot);
    if (slot.index !== undefined) exclude.add(slot.index);
    const index = this.#draw(exclude);
    if (index !== undefined) this.#load(slot, index);
  }

  #load(slot: Slot, index: number): void {
    const image = this.#config.images[index];
    if (!image) return;
    slot.show(
      image,
      index,
      () => {
        if (this.#state.layout === 'slideshow') this.#renderCounter(index);
        this.#schedule();
      },
      () => {
        this.#failed.add(index);
        // Keeps showing what was there while another image loads.
        slot.index = undefined;
        if (this.#failed.size >= this.#size) {
          clearTimeout(this.#timer);
          showMessage(this.#t.allFailed);
          return;
        }
        this.#replace(slot);
      },
    );
  }

  /** Saves what is on screen so "previous" in the stack layout can bring it back. */
  #remember(): void {
    const current = this.#activeSlots.map((slot) => slot.index);
    if (current.some((index) => index === undefined)) return;
    this.#snapshots.push(current as number[]);
    if (this.#snapshots.length > MAX_SNAPSHOTS) this.#snapshots.shift();
  }

  #next(): void {
    if (this.#state.layout === 'slideshow') {
      const index = this.#draw(new Set());
      const [slot] = this.#slots;
      if (index !== undefined && slot) this.#load(slot, index);
      return;
    }
    // A whole new set, with no image twice.
    this.#remember();
    const chosen = new Set<number>();
    for (const slot of this.#activeSlots) {
      const index = this.#draw(chosen);
      if (index === undefined) continue;
      chosen.add(index);
      this.#load(slot, index);
    }
  }

  #previous(): void {
    if (this.#state.layout === 'slideshow') {
      const [slot] = this.#slots;
      if (slot) this.#load(slot, this.#playlist.previous());
      return;
    }
    const snapshot = this.#snapshots.pop();
    if (!snapshot) return;
    this.#activeSlots.forEach((slot, i) => {
      const index = snapshot[i];
      if (index !== undefined && index !== slot.index) this.#load(slot, index);
    });
  }

  /** What the timer does: the next image, the next set, or the next slot's turn. */
  #advance(): void {
    if (this.#state.layout === 'stack' && this.#state.rotate === 'one') {
      const slots = this.#activeSlots;
      const slot = slots[this.#turn % slots.length];
      this.#turn = (this.#turn + 1) % slots.length;
      if (!slot) return;
      this.#remember();
      this.#replace(slot);
      return;
    }
    this.#next();
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const rotates = this.#state.intervalMs > 0 && this.#size > this.#active;
    if (rotates && !this.#paused && !document.hidden) {
      this.#timer = setTimeout(() => {
        this.#advance();
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
