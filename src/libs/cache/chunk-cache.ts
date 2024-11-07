import {
  EventHandler,
  MultiEventEmitter,
} from "../utils/event-emitter";
import { formatBtyeSize } from "../utils/format-filesize";
import { ChunkRange, getSubRanges } from "../utils/range";
import MergeChunkWorker from "@/libs/workers/merge-chunk?worker";
import {
  ChunkCacheEventMap,
  ChunkMetaData,
  DBNAME_PREFIX,
  FileMetaData,
  getTotalChunkCount,
} from ".";
import { Accessor, createSignal, Setter } from "solid-js";

export interface ChunkCache {
  addEventListener<K extends keyof ChunkCacheEventMap>(
    eventName: K,
    handler: EventHandler<ChunkCacheEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ChunkCacheEventMap>(
    eventName: K,
    handler: EventHandler<ChunkCacheEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;

  readonly id: string;
  readonly status: Accessor<
    "writing" | "merging" | "done" | "error"
  >;
  initialize(): Promise<void>;
  storeChunk(
    chunckIndex: number,
    data: ArrayBufferLike,
  ): Promise<void>;
  setInfo(data: Omit<FileMetaData, "id">): Promise<void>;
  getInfo(): Promise<FileMetaData | null>;
  getChunk(chunkIndex: number): Promise<ArrayBuffer | null>;
  getChunkCount(): Promise<number>;
  getReqRanges(): Promise<ChunkRange[] | null>;
  getFile(): Promise<File | null>;
  flush(): Promise<void>;
  cleanup(): Promise<void>;
  calcCachedBytes(): Promise<number | null>;
  getCachedKeys(): Promise<number[]>;
  isComplete(): Promise<boolean>;
  getStorage(): Promise<ChunkMetaData | null>;
  isTransferComplete(): Promise<boolean>;
}

export interface IDBChunkCacheOptions {
  id: string;
  maxMomeryCacheSize: number;
}

export class IDBChunkCache implements ChunkCache {
  private db: IDBDatabase | null = null;
  status: Accessor<
    "writing" | "merging" | "done" | "error"
  >;
  private setStatus: Setter<
    "writing" | "merging" | "done" | "error"
  >;
  private eventEmitter =
    new MultiEventEmitter<ChunkCacheEventMap>();
  public readonly id: string;

  // memory cache
  private memoryCache: Array<[number, ArrayBufferLike]> =
    [];

  private maxMomeryCacheSize: number;
  constructor(options: IDBChunkCacheOptions) {
    this.id = options.id;
    this.maxMomeryCacheSize = options.maxMomeryCacheSize;
    const [status, setStatus] = createSignal<
      "writing" | "merging" | "done" | "error"
    >("writing");
    this.status = status;
    this.setStatus = setStatus;
  }

  async initialize() {
    if (this.db) {
      console.warn(`db has already initialized`);
      return;
    }
    this.db = await this.initDB();
    const info = await this.getInfo();
    if (info) {
      this.dispatchEvent("update", info);
    }
    await this.isEmpty();
    const done = await this.isComplete();

    if (done) {
      if (info?.file) {
        this.setStatus("done");
      }
    }
  }

  addEventListener<K extends keyof ChunkCacheEventMap>(
    eventName: K,
    handler: EventHandler<ChunkCacheEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.addEventListener(
      eventName,
      handler,
      options,
    );
  }

  removeEventListener<K extends keyof ChunkCacheEventMap>(
    eventName: K,
    handler: EventHandler<ChunkCacheEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void {
    return this.eventEmitter.removeEventListener(
      eventName,
      handler,
      options,
    );
  }

  private dispatchEvent<K extends keyof ChunkCacheEventMap>(
    eventName: K,
    event: ChunkCacheEventMap[K],
  ) {
    return this.eventEmitter.dispatchEvent(
      eventName,
      event,
    );
  }

  async calcCachedBytes() {
    const info = await this.getInfo();
    if (!info) {
      return null;
    }
    if (!info.chunkSize) {
      return null;
    }
    const totalLength = getTotalChunkCount(info);

    const hasLast = async () => {
      const lastKey = totalLength - 1;
      const store = await this.getChunkStore();
      const request = store.getKey(lastKey);
      return new Promise<boolean>((reslove, reject) => {
        request.onsuccess = () => {
          reslove(request.result !== undefined);
        };
        request.onerror = () => reject(request.error);
      });
    };

    const count = await this.getChunkCount();

    let bytes = count * info.chunkSize;

    if (await hasLast()) {
      const remainSize = info.fileSize % info.chunkSize;
      bytes = bytes - info.chunkSize + remainSize;
    }
    return bytes;
  }

  async getCachedKeys() {
    const store = await this.getChunkStore();
    const request = store.getAllKeys();
    const keys = await new Promise<Array<number>>(
      (reslove, reject) => {
        request.onsuccess = () =>
          reslove(request.result as number[]);
        request.onerror = () => reject(request.error);
      },
    );
    return keys;
  }

  async getReqRanges(): Promise<ChunkRange[] | null> {
    const info = await this.getInfo();
    if (!info) {
      return null;
    }

    if (!info.chunkSize) {
      return null;
    }

    const totalLength = Math.ceil(
      info.fileSize / info.chunkSize,
    );

    const ranges = getSubRanges(
      totalLength,
      await this.getCachedKeys(),
    );

    return ranges;
  }

  private async initDB() {
    return await new Promise<IDBDatabase>(
      (resolve, reject) => {
        const request = indexedDB.open(
          `${DBNAME_PREFIX}${this.id}`,
        );

        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("info", {
            keyPath: "id",
          });
          db.createObjectStore("chunks", {
            keyPath: "chunkIndex",
          });
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
  }

  async isEmpty() {
    const info = await this.getInfo();
    const count = await this.getChunkCount();
    let empty = true;
    if (!info && count === 0) {
      empty = false;
    }

    return empty;
  }

  async isComplete() {
    let done = false;
    const info = await this.getInfo();
    if (info) {
      done = !!info.file;
    }
    return done;
  }

  async isTransferComplete() {
    if (await this.isComplete()) {
      return true;
    }
    const info = (await this.getInfo())!;

    const count = await this.getChunkCount();
    const total = getTotalChunkCount(info);

    console.log(
      `check file ${info.fileName} total:${total} count:${count}`,
    );

    if (total === count) {
      return true;
    }

    return false;
  }

  private async getChunkStore(mode?: IDBTransactionMode) {
    const db = this.db;
    if (!db) {
      throw new Error("db is not initialized");
    }
    const transaction = db.transaction("chunks", mode);

    const store = transaction.objectStore("chunks");

    return store;
  }

  private async getInfoStore(mode?: IDBTransactionMode) {
    const db = this.db;
    if (!db) {
      throw new Error("db is not initialized");
    }
    const transaction = db.transaction("info", mode);
    const store = transaction.objectStore("info");
    return store;
  }

  public async setInfo(data: FileMetaData): Promise<void> {
    const setData = {
      ...data,
      id: this.id,
    };
    const store = await this.getInfoStore("readwrite");
    const request = store.put(setData);
    return new Promise(async (resolve, reject) => {
      request.onsuccess = () => {
        resolve();

        this.dispatchEvent("update", setData);

        if (setData.file) {
          this.setStatus("done");
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async getStorage(): Promise<ChunkMetaData | null> {
    if (!(await this.isComplete())) {
      return null;
    }
    const info = (await this.getInfo())!;
    const { file, ...storage } = info;
    return storage;
  }

  public async getInfo(): Promise<FileMetaData | null> {
    const store = await this.getInfoStore("readonly");
    const request = store.get(this.id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const info = request.result ?? null;
        resolve(info);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // flush memory cache to db
  async flush() {
    if (this.memoryCache.length === 0) return;

    const store = await this.getChunkStore("readwrite");
    const transaction = store.transaction;

    for (
      let value = this.memoryCache.pop();
      value;
      value = this.memoryCache.pop()
    ) {
      const [chunkIndex, data] = value;
      store.put({ chunkIndex, data });
    }

    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  public async storeChunk(
    chunkIndex: number,
    data: ArrayBufferLike,
  ): Promise<void> {
    this.memoryCache.push([chunkIndex, data]);

    if (
      this.memoryCache.length >= this.maxMomeryCacheSize
    ) {
      await this.flush();
    }
  }

  public async getChunk(
    chunkIndex: number,
  ): Promise<ArrayBuffer | null> {
    await this.flush();
    const info = await this.getInfo();
    if (!info) {
      throw new Error("info is not found");
    }
    if (!info.chunkSize) {
      throw new Error("chunkSize is not found");
    }
    const file = info.file;
    if (file) {
      // Send specific data blocks
      const start = chunkIndex * info.chunkSize;
      const end = Math.min(
        start + info.chunkSize,
        file.size,
      );
      const chunk = file.slice(start, end);
      return await chunk.arrayBuffer();
    } else {
      const store = await this.getChunkStore("readonly");
      const request = store.get(chunkIndex);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve(
            request.result ? request.result.data : null,
          );
        };
        request.onerror = () => reject(request.error);
      });
    }
  }

  async getChunkCount(): Promise<number> {
    await this.flush();
    const store = await this.getChunkStore("readonly");
    const countRequest = store.count();
    return new Promise((resolve, reject) => {
      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };
      countRequest.onerror = () => {
        reject(countRequest.error);
      };
    });
  }

  public async cleanup(): Promise<void> {
    const db = this.db;
    if (!db) {
      throw new Error("db is not initialized");
    }
    const dbName = db.name;
    db.close();
    const request = indexedDB.deleteDatabase(dbName);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        console.log(
          `Database ${dbName} deleted successfully.`,
        );

        this.dispatchEvent("cleanup", undefined);
        resolve();
      };
      request.onerror = (event) => {
        console.error(
          `Failed to delete database ${dbName}.`,
          event,
        );
        reject(event);
      };
      request.onblocked = () => {
        console.warn(`Database deletion blocked.`);
        reject(new Error("Database deletion blocked."));
      };
    });
  }

  async getFile(): Promise<File | null> {
    await this.flush();

    const info = await this.getInfo();
    if (!info) {
      console.warn("info is not found");
      return null;
    }
    if (info.file) {
      return info.file;
    }
    return await this.mergeFile();
  }

  async mergeFile() {
    await this.flush();
    if (this.status() === "merging") {
      console.warn(`cache is ${this.status()} already`);
      return null;
    }

    const info = await this.getInfo();

    if (!info) {
      console.warn("info is not found");
      return null;
    }

    const isWorker =
      typeof WorkerGlobalScope !== "undefined" &&
      self instanceof WorkerGlobalScope;
    if (!isWorker) {
      // use worker to merge chunks
      const worker = new MergeChunkWorker();

      return await new Promise<File | null>(
        (resolve, reject) => {
          this.setStatus("merging");
          this.dispatchEvent("merging", undefined);
          worker.onmessage = (event) => {
            const { data, error } = event.data;
            if (error) {
              this.setStatus("error");
              console.error(error);
              reject(error);
              return;
            }

            console.log("merge file done", data);
            this.dispatchEvent("merged", data);
            info.file = data as File;
            this.setInfo(info);
            resolve(data as File);
            this.setStatus("done");
          };
          worker.postMessage({ fileId: this.id });
        },
      );
    }

    // current scope is worker
    const store = await this.getChunkStore("readwrite");
    const blobParts: BlobPart[] = [];
    const request = store.openCursor();

    const time = Date.now();
    return await new Promise<File>((reslove, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          blobParts.push(
            new Blob([cursor.value.data as ArrayBuffer]),
          );
          cursor.continue();
        } else {
          const file = new File(blobParts, info.fileName, {
            type: info.mimetype,
            lastModified: info.lastModified,
          });
          info.file = file;

          this.setInfo(info);
          store.clear();
          reslove(file);
          this.setStatus("done");
          this.dispatchEvent("merged", file);
          console.log(
            `merge file cost ${Date.now() - time}ms`,
          );
        }
      };

      request.onerror = (err) => reject(err);
    });
  }
}
