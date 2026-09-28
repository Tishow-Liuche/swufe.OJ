/** Short-lived read snapshots with in-process request coalescing. Never use for authorization. */
export class BoundedReadCache {
  private readonly entries = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<any> }>();
  constructor(private readonly limit = 128) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing?.pending) return existing.pending;
    if (existing && existing.expiresAt > Date.now()) return Promise.resolve(existing.value as T);
    this.entries.delete(key);
    if (this.entries.size >= this.limit) {
      const evict = [...this.entries].find(([, entry]) => !entry.pending);
      if (evict) this.entries.delete(evict[0]);
      else return load();
    }
    const entry: { expiresAt: number; value?: unknown; pending?: Promise<T> } = { expiresAt: 0 };
    entry.pending = Promise.resolve().then(load).then(value => {
      entry.value = value;
      entry.expiresAt = Date.now() + ttlMs;
      entry.pending = undefined;
      return value;
    }, error => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    return entry.pending;
  }
}
