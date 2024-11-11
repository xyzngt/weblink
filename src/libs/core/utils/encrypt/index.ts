// check if crypto.subtle is available
export function isCryptoSubtleAvailable() {
  return (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.subtle
  );
}

// lazy load crypto-js
let CryptoJSPromise: Promise<
  typeof import("crypto-js")
> | null = null;

export async function getCryptoJS(): Promise<
  typeof import("crypto-js")
> {
  if (!CryptoJSPromise) {
    console.warn(
      "Web Crypto API is not available, using crypto-js",
    );
    CryptoJSPromise = import("crypto-js");
  }
  return CryptoJSPromise;
}

// generate random bytes
export async function getRandomBytes(
  length: number,
): Promise<Uint8Array> {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    return window.crypto.getRandomValues(
      new Uint8Array(length),
    );
  } else {
    // using crypto-js to generate random bytes
    return getCryptoJS().then((CryptoJS) => {
      const randomWords =
        CryptoJS.lib.WordArray.random(length).words;
      const randomBytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        randomBytes[i] =
          (randomWords[i >>> 2] >>> (24 - (i % 4) * 8)) &
          0xff;
      }
      return randomBytes;
    });
  }
}

// check if crypto.subtle is available
export function checkCryptoAvailable() {
  return isCryptoSubtleAvailable();
}
