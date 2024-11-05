import { CompressionLevel } from "@/options";
import { deflateSync } from "fflate";

self.onmessage = (
  ev: MessageEvent<{
    data: Uint8Array;
    context?: any;
    option: {
      level: CompressionLevel;
    };
  }>,
) => {
  const { data, option, context } = ev.data;

  const compressed = deflateSync(data, {
    level: option.level,
  });

  try {
    self.postMessage({
      data: compressed,
      context,
    });
  } catch (error) {
    self.postMessage({
      error: (error as Error).message,
      context,
    });
  }
};