export interface ChunkMetaData {
  id: string;
  fileName: string;
  fileSize: number;
  lastModified?: number;
  mimetype?: string;
  chunkSize: number;
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
