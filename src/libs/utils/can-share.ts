export function canShareFile(file: File) {
  // Check if navigator.canShare is supported
  if (!navigator.canShare) return false;

  // Maximum file size (50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

  // Comprehensive list of supported file types
  const supportedTypes = [
    // PDF
    'application/pdf',

    // Audio
    'audio/flac',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/webm',

    // Images
    'image/avif',
    'image/bmp',
    'image/gif',
    'image/x-icon',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/tiff',
    'image/webp',
    'image/x-xbitmap',

    // Text
    'text/css',
    'text/csv',
    'text/html',
    'text/plain',

    // Videos
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/webm'
  ];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    console.warn(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    return false;
  }

  // Check file type
  if (!supportedTypes.includes(file.type)) {
    console.warn(`Unsupported file type: ${file.type}`);
    return false;
  }

  // Attempt to check if the file can be shared
  try {
    const shareData: ShareData = {
      files: [file],
    };
    return navigator.canShare(shareData);
  } catch (error) {
    console.warn('Error checking file shareability:', error);
    return false;
  }
}
