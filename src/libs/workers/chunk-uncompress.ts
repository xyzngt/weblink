import { inflateSync } from "fflate";

self.onmessage = (
  ev: MessageEvent<{
    data: Uint8Array;
    context?: any;
  }>,
) => {
  const { data, context } = ev.data;

  const uncompressed = inflateSync(data);

  try {
    self.postMessage({
      data: uncompressed,
      context,
    });
  } catch (error) {
    self.postMessage({
      error: (error as Error).message,
      context,
    });
  }
};
