import CompressWorker from "@/libs/workers/zip-compress?worker";

export type FileWithPath = {
  file?: File;
  fullPath?: string;
};

export type FilesMap = {
  // Directory key is directory name
  directories: Record<string, FileWithPath[]>;
  // File
  files: File[];
};

export const handleSelectFolder = async (
  files: FileList,
) => {
  const fileEntries = Array.from(files).map((file) => ({
    file,
    fullPath: file.webkitRelativePath,
  }));

  const folderName = getFolderName(fileEntries);
  return processFiles(fileEntries, folderName);
};

export const handleDropItems = async (
  items: DataTransferItemList,
): Promise<File[]> => {
  const entries = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item.webkitGetAsEntry();

    if (entry) {
      entries.push(entry);
    }
  }
  if (entries.length > 0) {
    const filesMap: FilesMap = {
      directories: {},
      files: [],
    };

    await Promise.all(
      entries.map((entry) => readEntry(entry, filesMap)),
    );

    const compressedFoldersResult = await Promise.all(
      Object.entries(filesMap.directories).map(
        async ([
          folderName,
          files,
        ]): Promise<File | null> => {
          const filesResult = await processFiles(
            files,
            folderName,
          );
          return filesResult;
        },
      ),
    );

    const compressedFolders =
      compressedFoldersResult.filter(Boolean) as File[];

    const files: File[] = [
      ...filesMap.files,
      ...compressedFolders,
    ];

    return files;
  }
  return [];
};

function readEntry(
  entry: FileSystemEntry,
  map: FilesMap,
  folderName?: string,
) {
  return new Promise<void>((resolve, reject) => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      fileEntry.file(
        (f: File) => {
          if (folderName) {
            map.directories[folderName].push({
              file: f,
              fullPath: entry.fullPath.substring(1),
            });
          } else {
            map.files.push(f);
          }
          resolve();
        },
        (err) => {
          reject(err);
        },
      );
    } else if (entry.isDirectory) {
      const dirReader = (
        entry as FileSystemDirectoryEntry
      ).createReader();
      const folderName = entry.fullPath?.split("/")[1];
      if (!map.directories[folderName]) {
        map.directories[folderName] = [];
      }

      const readEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            if (folderName) {
              map.directories[folderName].push({
                fullPath: entry.fullPath.substring(1),
              });
            }
            resolve();
            return;
          }

          await Promise.all(
            entries.map((entry) =>
              readEntry(entry, map, folderName),
            ),
          );

          return readEntries();
        });
      };

      readEntries();
    }
  });
}

async function processFiles(
  files: FileWithPath[],
  folderName: string,
): Promise<File> {
  const fileMap: Record<string, File | null> = {};

  files.map((file) => {
    if (!file.file) {
      if (file.fullPath) {
        fileMap[file.fullPath] = null;
      }
      return;
    }

    const fullPath = file.fullPath ?? file.file.name;
    fileMap[fullPath] = file.file;
  });

  return await compressFiles(fileMap, folderName);
}

function getFolderName(fileEntries: FileWithPath[]) {
  if (!fileEntries.length) return Date.now().toString();
  const firstPath = fileEntries[0].fullPath;
  if (!firstPath) return Date.now().toString();
  const parts = firstPath.split("/");
  return parts.length > 1
    ? parts[0]
    : Date.now().toString();
}

async function compressFiles(
  fileMap: Record<string, File | null>,
  folderName: string,
) {
  const worker = new CompressWorker();
  return new Promise<File>((resolve, reject) => {
    worker.onmessage = (event) => {
      const result = event.data;
      if (result.error) {
        reject(result.error);
        return;
      }
      resolve(result.data);
    };
    worker.postMessage({ fileMap, folderName });
  });
}
