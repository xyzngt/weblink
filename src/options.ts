import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
import { ClientID, FileID } from "./libs/core/type";
import { createEffect, createSignal } from "solid-js";
import { cacheManager } from "./libs/services/cache-serivce";
import languages from "@/assets/i18n/languages.json";
export type Locale = string;

export type TurnServerOptions = {
  url: string;
  username: string;
  password: string;
  authMethod: string;
};

type ConnectionOptions = {
  stuns: string[];
  turns: TurnServerOptions[];
};

export type CompressionLevel =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

// App options
export type AppOption = {
  // Receiver
  maxMomeryCacheSlices: number;
  automaticDownload: boolean;

  // Sender
  enableClipboard: boolean;
  automaticCacheDeletion: boolean;
  channelsNumber: number;
  chunkSize: number;
  ordered: boolean;
  bufferedAmountLowThreshold: number;
  compressionLevel: CompressionLevel;
  blockSize: number;
  maxFileSize: number;

  // Connection
  servers: ConnectionOptions;
  shareServersWithOthers: boolean;
  websocketUrl?: string;

  // Appearance
  locale: Locale;
  showAboutDialog: boolean;
  backgroundImage?: FileID;
  backgroundImageOpacity: number;
  redirectToClient?: ClientID;

  // Stream
  videoMaxBitrate: number;
  audioMaxBitrate: number;
};

export const defaultWebsocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ??
  window.env.VITE_WEBSOCKET_URL;

export const localeOptionsMap = languages as Record<
  Locale,
  string
>;

export function localFromLanguage(
  language: string,
): Locale {
  return (
    Object.keys(localeOptionsMap).find((locale) =>
      locale.toLowerCase().includes(language.toLowerCase()),
    ) ?? "en-us"
  );
}

export const getDefaultAppOptions = () => {
  return {
    channelsNumber: 1,
    chunkSize: 512 * 1024,
    blockSize: 32 * 1024,
    ordered: false,
    enableClipboard: navigator.clipboard !== undefined,
    automaticCacheDeletion: false,
    bufferedAmountLowThreshold: 32 * 1024,
    maxMomeryCacheSlices: 12,
    videoMaxBitrate: 128 * 1024 * 1024,
    audioMaxBitrate: 512 * 1024,
    servers: {
      stuns: ["stun:stun.l.google.com:19302"],
      turns: [],
    },
    compressionLevel: 6,
    locale: localFromLanguage(navigator.language),
    showAboutDialog: true,
    shareServersWithOthers: false,
    backgroundImageOpacity: 0.5,
    automaticDownload: false,
    websocketUrl: defaultWebsocketUrl,
    // todo: add dialog to prompt user the file size
    maxFileSize: 1024 * 1024 * 1024, // 1GB
  } satisfies AppOption;
};

export const [appOptions, setAppOptions] = makePersisted(
  createStore<AppOption>(getDefaultAppOptions()),
  {
    name: "app_options",
    storage: localStorage,
  },
);

export const [backgroundImage, setBackgroundImage] =
  createSignal<string | undefined>(undefined);

createEffect(async () => {
  if (!appOptions.backgroundImage) {
    setBackgroundImage(undefined);
    return;
  }
  if (cacheManager.status() === "loading") {
    return;
  }
  const backgroundImage =
    cacheManager.caches[appOptions.backgroundImage];
  if (!backgroundImage) return;
  const file = await backgroundImage.getFile();
  if (!file) return;
  const url = URL.createObjectURL(file);
  setBackgroundImage(url);
});
