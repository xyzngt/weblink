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
  rangesIterator,
} from "../utils/range";
import { Accessor, createSignal, Setter } from "solid-js";
import { RequestFileMessage } from "./messge";
import {
  blobToArrayBuffer,
  buildPacket,
  readPacket,
} from "./utils/packet";

import CompressWorker from "@/libs/workers/chunk-compress?worker";
import UncompressWorker from "@/libs/workers/chunk-uncompress?worker";

import { CompressionLevel } from "@/options";

export enum TransferMode {
  Send = 1,
  Receive = 2,
}

export enum TransferStatus {
  New = 1,
  Ready = 2,
  Process = 3,
  Complete = 4,
  Error = 5,
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

export interface ReadyMessage extends BaseTransferMessage {
  type: "ready";
}

export type TransferMessage =
  | RequestContentMessage
  | RequestHeadMessage
  | HeadMessage
  | CompleteMessage
  | ReadyMessage;

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

  readonly cache: ChunkCache;
  readonly status: Accessor<TransferStatus>;
  private setStatus: Setter<TransferStatus>;
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

  private timer?: number;

  get id() {
    return this.cache.id;
  }

  private info: FileMetaData | null = null;

  readonly mode: TransferMode;

  constructor(options: FileTransfererOptions) {
    const [status, setStatus] =
      createSignal<TransferStatus>(TransferStatus.New);
    this.status = status;
    this.setStatus = setStatus;
    this.cache = options.cache;
    this.blockSize = options.blockSize ?? this.blockSize;
    this.bufferedAmountLowThreshold =
      options.bufferedAmountLowThreshold ??
      this.bufferedAmountLowThreshold;
    this.compressionLevel =
      options.compressionLevel ?? this.compressionLevel;
    this.mode = options.mode ?? TransferMode.Receive;
    this.info = options.info ?? null;
    this.controller.signal.addEventListener(
      "abort",
      () => {
        this.dispatchEvent("close", undefined);
      },
      { once: true },
    );
  }

