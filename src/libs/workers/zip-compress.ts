import { zipSync } from "fflate";

self.onmessage = async (
  event: MessageEvent<{
    folderName: string;
    fileMap: Record<string, File>;
  }>,
) => {
  const { fileMap, folderName } = event.data;
  try {
    const bufferMap: Record<string, Uint8Array> = {};

    await Promise.all(
      Object.entries(fileMap).map(async ([path, file]) => {
        if (!file) {
          bufferMap[path] = null!;
          return;
        }
        const reader = new FileReader();

        const buffer = await new Promise<Uint8Array>(
          (resolve, reject) => {
            reader.readAsArrayBuffer(file);
            reader.onload = function (e) {
              const buffer = new Uint8Array(
                e.target?.result as ArrayBuffer,
              );
              if (buffer) {
                resolve(buffer);
              } else {
                reject(new Error("Failed to read file"));
              }
            };
            reader.onerror = function (e) {
              reject(e);
            };
          },
        );
        bufferMap[path] = buffer;
      }),
    );

    const zipData = zipSync(bufferMap, {});

    const zipFile = new File([zipData], `${folderName}.zip`, {
      type: "application/zip",
      lastModified: Date.now(),
    });

    self.postMessage({
      data: zipFile,
    });
  } catch (err) {
    self.postMessage({
      error: err,
    });
  }
};
