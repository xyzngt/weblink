import { ClientID, FileID } from "@/libs/core/type";

export interface ChunkMetaData {
  id: FileID;
  fileName: string;
  fileSize: number;
  lastModified?: number;
  mimetype?: string;
  chunkSize?: number;
  from?: ClientID;
  createdAt?: number;
  file?: File;
}

export type ChunkCacheInfo = Omit<ChunkMetaData, "file">;

export type ChunkCacheEventMap = {
  cleanup: void;
  update: FileMetaData | null;
  complete: File;
  merging: void;
};

export interface FileMetaData extends ChunkMetaData {
  chunkCount?: number;
  isComplete?: boolean;
  isMerging?: boolean;
}

export const DBNAME_PREFIX: string = "file-";

export function getTotalChunkCount(info: FileMetaData) {
  if (!info.chunkSize) {
    throw new Error("chunkSize is not found");
  }
  return Math.ceil(info.fileSize / info.chunkSize);
}