  public async setSendStatus(message: RequestFileMessage) {
    if (!this.sendData) return;
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
      if (!this.receivedData) return;
      this.dispatchEvent("progress", {
        total: info.fileSize,
        received: this.receivedData.receiveBytes,
      });
    } else {
      if (!this.sendData) return;
      this.dispatchEvent("progress", {
        total: info.fileSize,
        received: getRequestContentSize(
          info,
          this.sendData.indexes.values().toArray(),
        ),
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
      const receivedData = {
        receiveBytes: 0,
        indexes: new Set(),
      } satisfies ReceiveData;
      this.receivedData = receivedData;
      const keys = await this.cache.getCachedKeys();
      keys.forEach((key) => receivedData.indexes.add(key));

      const bytes = await this.cache.calcCachedBytes();
      receivedData.receiveBytes += bytes ?? 0;
    } else if (this.mode === TransferMode.Send) {
      this.sendData = {
        indexes: new Set(),
      };
    }
    this.updateProgress();
    this.dispatchEvent("ready", undefined);
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

  public addChannel(channel: RTCDataChannel) {
    console.log(`receiver add channel`, channel);

    const onClose = () => {
      channel.onmessage = null;
      const index = this.channels.findIndex(
        (c) => c.label === channel.label,
      );
      if (index !== -1) {
        this.channels.splice(index, 1);
      }
      if (
        this.status() !== TransferStatus.Complete &&
        this.channels.length === 0
      ) {
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

    const storeChunk = async (
      chunkIndex: number,
      chunkData: ArrayBufferLike,
    ) => {
      const info = this.info;
      if (!info) {
        console.error(`can not store chunk, info is null`);

        return;
      }
      await this.cache.storeChunk(chunkIndex, chunkData);
      this.receivedData?.indexes.add(chunkIndex);
      if (this.receivedData) {
        this.receivedData.receiveBytes +=
          chunkData.byteLength;
      }

      this.updateProgress();

      if (this.triggerReceiveComplete()) {
        window.clearInterval(this.timer);
      }
      delete this.blockCache[chunkIndex];
    };

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
      storeChunk(chunkIndex, data.buffer);
    };

    channel.onmessage = (ev) =>
      this.handleMessage(ev, (packet) => {
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

          uncompressWorker.postMessage({
            data: compressedData,
            context: {
              chunkIndex,
            },
          });

          // storeChunk(
          //   chunkIndex,
          //   inflateSync(compressedData),
          // );
        }
      });
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold =
      this.bufferedAmountLowThreshold;

    if (this.mode === TransferMode.Receive) {
      if (channel.readyState === "open") {
        this.dispatchEvent("ready", undefined);
        this.setStatus(TransferStatus.Ready);
      } else {
        channel.addEventListener(
          "open",
          () => {
            this.dispatchEvent("ready", undefined);
            this.setStatus(TransferStatus.Ready);
          },
          {
            signal: this.controller.signal,
            once: true,
          },
        );
        channel.addEventListener("close", (err) => {}, {
          signal: this.controller.signal,
          once: true,
        });
      }
    }

    this.channels.push(channel);
  }

  private async startChecking(interval: number = 5000) {
    const checking = async () => {
      if (!this.receivedData) {
        return;
      }
      const done = await this.cache.isComplete();

      if (!done) {
        const ranges = await this.cache.getReqRanges();
        console.log(`send request-content ranges`, ranges);

        if (ranges) {
          const msg = {
            type: "request-content",
            ranges: ranges,
          } satisfies RequestContentMessage;
          const channel =
            await this.getRandomAvailableChannel();
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
      if (this.status() === TransferStatus.Complete)
        return false;
      console.log(`trigger receive complete`);
      this.setStatus(TransferStatus.Complete);
      this.getRandomAvailableChannel()
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

  // random select a available dataChannel
  private async getRandomAvailableChannel(
    bufferedAmountLowThreshold: number = this
      .bufferedAmountLowThreshold,
  ): Promise<RTCDataChannel> {
    if (this.channels.length === 0) {
      throw new Error("no channel");
    }
    const channel = await Promise.any(
      this.channels.map((channel) => {
        channel.bufferedAmountLowThreshold =
          bufferedAmountLowThreshold;
        return new Promise<RTCDataChannel>(
          async (reslove) => {
            if (
              channel.bufferedAmount <=
              channel.bufferedAmountLowThreshold
            ) {
              return reslove(channel);
            }
            channel.addEventListener(
              "bufferedamountlow",
              () => reslove(channel),
              {
                once: true,
                signal: this.controller.signal,
              },
            );
          },
        );
      }),
    ).catch((err) => {
      console.error(err);
      throw err;
    });
    return channel;
  }

  public async sendFile(
    ranges?: ChunkRange[],
  ): Promise<void> {
    if (this.mode !== TransferMode.Send) {
      this.dispatchEvent(
        "error",
        new Error("transferer is not in send mode"),
      );
      return;
    }

    if (!this.sendData) {
      this.dispatchEvent(
        "error",
        new Error(
          "file transferer is not initialized, can not send file",
        ),
      );
      return;
    }

    const info = this.info;
    if (!info) {
      this.dispatchEvent(
        "error",
        new Error(
          "cache data is incomplete, can not send file",
        ),
      );

      return;
    }

    const totalChunks = getTotalChunkCount(info);

    let transferRange = ranges;
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

    this.setStatus(TransferStatus.Process);

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

        const channel =
          await this.getRandomAvailableChannel();

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
    const channel = await this.getRandomAvailableChannel();
    channel.send(
      JSON.stringify({
        type: "complete",
      } satisfies CompleteMessage),
    );
    this.setStatus(TransferStatus.Complete);
  }

  // handle receive message
  private handleMessage(
    event: MessageEvent,
    unzipCB: (packet: ArrayBuffer) => void,
  ) {
    // if (this.readyInterval) {
    //   clearInterval(this.readyInterval);
    //   this.readyInterval = undefined;
    // }
    try {
      this.setStatus(TransferStatus.Process);

      if (this.mode === TransferMode.Receive) {
        if (typeof event.data === "string") {
          console.log(`receiver get message`, event.data);
          const message = JSON.parse(
            event.data,
          ) as TransferMessage;
          if (message.type === "complete") {
            if (this.triggerReceiveComplete()) {
              window.clearInterval(this.timer);
            }
          }
        } else {
          const info = this.info;
          if (!info) return;
          let packet: ArrayBuffer | Blob = event.data;

          if (packet instanceof ArrayBuffer) {
            unzipCB(packet);
          } else if (packet instanceof Blob) {
            blobToArrayBuffer(packet).then((packet) =>
              unzipCB(packet),
            );
          }
        }
        this.startChecking(10000);
      } else if (this.mode === TransferMode.Send) {
        console.log(`sender get message`, event.data);
        if (typeof event.data !== "string") return;
        const message = JSON.parse(
          event.data,
        ) as TransferMessage;

        if (message.type === "request-content") {
          if (this.status() !== TransferStatus.Process) {
            if (this.sendData) {
              rangesIterator(message.ranges).forEach(
                (index) =>
                  this.sendData?.indexes.delete(index),
              );

              this.updateProgress();
            }
            this.sendFile(message.ranges);
          } else {
            console.log(
              "send not complete, ignore request-content message",
            );
          }
        } else if (message.type === "complete") {
          this.setStatus(TransferStatus.Complete);
          this.dispatchEvent("complete", undefined);
        } else if (message.type === "ready") {
          // this.ready?.resolve();
          this.dispatchEvent("ready", undefined);
        }
      }
    } catch (error) {
      if (error instanceof Error)
        this.dispatchEvent("error", error as Error);
      console.error(error);
    }
  }

  public destroy() {
    this.controller.abort();
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
