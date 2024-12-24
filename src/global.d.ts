/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_SOTRAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGEING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_FIREBASE_DATABASE_URL: string;
  readonly VITE_WEBSOCKET_URL: string;
  readonly VITE_BACKEND: string;
  readonly VITE_STUN_SERVERS?: string;
  readonly VITE_TURN_SERVERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_LICENSE__: string;
declare const __APP_AUTHOR_NAME__: string;
declare const __APP_AUTHOR_EMAIL__: string;
declare const __APP_AUTHOR_URL__: string;
declare const __APP_BUILD_TIME__: number;

declare module "virtual:pwa-register" {
  import type { RegisterSWOptions } from "vite-plugin-pwa/types";

  export type { RegisterSWOptions };

  export function registerSW(
    options?: RegisterSWOptions,
  ): (reloadPage?: boolean) => Promise<void>;
}
