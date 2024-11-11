import { getRandomBytes, isCryptoSubtleAvailable } from ".";
import { getCryptoJS } from ".";

// check if the base64 string is valid
function isValidBase64String(str: string) {
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  return str.length % 4 === 0 && base64Regex.test(str);
}

// modified hashPassword function
export async function hashPassword(
  password: string,
  saltLength = 16,
  iterations = 100000,
  hash = "SHA-256",
): Promise<string> {
  if (isCryptoSubtleAvailable()) {
    // using Web Crypto API
    // generate random salt
    const salt = crypto.getRandomValues(
      new Uint8Array(saltLength),
    );

    // encode password
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // import key
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    // derive bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: hash,
      },
      key,
      256,
    );

    // combine salt and hash
    const combined = new Uint8Array([
      ...salt,
      ...new Uint8Array(derivedBits),
    ]);
    return btoa(String.fromCharCode(...combined));
  } else {
    // using crypto-js
    const CryptoJS = await getCryptoJS();

    // generate random salt
    const salt = await getRandomBytes(saltLength);

    // derive key
    const key = CryptoJS.PBKDF2(
      password,
      CryptoJS.lib.WordArray.create(salt),
      {
        keySize: 256 / 32,
        iterations: iterations,
        hasher: CryptoJS.algo.SHA256,
      },
    );

    // combine salt and hash
    const combinedWordArray =
      CryptoJS.lib.WordArray.create(salt).concat(key);

    // return base64 encoded string
    return CryptoJS.enc.Base64.stringify(combinedWordArray);
  }
}

// modified comparePasswordHash function
export async function comparePasswordHash(
  password: string,
  storedHash: string,
  saltLength = 16,
  iterations = 100000,
  hash = "SHA-256",
): Promise<boolean> {
  if (!isValidBase64String(storedHash)) {
    throw new Error("Invalid Base64 string");
  }

  if (isCryptoSubtleAvailable()) {
    // 使用 Web Crypto API 的原始实现
    try {
      // decode base64
      const combined = Uint8Array.from(
        atob(storedHash),
        (c) => c.charCodeAt(0),
      );

      // extract salt and hash
      const salt = combined.slice(0, saltLength);
      const storedPasswordHash = combined.slice(saltLength);

      // derive hash
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);

      const key = await crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"],
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: iterations,
          hash: hash,
        },
        key,
        256,
      );

      const derivedHash = new Uint8Array(derivedBits);

      // compare hash
      return derivedHash.every(
        (byte, index) => byte === storedPasswordHash[index],
      );
    } catch (error) {
      console.error("Error comparing password:", error);
      throw new Error("Failed to compare password");
    }
  } else {
    // 使用 crypto-js 实现
    const CryptoJS = await getCryptoJS();
    try {
      // decode base64
      const combinedWordArray =
        CryptoJS.enc.Base64.parse(storedHash);

      // extract salt and hash
      const saltWords = CryptoJS.lib.WordArray.create(
        combinedWordArray.words.slice(0, saltLength / 4),
        saltLength,
      );

      const storedHashWords = CryptoJS.lib.WordArray.create(
        combinedWordArray.words.slice(saltLength / 4),
      );

      // derive hash
      const derivedKey = CryptoJS.PBKDF2(
        password,
        saltWords,
        {
          keySize: 256 / 32,
          iterations: iterations,
          hasher: CryptoJS.algo.SHA256,
        },
      );

      // compare hash
      return (
        CryptoJS.enc.Hex.stringify(derivedKey) ===
        CryptoJS.enc.Hex.stringify(storedHashWords)
      );
    } catch (error) {
      console.error("Error comparing password:", error);
      throw new Error("Failed to compare password");
    }
  }
}

// modified encryptData function
export async function encryptData(
  password: string,
  data: string,
): Promise<string> {
  if (isCryptoSubtleAvailable()) {
    // using Web Crypto API
    // create random salt and iv
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // derive key
    const keyMaterial = await getKeyMaterial(password);
    const key = await deriveKey(keyMaterial, salt);

    // encrypt data
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encodedData,
    );

    // combine salt, iv and ciphertext
    const combinedData = new Uint8Array([
      ...salt,
      ...iv,
      ...new Uint8Array(encryptedData),
    ]);
    return btoa(String.fromCharCode(...combinedData));
  } else {
    // 使用 crypto-js 实现
    const CryptoJS = await getCryptoJS();

    // create random salt and iv
    const salt = await getRandomBytes(16);
    const iv = await getRandomBytes(16);

    // derive key
    const key = CryptoJS.PBKDF2(
      password,
      CryptoJS.lib.WordArray.create(salt),
      {
        keySize: 256 / 32,
        iterations: 100000,
        hasher: CryptoJS.algo.SHA256,
      },
    );

    // encrypt data
    const encrypted = CryptoJS.AES.encrypt(data, key, {
      iv: CryptoJS.lib.WordArray.create(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // combine salt, iv and ciphertext
    const combinedWordArray = CryptoJS.lib.WordArray.create(
      salt,
    )
      .concat(CryptoJS.lib.WordArray.create(iv))
      .concat(encrypted.ciphertext);

    return CryptoJS.enc.Base64.stringify(combinedWordArray);
  }
}

// modified decryptData function
export async function decryptData(
  password: string,
  encryptedData: string,
): Promise<string> {
  if (isCryptoSubtleAvailable()) {
    // using Web Crypto API
    // decode base64
    const combinedData = Uint8Array.from(
      atob(encryptedData),
      (c) => c.charCodeAt(0),
    );

    // extract salt, iv and ciphertext
    const salt = combinedData.slice(0, 16);
    const iv = combinedData.slice(16, 28);
    const ciphertext = combinedData.slice(28);

    // derive key
    const keyMaterial = await getKeyMaterial(password);
    const key = await deriveKey(keyMaterial, salt);

    // decrypt
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      ciphertext,
    );

    // decode to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } else {
    // using crypto-js
    const CryptoJS = await getCryptoJS();
    // decode base64
    const combinedWordArray =
      CryptoJS.enc.Base64.parse(encryptedData);

    // extract salt, iv and ciphertext
    const salt = CryptoJS.lib.WordArray.create(
      combinedWordArray.words.slice(0, 4),
      16,
    );
    const iv = CryptoJS.lib.WordArray.create(
      combinedWordArray.words.slice(4, 8),
      16,
    );
    const ciphertext: CryptoJS.lib.WordArray =
      CryptoJS.lib.WordArray.create(
        combinedWordArray.words.slice(8),
      );

    // derive key
    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: 100000,
      hasher: CryptoJS.algo.SHA256,
    });

    // decrypt
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext } as any,
      key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      },
    );

    // decode to string
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
}

// helper function: get key material
async function getKeyMaterial(
  password: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const encodedPassword = encoder.encode(password);
  if (isCryptoSubtleAvailable()) {
    return crypto.subtle.importKey(
      "raw",
      encodedPassword,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  } else {
    // in crypto-js, this step is not needed
    throw new Error(
      "getKeyMaterial is not needed when using crypto-js",
    );
  }
}

// helper function: derive key
async function deriveKey(
  keyMaterial: CryptoKey,
  salt: Uint8Array,
): Promise<CryptoKey> {
  if (isCryptoSubtleAvailable()) {
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } else {
    throw new Error(
      "deriveKey is not needed when using crypto-js",
    );
  }
}

