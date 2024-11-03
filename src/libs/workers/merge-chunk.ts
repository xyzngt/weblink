import type { FileID } from "@/libs/core/type";
import { IDBChunkCache } from "../cache/chunk-cache";

self.onmessage = async (
  event: MessageEvent<{ fileId: FileID }>,
) => {
  const { fileId } = event.data;
  try {
    const cache = new IDBChunkCache({
      id: fileId,
      maxMomeryCacheSize: 0,
    });
    await cache.initialize();
    const file = await cache.mergeFile();
    self.postMessage({ data: file });
  } catch (error) {
    console.error(error);
    self.postMessage({ error });
  }
};
