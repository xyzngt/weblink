import { waitBufferedAmountLowThreshold } from "./utils/channel";
import {
  FileMetaData,
  ChunkMetaData,
  getTotalChunkCount,
} from "../cache";

import { ChunkCache } from "../cache/chunk-cache";
import {
  EventHandler,
  MultiEventEmitter,
} from "../utils/event-emitter";
import {
  ChunkRange,
  getLastIndex,
  getRangesLength,
  getSubRanges,
  mergeRanges,
  rangesIterator,
} from "../utils/range";
import { RequestFileMessage } from "./messge";
import {
  blobToArrayBuffer,
  buildPacket,
  readPacket,
} from "./utils/packet";

import CompressWorker from "@/libs/workers/chunk-compress?worker";
import UncompressWorker from "@/libs/workers/chunk-uncompress?worker";
import { CompressionLevel } from "@/options";
import { catchErrorAsync } from "../catch";

export enum TransferMode {
  Send = 1,
  Receive = 2,
}

export interface BaseTransferMessage {
  type: string;
}

export interface HeadMessage
  extends BaseTransferMessage,
    ChunkMetaData {
  type: "head";
}
export interface RequestContentMessage
  extends BaseTransferMessage {
  type: "request-content";
  ranges: ChunkRange[];
}
export interface RequestHeadMessage
  extends BaseTransferMessage {
  type: "request-head";
}

export interface CompleteMessage
  extends BaseTransferMessage {
  type: "complete";
}

export type TransferMessage =
  | RequestContentMessage
  | RequestHeadMessage
  | HeadMessage
  | CompleteMessage;

interface ReceiveData {
  receiveBytes: number;
  indexes: Set<number>;
}

interface SendData {
  indexes: Set<number>;
}

export const TRANSFER_CHANNEL_PREFIX = "file-";

interface FileTransfererOptions {
  cache: ChunkCache;
  info?: FileMetaData;
  blockSize?: number;
  bufferedAmountLowThreshold?: number;
  compressionLevel?: CompressionLevel;
  mode?: TransferMode;
}

export type ProgressValue = {
  total: number;
  received: number;
};

export type FileTransfererEventMap = {
  progress: ProgressValue;
  complete: void;
  error: Error;
  ready: void;
  close: void;
};

// export class FileSender {
//   private eventEmitter: MultiEventEmitter<FileTransmitterEventMap> =
//     new MultiEventEmitter();
//   private blockSize = 128 * 1024;
//   private bufferedAmountLowThreshold = 1024 * 1024;
//   private sendData:SendData

//   constructor() {

//   }
// }

export class FileTransferer {
  private eventEmitter: MultiEventEmitter<FileTransfererEventMap> =
    new MultiEventEmitter();

  channels: Array<RTCDataChannel> = [];
  private blockSize = 128 * 1024;
  private bufferedAmountLowThreshold = 1024 * 1024; // 1MB
  private receivedData?: ReceiveData;
  private sendData?: SendData;
  private initialized: boolean = false;
  private compressionLevel: CompressionLevel = 6;
  private isComplete: boolean = false;
  private isReady: boolean = false;

  readonly cache: ChunkCache;
  private blockCache: {
    [chunkIndex: number]: {
      blocks: {
        [blockIndex: number]: Uint8Array;
      };
      receivedBlockNumber: number;
      totalBlockNumber?: number;
    };
  } = {};

  private controller: AbortController =
    new AbortController();
  private closed: boolean = false;
  private unzipWorker?: Worker;
  private compressWorker?: Worker;
  private timer?: number;

  get id() {
    return this.cache.id;
  }

  private info: FileMetaData | null = null;

  readonly mode: TransferMode;

  constructor(options: FileTransfererOptions) {
    this.cache = options.cache;
    this.blockSize = options.blockSize ?? this.blockSize;
    this.bufferedAmountLowThreshold =
      options.bufferedAmountLowThreshold ??
      this.bufferedAmountLowThreshold;
    this.compressionLevel =
      options.compressionLevel ?? this.compressionLevel;
    this.mode = options.mode ?? TransferMode.Receive;
    this.info = options.info ?? null;

    this.addEventListener(
      "close",
      () => {
        this.closed = true;
        this.timer && window.clearInterval(this.timer);
        this.controller.abort();
      },
      {
        signal: this.controller.signal,
        once: true,
      },
    );
  }

