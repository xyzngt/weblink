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
} from "solid-js/store";
import { FileID } from "../core/type";
import {
  Accessor,
  createSignal,
  Setter,
} from "solid-js";
import { appOptions } from "@/options";
import {
  ChunkCacheInfo,
  DBNAME_PREFIX,
  FileMetaData,
} from "../cache";
import { v4 } from "uuid";

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

  async initialize() {
    try {
      const databases = await indexedDB.databases();

      const fileDBs = databases
        .filter((db) => db.name?.startsWith(DBNAME_PREFIX))
        .map((db) =>
          db.name!.substring(DBNAME_PREFIX.length),
        );

      const caches = await Promise.all(
        fileDBs.map((id) => this.loadCache(id)),
      );

      for (const cache of caches) {
        this.addCache(cache.id, cache);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.setStatus("ready");
    }
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

  private async loadCache(id: FileID): Promise<ChunkCache> {
    if (this.caches[id]) {
      return this.caches[id];
    }

    const cache = new IDBChunkCache({
      id,
      maxMomeryCacheSize: appOptions.maxMomeryCacheSlices,
    });

    cache.addEventListener("update", (ev) => {
      if (ev.detail) {
        this.setCacheInfo(id, ev.detail);
      }
    });

    cache.addEventListener("cleanup", () => {
      this.setCacheInfo(id, undefined!);
      this.setCaches(id, undefined!);
    });

    cache.addEventListener("complete", (ev) => {
      if (appOptions.automaticDownload) {
        const file = ev.detail;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
      }
    });
    await cache.initialize();

    return cache;
  }

  private async addCache(id: FileID, cache: ChunkCache) {
    this.setCaches(id, cache);
  }

  async getStorages(): Promise<ChunkCacheInfo[] | null> {
    let storage = await Promise.all(
      Object.values(this.caches).map((cache) =>
        cache.getInfo(),
      ),
    ).then(
      (infos) =>
        infos.filter(Boolean).map((info) => {
          const { file, ...rest } = info ?? {};
          return rest;
        }) as ChunkCacheInfo[],
    );
    return storage;
  }

  async createCache(id?: FileID): Promise<ChunkCache> {
    const cacheId = id ?? v4();
    const cache = await this.loadCache(cacheId);
    this.addCache(cacheId, cache);
    return cache;
  }
}

export const cacheManager = new FileCacheFactory();

cacheManager.initialize();
