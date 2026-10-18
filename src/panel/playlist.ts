export type Random = () => number;

export const MAX_HISTORY = 500;

export function shuffledCycle(size: number, random: Random, avoidFirst?: number): number[] {
  const order = Array.from({ length: size }, (_, index) => ({ index, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ index }) => index);

  if (size > 1 && order[0] === avoidFirst) {
    return order.slice(1).concat(order.slice(0, 1));
  }
  return order;
}

/**
 * Plays every image once per cycle in random order, never repeats an image
 * across a cycle boundary, and remembers what was shown so "previous" walks back.
 */
export class Playlist {
  readonly size: number;
  readonly #random: Random;
  #history: number[] = [];
  #position = -1;

  constructor(size: number, random: Random = Math.random) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError(`Playlist size must be a positive integer, got ${String(size)}`);
    }
    this.size = size;
    this.#random = random;
  }

  get current(): number | undefined {
    return this.#history[this.#position];
  }

  next(): number {
    if (this.#position === this.#history.length - 1) {
      this.#history.push(...shuffledCycle(this.size, this.#random, this.#history.at(-1)));
      this.#trim();
    }
    this.#position += 1;
    return this.#at(this.#position);
  }

  previous(): number {
    if (this.#position > 0) this.#position -= 1;
    return this.#at(this.#position);
  }

  #trim(): void {
    const excess = this.#history.length - MAX_HISTORY;
    if (excess > 0) {
      this.#history = this.#history.slice(excess);
      this.#position -= excess;
    }
  }

  #at(position: number): number {
    const index = this.#history[position];
    if (index === undefined) throw new Error('Playlist is empty: call next() first');
    return index;
  }
}