  addEventListener<K extends keyof FileTransfererEventMap>(
    eventName: K,
    handler: EventHandler<FileTransfererEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.addEventListener(
      eventName,
      handler,
      options,
    );
  }
  removeEventListener<
    K extends keyof FileTransfererEventMap,
  >(
    eventName: K,
    handler: EventHandler<FileTransfererEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void {
    return this.eventEmitter.removeEventListener(
      eventName,
      handler,
      options,
    );
  }

  private dispatchEvent<
    K extends keyof FileTransfererEventMap,
  >(eventName: K, event: FileTransfererEventMap[K]) {
    return this.eventEmitter.dispatchEvent(
      eventName,
      event,
    );
  }

  public async setSendStatus(message: RequestFileMessage) {
    if (!this.sendData) {
      console.error(
        `can not set send status, sendData is null`,
      );
      return;
    }
    const info = this.info;
    if (!info) {
      console.error(
        `can not set send status, info is null`,
      );
      return;
    }
    const chunkLength = getTotalChunkCount(info);
    if (message.ranges) {
      rangesIterator(
        getSubRanges(chunkLength, message.ranges),
      ).forEach((index) =>
        this.sendData?.indexes.add(index),
      );
    }

    this.updateProgress();
  }

  private updateProgress() {
    const info = this.info;
    if (!info) {
      return;
    }
    if (this.mode === TransferMode.Receive) {
      if (!this.receivedData) {
        console.error(
          `can not update progress, receivedData is null`,
        );
        return;
      }
      this.dispatchEvent("progress", {
        total: info.fileSize,
        received: this.receivedData.receiveBytes,
      });
    } else if (this.mode === TransferMode.Send) {
      if (!this.sendData) {
        console.error(
          `can not update progress, sendData is null`,
        );
        return;
      }
      let sendIndexes: number[];

      try {
        sendIndexes = this.sendData.indexes
          .values()
          .toArray();
      } catch (err) {
        sendIndexes = Array.from(this.sendData.indexes);
      }

      const ranges = mergeRanges(sendIndexes);

      this.dispatchEvent("progress", {
        total: info.fileSize,
        received: getRequestContentSize(info, ranges),
      });
    }
  }

  public async initialize() {
    if (this.initialized) {
      console.warn(
        `transfer ${this.cache.id} is already initialized`,
      );
    }
    this.initialized = true;

    if (!this.info) {
      this.info = await this.cache.getInfo();
    } else {
      this.cache.setInfo(this.info);
    }

    if (!this.info) {
      throw Error(
        "transfer file info is not set correctly",
      );
    }

    if (this.mode === TransferMode.Receive) {
      const uncompressWorker = new UncompressWorker();

      uncompressWorker.onmessage = (ev) => {
        const { data, error, context } = ev.data;
        if (error) {
          console.error(error);
          return;
        }
        const chunkIndex = context?.chunkIndex;
        if (chunkIndex === undefined) {
          console.error(
            `can not store chunk, chunkIndex is undefined`,
          );
          return;
        }
        this.storeChunk(chunkIndex, data.buffer);
      };

      this.unzipWorker = uncompressWorker;

      const receivedData = {
        receiveBytes: 0,
        indexes: new Set(),
      } satisfies ReceiveData;
      this.receivedData = receivedData;
      const keys = await this.cache.getCachedKeys();
      keys.forEach((key) => receivedData.indexes.add(key));

      receivedData.receiveBytes =
        (await this.cache.calcCachedBytes()) ?? 0;
    } else if (this.mode === TransferMode.Send) {
      this.sendData = {
        indexes: new Set(),
      };
    }
    this.updateProgress();
    if (this.channels.length > 0) {
      this.dispatchEvent("ready", undefined);
    }
  }

  private async storeChunk(
    chunkIndex: number,
    chunkData: ArrayBufferLike,
  ) {
    const info = this.info;
    if (!info) {
      console.error(`can not store chunk, info is null`);

      return;
    }
    await this.cache.storeChunk(chunkIndex, chunkData);
    const receivedData = this.receivedData;
    if (!receivedData) {
      console.error(
        `can not store chunk, receivedData is null`,
      );
      return;
    }
    if (receivedData.indexes.has(chunkIndex)) {
      return;
    }
    receivedData.indexes.add(chunkIndex);
    receivedData.receiveBytes += chunkData.byteLength;
    this.updateProgress();

    if (this.triggerReceiveComplete()) {
      window.clearInterval(this.timer);
    }
    delete this.blockCache[chunkIndex];
  }

  public addChannel(channel: RTCDataChannel) {
    const onClose = () => {
      channel.onmessage = null;
      const index = this.channels.findIndex(
        (c) => c.label === channel.label,
      );
      if (index !== -1) {
        this.channels.splice(index, 1);
      }
      if (!this.isComplete && this.channels.length === 0) {
        this.dispatchEvent(
          "error",
          Error(`connection is closed`),
        );
      }
    };
    channel.addEventListener("close", onClose, {
      signal: this.controller.signal,
      once: true,
    });

    channel.addEventListener("error", onClose, {
      signal: this.controller.signal,
      once: true,
    });

    channel.onmessage = (ev) =>
      this.handleReceiveMessage(ev.data);
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold =
      this.bufferedAmountLowThreshold;

    if (this.channels.length === 0) {
      if (channel.readyState === "open") {
        this.dispatchEvent("ready", undefined);
        this.isReady = true;
      } else {
        const controller = new AbortController();
        channel.addEventListener(
          "open",
          () => {
            controller.abort();
            this.dispatchEvent("ready", undefined);
            this.isReady = true;
          },
          {
            signal: controller.signal,
            once: true,
          },
        );
        channel.addEventListener(
          "close",
          () => {
            controller.abort();
            this.dispatchEvent(
              "error",
              new Error("connection is closed"),
            );
          },
          {
            signal: controller.signal,
            once: true,
          },
        );
      }
    }
    this.channels.push(channel);
  }

  private unzip(packet: ArrayBuffer) {
    if (!this.unzipWorker) {
      throw new Error("unzip worker is not initialized");
    }
    const {
      chunkIndex,
      blockIndex,
      blockData,
      isLastBlock,
    } = readPacket(packet);

    if (!this.blockCache[chunkIndex]) {
      this.blockCache[chunkIndex] = {
        blocks: {},
        receivedBlockNumber: 0,
      };
    }

    const chunkInfo = this.blockCache[chunkIndex];

    chunkInfo.blocks[blockIndex] = blockData;
    chunkInfo.receivedBlockNumber += 1;

    if (isLastBlock) {
      chunkInfo.totalBlockNumber = blockIndex + 1;
    }
    if (
      chunkInfo.receivedBlockNumber ===
      chunkInfo.totalBlockNumber
    ) {
      const compressedData = assembleCompressedChunk(
        chunkInfo.blocks,
        chunkInfo.totalBlockNumber,
      );

      this.unzipWorker.postMessage({
        data: compressedData,
        context: {
          chunkIndex,
        },
      });
    }
  }

  private async startChecking(interval: number = 5000) {
    const checking = async () => {
      if (!this.receivedData) {
        return;
      }
      const done = await this.cache.isTransferComplete();

      if (!done) {
        const ranges = await this.cache.getReqRanges();
        console.log(`send request-content ranges`, ranges);

        if (ranges) {
          const msg = {
            type: "request-content",
            ranges: ranges,
          } satisfies RequestContentMessage;
          const [error, channel] = await catchErrorAsync(
            this.getAnyAvailableChannel(),
          );
          if (error) {
            if (this.closed) return;
            throw error;
          }
          channel.send(JSON.stringify(msg));
          console.log(`send msg`, msg);
        }
      }
      if (this.triggerReceiveComplete()) {
        window.clearInterval(this.timer);
      }
    };
    window.clearInterval(this.timer);
    this.timer = window.setInterval(checking, interval);
  }

  private triggerReceiveComplete() {
    if (this.mode === TransferMode.Send) return false;
    if (!this.receivedData) return false;

    const info = this.info;
    if (!info) return false;

    const chunkslength = getTotalChunkCount(info);

    const complete =
      this.receivedData.indexes.size === chunkslength;
    if (complete) {
      if (this.isComplete) return false;
      console.log(`trigger receive complete`);
      this.isComplete = true;

      this.getAnyAvailableChannel()
        .then((channel) => {
          channel.send(
            JSON.stringify({
              type: "complete",
            } satisfies CompleteMessage),
          );
          return waitBufferedAmountLowThreshold(channel, 0);
        })
        .then(() => {
          this.dispatchEvent("complete", undefined);
        })
        .catch((err) => {
          this.dispatchEvent("error", err);
          this.close();
        });
    }
    return complete;
  }

  // wait all channels bufferedAmountLowThreshold
  private async waitBufferedAmountLowThreshold(
    bufferedAmountLowThreshold: number = 0,
  ) {
    return Promise.all(
      this.channels.map((channel) =>
        waitBufferedAmountLowThreshold(
          channel,
          bufferedAmountLowThreshold,
        ),
      ),
    );
  }

  // select a available dataChannel
  private async getAnyAvailableChannel(
    bufferedAmountLowThreshold: number = this
      .bufferedAmountLowThreshold,
  ): Promise<RTCDataChannel> {
    if (this.channels.length === 0) {
      throw new Error("no channel");
    }
    const [error, channel] = await catchErrorAsync(
      Promise.any(
        this.channels.map((channel) =>
          waitBufferedAmountLowThreshold(
            channel,
            bufferedAmountLowThreshold,
          ),
        ),
      ).catch(() => {
        throw new Error(
          "Can not get any available channel",
        );
      }),
    );
    if (error) {
      this.dispatchEvent("error", error);
      throw error;
    }
    return channel;
  }

  public async sendFile(
    ranges?: ChunkRange[],
  ): Promise<void> {
    if (this.closed) {
      throw new Error("transferer is closed");
    }
    if (this.mode !== TransferMode.Send) {
      throw new Error("transferer is not in send mode");
    }

    const sendData = this.sendData;

    if (!sendData) {
      throw new Error(
        "file transferer is not initialized, can not send file",
      );
    }

    const info = this.info;
    if (!info) {
      throw new Error(
        "cache data is incomplete, can not send file",
      );
    }

    const totalChunks = getTotalChunkCount(info);

    let transferRange = ranges;
    console.log(`sended ranges`, transferRange);
    if (!transferRange) {
      if (totalChunks !== 0) {
        transferRange = [[0, totalChunks - 1]];
      } else {
        transferRange = [];
      }
    }
    console.log(
      `staring to send ${info.fileName}, size: ${info.fileSize}, range:`,
      transferRange,
    );

    const spliteToBlock = async (
      chunkIndex: number,
      compressedChunk: Uint8Array,
    ) => {
      const totalBlocks = Math.ceil(
        compressedChunk.byteLength / this.blockSize,
      );

      for (
        let blockIndex = 0;
        blockIndex < totalBlocks;
        blockIndex++
      ) {
        const offset = blockIndex * this.blockSize;
        const isLastBlock = blockIndex === totalBlocks - 1;
        const end = Math.min(
          offset + this.blockSize,
          compressedChunk.byteLength,
        );
        const blockData = compressedChunk.slice(
          offset,
          end,
        );

        const packet = buildPacket(
          chunkIndex,
          blockIndex,
          isLastBlock,
          blockData.buffer,
        );

        const [error, channel] = await catchErrorAsync(
          this.getAnyAvailableChannel(),
        );
        if (error) {
          return this.close();
        }

        channel.send(packet);
      }

      this.sendData?.indexes.add(chunkIndex);

      this.updateProgress();
    };
    let queue = Promise.resolve();
    function enqueueTask(task: () => Promise<void>) {
      queue = queue.then(() => task());
    }

    const compressWorker = new CompressWorker();

    compressWorker.onmessage = (ev) => {
      const { data, error, context } = ev.data;
      if (error) {
        console.error(error);
        return;
      }
      const chunkIndex = context?.chunkIndex;
      if (chunkIndex === undefined) {
        console.error(
          `can not store chunk, chunkIndex is null`,
        );
        return;
      }
      enqueueTask(() => spliteToBlock(chunkIndex, data));
    };

    this.compressWorker = compressWorker;

    for (const chunkIndex of rangesIterator(
      transferRange,
    )) {
      const chunk = await this.cache.getChunk(chunkIndex);
      if (chunk) {
        compressWorker.postMessage({
          data: new Uint8Array(chunk),
          option: {
            level: this.compressionLevel,
          },
          context: {
            chunkIndex,
          },
        });

        // spliteToBlock(
        //   chunkIndex,
        //   deflateSync(new Uint8Array(chunk), {
        //     level: this.compressionLevel,
        //   }),
        // );
      } else {
        console.warn(`can not get chunk ${chunkIndex}`);
      }
    }
    await queue;
    await this.waitBufferedAmountLowThreshold(0);
    const [error, channel] = await catchErrorAsync(
      this.getAnyAvailableChannel(),
    );
    if (error) {
      return this.close();
    }
    channel.send(
      JSON.stringify({
        type: "complete",
      } satisfies CompleteMessage),
    );
    this.isComplete = true;
  }

  // handle receive message
  handleReceiveMessage(data: any) {
    try {
      // this.setStatus(TransferStatus.Process);

      if (this.mode === TransferMode.Receive) {
        if (typeof data === "string") {
          console.log(`receiver get message`, data);
          const message = JSON.parse(
            data,
          ) as TransferMessage;
          if (message.type === "complete") {
            if (this.triggerReceiveComplete()) {
              window.clearInterval(this.timer);
            }
          }
        } else {
          const info = this.info;
          if (!info) return;
          let packet: ArrayBuffer | Blob = data;

          if (packet instanceof ArrayBuffer) {
            this.unzip(packet);
          } else if (packet instanceof Blob) {
            blobToArrayBuffer(packet).then((packet) =>
              this.unzip(packet),
            );
          }
        }
        this.startChecking(10000);
      } else if (this.mode === TransferMode.Send) {
        console.log(`sender get message`, data);
        if (typeof data !== "string") return;
        const message = JSON.parse(data) as TransferMessage;

        if (message.type === "request-content") {
          if (this.sendData) {
            rangesIterator(message.ranges).forEach(
              (index) =>
                this.sendData?.indexes.delete(index),
            );

            this.updateProgress();
          }
          this.sendFile(message.ranges);
        } else if (message.type === "complete") {
          this.isComplete = true;
          this.dispatchEvent("complete", undefined);
        }
      }
    } catch (error) {
      if (error instanceof Error)
        this.dispatchEvent("error", error as Error);
      console.error(error);
    }
  }

  public close() {
    if (this.closed) return;
    this.dispatchEvent("close", undefined);
    this.unzipWorker?.terminate();
    this.compressWorker?.terminate();
    this.channels.forEach((channel) => channel.close());
  }
}

function assembleCompressedChunk(
  blocks: { [blockNumber: number]: Uint8Array },
  totalBlocks: number,
): Uint8Array {
  const orderedBlocks = [];

  for (let i = 0; i < totalBlocks; i++) {
    if (blocks[i]) {
      orderedBlocks.push(blocks[i]);
    } else {
      throw new Error(`Missing block ${i} in chunk`);
    }
  }

  // merge all blocks
  return concatenateUint8Arrays(orderedBlocks);
}

function concatenateUint8Arrays(
  arrays: Uint8Array[],
): Uint8Array {
  let totalLength = 0;
  arrays.forEach((arr) => (totalLength += arr.length));

  const result = new Uint8Array(totalLength);
  let offset = 0;
  arrays.forEach((arr) => {
    result.set(arr, offset);
    offset += arr.length;
  });

  return result;
}

function getRequestContentSize(
  info: FileMetaData,
  ranges: ChunkRange[],
) {
  if (!info.chunkSize) {
    throw new Error("chunkSize is not found");
  }
  let requestBytes =
    getRangesLength(ranges) * info.chunkSize;
  const lastRangeIndex = getLastIndex(ranges);
  const lastChunkIndex = getTotalChunkCount(info) - 1;
  if (lastRangeIndex === lastChunkIndex) {
    requestBytes =
      requestBytes -
      info.chunkSize +
      (info.fileSize % info.chunkSize);
  }
  return requestBytes;
}
