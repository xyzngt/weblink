import { ClientID } from "@/libs/core/type";

export interface ChunkMetaData {
  id: string;
  fileName: string;
  fileSize: number;
  lastModified?: number;
  mimetype?: string;
  chunkSize?: number;
  from?: ClientID;
}

export type ChunkCacheEventMap = {
  cleanup: void;
  update: FileMetaData | null;
  merged: File;
  merging: void;
};

export interface FileMetaData extends ChunkMetaData {
  file?: File;
  createdAt?: number;
}

export const DBNAME_PREFIX: string = "file-";

export function getTotalChunkCount(info: FileMetaData) {
  if (!info.chunkSize) {
    throw new Error("chunkSize is not found");
  }
  return Math.ceil(info.fileSize / info.chunkSize);
}
