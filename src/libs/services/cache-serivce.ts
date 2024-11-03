import {
  ChunkCache,
  IDBChunkCache,
} from "../cache/chunk-cache";
import {
  EventHandler,
  MultiEventEmitter,
} from "../utils/event-emitter";
import {
  createStore,
  SetStoreFunction,
  StoreSetter,
} from "solid-js/store";
import { FileID } from "../core/type";
import {
  Accessor,
  batch,
  createSignal,
  Setter,
} from "solid-js";
import { appOptions } from "@/options";
import { DBNAME_PREFIX, FileMetaData } from "../cache";

type EventMap = {
  update: string;
  cleanup: string;
};

class FileCacheFactory {
  status: Accessor<"ready" | "loading">;
  private setStatus: Setter<"ready" | "loading">;
  private eventEmitter: MultiEventEmitter<EventMap> =
    new MultiEventEmitter();
  readonly cacheInfo: Record<FileID, FileMetaData>;
  private setCacheInfo: SetStoreFunction<
    Record<FileID, FileMetaData>
  >;
  readonly caches: Record<FileID, ChunkCache>;
  private setCaches: SetStoreFunction<
    Record<FileID, ChunkCache>
  >;
  constructor() {
    const [caches, setCaches] = createStore<
      Record<FileID, ChunkCache>
    >({});
    this.caches = caches;
    this.setCaches = setCaches;
    const [status, setStatus] = createSignal<
      "ready" | "loading"
    >("loading");
    this.status = status;
    this.setStatus = setStatus;
    const [cacheInfo, setCacheInfo] = createStore<
      Record<FileID, FileMetaData>
    >({});
    this.cacheInfo = cacheInfo;
    this.setCacheInfo = setCacheInfo;
    this.update();
  }

  addEventListener<K extends keyof EventMap>(
    eventName: K,
    handler: EventHandler<EventMap[K]>,
  ) {
    return this.eventEmitter.addEventListener(
      eventName,
      handler,
    );
  }

  removeEventListener<K extends keyof EventMap>(
    eventName: K,
    handler: EventHandler<EventMap[K]>,
  ) {
    return this.eventEmitter.removeEventListener(
      eventName,
      handler,
    );
  }

  private dispatchEvent<K extends keyof EventMap>(
    eventName: K,
    event: EventMap[K],
  ) {
    return this.eventEmitter.dispatchEvent(
      eventName,
      event,
    );
  }

  async update() {
    const databases = await indexedDB.databases();

    const fileDBs = databases
      .filter((db) => db.name?.startsWith(DBNAME_PREFIX))
      .map((db) =>
        db.name!.substring(DBNAME_PREFIX.length),
      );

    await Promise.all(
      fileDBs.map((id) => this.createCache(id)),
    )
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.setStatus("ready");
      });
  }

  getCache(id: FileID): ChunkCache | null {
    if (this.caches[id]) {
      return this.caches[id];
    }
    return null;
  }

  async remove(id: FileID) {
    const cache = this.caches[id];
    if (cache) {
      await cache.cleanup();
      this.setCaches(id, undefined!);
    }
    return;
  }

  async createCache(id: FileID): Promise<ChunkCache> {
    if (this.caches[id]) {
      console.warn(`cache ${id} has already created`);
      return this.caches[id];
    }

    const cache = new IDBChunkCache({
      id,
      maxMomeryCacheSize: appOptions.maxMomeryCacheSlices,
    });
    cache.addEventListener("update", (ev) => {
      this.setCacheInfo(id, ev.detail ?? undefined!);
    });
    cache.addEventListener("cleanup", () => {
      this.setCacheInfo(id, undefined!);
      this.setCaches(id, undefined!);
    });
    cache.addEventListener("merged", (ev) => {
      if (appOptions.automaticDownload) {
        const file = ev.detail;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
      }
    });
    await cache.initialize();
    this.setCaches(id, cache);
    return cache;
  }
}

export const cacheManager = new FileCacheFactory();
