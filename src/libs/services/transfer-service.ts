import {
  createStore,
  SetStoreFunction,
} from "solid-js/store";
import {
  FileTransferer,
  TransferMode,
} from "../core/file-transferer";
import { FileID } from "../core/type";
import { ChunkCache } from "../cache/chunk-cache";
import { waitBufferedAmountLowThreshold } from "../core/utils/channel";
import { appOptions } from "@/options";
import { FileMetaData } from "../cache";

class TransfererFactory {
  readonly transferers: Record<FileID, FileTransferer>;
  private setTransferers: SetStoreFunction<
    Record<FileID, FileTransferer>
  >;
  private channels: Record<FileID, RTCDataChannel[]> = {};
  constructor() {
    const [transferers, setTransferers] =
      createStore<Record<FileID, FileTransferer>>();
    this.transferers = transferers;
    this.setTransferers = setTransferers;
  }

  getTransferer(id: FileID) {
    if (this.transferers[id]) {
      return this.transferers[id];
    }

    return null;
  }

  addChannel(fileId: FileID, channel: RTCDataChannel) {
    const transfer = this.transferers[fileId];
    if (transfer) {
      transfer.addChannel(channel);
    } else {
      this.channels[fileId] ??= [];
      this.channels[fileId].push(channel);
    }
  }

  destroyTransfer(id: FileID) {
    const transferer = this.transferers[id];
    if (!transferer) {
      console.log(`transferer ${id} not exist`);
      return;
    }

    transferer.close();
    this.setTransferers(id, undefined!);
  }

  createTransfer(
    cache: ChunkCache,
    mode: TransferMode = TransferMode.Receive,
    info?: FileMetaData,
  ) {
    const fileId = cache.id;
    const tf = this.getTransferer(fileId);
    if (tf) {
      this.destroyTransfer(tf.id);
    }
    const transferer = new FileTransferer({
      cache,
      info,
      bufferedAmountLowThreshold:
        appOptions.bufferedAmountLowThreshold,
      blockSize: appOptions.blockSize,
      compressionLevel: appOptions.compressionLevel,
      mode: mode,
    });

    const flushInterval = setInterval(() => {
      cache.flush();
    }, 1000);

    const controller = new AbortController();

    transferer.addEventListener(
      "complete",
      async () => {
        clearInterval(flushInterval);
        if (transferer.mode === TransferMode.Receive) {
          await cache.flush();
          cache.getFile();
        } else {
          if (appOptions.automaticCacheDeletion)
            cache.cleanup();
        }
        this.destroyTransfer(transferer.id);

        controller.abort();
      },
      { once: true, signal: controller.signal },
    );

    transferer.addEventListener(
      "error",
      async (event) => {
        console.error(event.detail);
        clearInterval(flushInterval);
        this.destroyTransfer(transferer.id);
        if (transferer.mode === TransferMode.Receive) {
          cache.flush();
        }
      },
      {
        once: true,
        signal: controller.signal,
      },
    );

    transferer.addEventListener(
      "close",
      () => {
        controller.abort();
        clearInterval(flushInterval);
        for (const channel of transferer.channels) {
          waitBufferedAmountLowThreshold(channel, 0).then(
            () => channel.close(),
          );
        }
      },
      {
        once: true,
        signal: controller.signal,
      },
    );

    transferer.addEventListener(
      "ready",
      () => {
        const channels = this.channels[fileId];
        if (channels) {
          for (const channel of channels) {
            transferer.addChannel(channel);
          }
          this.channels[fileId] = [];
        }
      },
      {
        once: true,
        signal: controller.signal,
      },
    );

    this.setTransferers(fileId, transferer);
    return transferer;
  }
}

export const transferManager = new TransfererFactory();
