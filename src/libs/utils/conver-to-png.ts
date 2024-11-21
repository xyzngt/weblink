// 定义转换配置的接口
interface ConvertToPNGOptions {
  maxWidth?: number; // 最大宽度，默认1920
  quality?: number; // 压缩质量，默认0.7
  maxFileSize?: number; // 可选：最大文件大小（字节）
}

export async function convertImageToPNG(
  imageFile: File,
  options: ConvertToPNGOptions = {},
): Promise<File> {
  const {
    maxWidth = Infinity,
    quality = 0.7,
    maxFileSize = Infinity,
  } = options;

  if (imageFile.type === "image/png") {
    return imageFile;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);

    img.onload = function () {
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error(`can not get context "2d"`);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Blob creation failed"));
            return;
          }

          if (blob.size > maxFileSize) {
            reject(
              new Error(
                `File size exceeds maximum limit of ${maxFileSize} bytes`,
              ),
            );
            return;
          }

          const file = new File(
            [blob],
            imageFile.name.replace(/\.[^/.]+$/, ".png"),
            {
              type: "image/png",
              lastModified: imageFile.lastModified,
            },
          );
          resolve(file);
        },
        "image/png",
        quality,
      );

      URL.revokeObjectURL(url);
    };

    img.onerror = function () {
      reject(new Error("Image loading failed"));
    };

    img.src = url;
  });
}
