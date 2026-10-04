// A stand-in for the browser's IndexedDB, for tests. Its databases live in
// memory and every page that opens one shares it, as the tabs of a browser
// share the browser's. A transaction runs whole, its requests one after another,
// before the next transaction starts, and what it puts lands only once it
// completes, so a look and a put in one transaction are one step.

type Handler = ((ev: Event) => void) | null;

/** The timer the stand-in runs on: the one there was when it loaded, which a test's fake timers leave alone. */
const tick = globalThis.setTimeout.bind(globalThis);

/** A request: its result, and the handler told once it has one. */
class FakeRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
}

type Stores = Map<string, Map<string, unknown>>;

class FakeTransaction {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  error: DOMException | null = null;
  /** The requests made on it, in order, each with the step that answers it. */
  readonly queue: { request: FakeRequest; run: () => unknown }[] = [];
  /** What it puts, landing once it completes. */
  readonly puts = new Map<string, Map<string, unknown>>();
  aborted = false;

  constructor(
    private readonly stores: Stores,
    private readonly names: string[],
    readonly mode: IDBTransactionMode,
  ) {}

  objectStore(name: string): unknown {
    if (!this.names.includes(name) || !this.stores.has(name)) throw new DOMException(`No store ${name}`, "NotFoundError");
    const committed = this.stores.get(name) as Map<string, unknown>;
    const ask = (run: () => unknown): FakeRequest => {
      const request = new FakeRequest();
      this.queue.push({ request, run });
      return request;
    };
    return {
      get: (key: string) =>
        ask(() => {
          const put = this.puts.get(name);
          return structuredClone(put?.has(key) ? put.get(key) : committed.get(key));
        }),
      put: (value: unknown, key: string) =>
        ask(() => {
          if (this.mode !== "readwrite") throw new DOMException("Read-only", "ReadOnlyError");
          let put = this.puts.get(name);
          if (!put) this.puts.set(name, (put = new Map()));
          put.set(key, structuredClone(value));
          return key;
        }),
    };
  }

  abort(): void {
    this.aborted = true;
  }
}

/** The handle a page or a test holds on the shared databases. */
export interface FakeIndexedDb {
  /** What a page reads as `window.indexedDB`. */
  readonly factory: IDBFactory;
  /** Hold every transaction from now on until `release`. */
  hold: () => void;
  /** Run the transactions held, in the order they were made, and let the next ones run at once. */
  release: () => void;
  /** Whether a transaction that puts anything is refused, as by a browser out of room. */
  refuse: boolean;
  /** Whether opening a database is refused, as by a browser that blocks storage. */
  blocked: boolean;
  /** What a database's store holds under `key`, as committed. */
  peek: (database: string, store: string, key: string) => unknown;
  /** Resolves once nothing is left to run but what is held. */
  idle: () => Promise<void>;
}

/** A fresh set of databases, empty, shared by everything that opens one of them through `factory`. */
export function fakeIndexedDb(): FakeIndexedDb {
  const databases = new Map<string, { version: number; stores: Stores }>();
  const waiting: (() => void)[] = [];
  let holding = false;
  /** Steps set to run that have not run or been held yet. */
  let due = 0;
  const later = (step: () => void): void => {
    due++;
    tick(() => {
      due--;
      if (holding) waiting.push(step);
      else step();
    }, 0);
  };
  const event = (type: string): Event => new Event(type);

  const run = (tx: FakeTransaction, stores: Stores): void => {
    for (let i = 0; i < tx.queue.length && !tx.aborted; i++) {
      const { request, run: answer } = tx.queue[i] as { request: FakeRequest; run: () => unknown };
      try {
        request.result = answer();
        request.onsuccess?.(event("success"));
      } catch (e) {
        request.error = e as DOMException;
        tx.error = e as DOMException;
        request.onerror?.(event("error"));
        tx.aborted = true;
      }
    }
    if (!tx.aborted && handle.refuse && tx.puts.size > 0) {
      tx.error = new DOMException("The browser is out of room", "QuotaExceededError");
      tx.aborted = true;
    }
    if (tx.aborted) {
      tx.onerror?.(event("error"));
      tx.onabort?.(event("abort"));
      return;
    }
    for (const [name, put] of tx.puts) for (const [key, value] of put) stores.get(name)?.set(key, value);
    tx.oncomplete?.(event("complete"));
  };

  const database = (stores: Stores): unknown => ({
    onversionchange: null,
    close: () => {},
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => {
      stores.set(name, new Map());
      return {};
    },
    transaction: (names: string | string[], mode: IDBTransactionMode = "readonly") => {
      const tx = new FakeTransaction(stores, Array.isArray(names) ? names : [names], mode);
      later(() => run(tx, stores));
      return tx;
    },
  });

  const factory = {
    open: (name: string, version = 1) => {
      const request = new FakeRequest();
      later(() => {
        if (handle.blocked) {
          request.error = new DOMException("The browser blocks storage", "SecurityError");
          request.onerror?.(event("error"));
          return;
        }
        let entry = databases.get(name);
        const upgrade = !entry || entry.version < version;
        if (!entry) databases.set(name, (entry = { version, stores: new Map() }));
        request.result = database(entry.stores);
        if (upgrade) {
          entry.version = version;
          request.onupgradeneeded?.(event("upgradeneeded"));
        }
        request.onsuccess?.(event("success"));
      });
      return request;
    },
  };

  const handle: FakeIndexedDb = {
    factory: factory as unknown as IDBFactory,
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const step of waiting.splice(0)) step();
    },
    refuse: false,
    blocked: false,
    peek: (name, store, key) => databases.get(name)?.stores.get(store)?.get(key),
    idle: async () => {
      // Twice in a row, so a step queued by what the last one resolved is counted.
      for (let i = 0, quiet = 0; i < 1000; i++) {
        await new Promise<void>((resolve) => tick(resolve, 0));
        quiet = due === 0 ? quiet + 1 : 0;
        if (quiet === 2) return;
      }
      throw new Error("the stand-in never went idle");
    },
  };
  return handle;
}
