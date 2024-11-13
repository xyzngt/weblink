import {
  RouteSectionProps,
  useSearchParams,
} from "@solidjs/router";

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  ParentProps,
  Show,
} from "solid-js";
import { Toaster } from "@/components/ui/sonner";
import ChatProvider from "./components/chat/chat-provider";
import Nav from "@/components/nav";
import { ReloadPrompt } from "./components/reload-prompt";
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
  useColorMode,
} from "@kobalte/core";
import {
  clientProfile,
  setClientProfile,
} from "./libs/core/store";
import { useWebRTC } from "./libs/core/rtc-context";
import {
  JoinRoomButton,
  createRoomDialog,
  joinUrl,
} from "./components/join-dialog";
import { toast } from "solid-sonner";
import { sessionService } from "./libs/services/session-service";
import { createDialog } from "./components/dialogs/dialog";
import { QRCode } from "./components/qrcode";
import { Button } from "./components/ui/button";
import { IconQRCode } from "./components/icons";
import { t } from "./i18n";
import createAboutDialog from "./components/about-dialog";
import {
  appOptions,
  backgroundImage,
  setAppOptions,
  TurnServerOptions,
} from "./options";
import { MetaProvider, Style } from "@solidjs/meta";
import { produce } from "solid-js/store";
import { createQRCodeDialog } from "./components/create-qrcode-dialog";
import { createForwardDialog } from "./components/forward-dialog";
let wakeLock: WakeLockSentinel | null = null;
const requestWakeLock = async () => {
  if (!navigator.wakeLock) {
    return;
  }
  if (wakeLock && wakeLock.released === false) {
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    if (err instanceof Error)
      console.error(`${err.name}, ${err.message}`);
  }
};

const InnerApp = (props: ParentProps) => {
  const { joinRoom } = useWebRTC();
  const [search, setSearch] = useSearchParams();

  const {
    open: openRoomDialog,
    Component: RoomDialogComponent,
  } = createRoomDialog();

  const {
    open: openQRCodeDialog,
    Component: QRCodeDialogComponent,
  } = createQRCodeDialog();

  const {
    open: openAboutDialog,
    Component: AboutDialogComponent,
  } = createAboutDialog();

  const onJoinRoom = async () => {
    if (clientProfile.firstTime) {
      const result = await openRoomDialog();
      if (result.cancel) {
        return;
      }
    }

    await joinRoom().catch((err) => {
      console.error(err);
      toast.error(err.message);
    });
  };

  onMount(async () => {
    let reset = false;
    if (search.id && search.id !== clientProfile.roomId) {
      setClientProfile("roomId", search.id);
      setSearch({ id: null }, { replace: true });
      reset = true;
    }
    if (
      search.pwd &&
      search.pwd !== clientProfile.password
    ) {
      setClientProfile("password", search.pwd);
      setSearch({ pwd: null }, { replace: true });
      reset = true;
    }
    if (search.stun) {
      const stunServers = JSON.parse(
        search.stun,
      ) as string[];
      setAppOptions(
        "servers",
        "stuns",
        produce((state) => {
          stunServers.forEach((server) => {
            if (!state.includes(server)) {
              state.push(server);
            }
          });
        }),
      );
    }
    if (search.turn) {
      const turnServers = JSON.parse(
        search.turn,
      ) as TurnServerOptions[];

      if (!appOptions.servers.turns) {
        setAppOptions("servers", "turns", []);
      }

      setAppOptions(
        "servers",
        "turns",
        produce((state) => {
          turnServers.forEach((server) => {
            if (
              state?.findIndex(
                (s) => s.url === server.url,
              ) === -1
            ) {
              state.push(server);
            }
          });
        }),
      );
    }
    if (reset) {
      setClientProfile("firstTime", true);
    }

    if (search.join) {
      onJoinRoom();
      return;
    }

    if (
      !sessionService.clientService &&
      clientProfile.autoJoin
    ) {
      await onJoinRoom();
    }
  });

  onMount(async () => {
    requestWakeLock();

    document.addEventListener(
      "visibilitychange",
      async () => {
        if (document.visibilityState === "visible") {
          await requestWakeLock();
        }
      },
    );
  });

  onMount(() => {
    if (appOptions.showAboutDialog) {
      openAboutDialog();
    }
  });

  onCleanup(() => {
    wakeLock?.release();
  });

  const {
    forwardTarget: shareTarget,
    Component: ForwardDialogComponent,
  } = createForwardDialog();

  if (navigator.serviceWorker) {
    onMount(() => {
      const onMessage = (ev: MessageEvent) => {
        if (ev.data.action === "share-target") {
          window.focus();
          shareTarget(ev.data.data as ShareData);
        }
      };
      navigator.serviceWorker.addEventListener(
        "message",
        onMessage,
      );
      onCleanup(() => {
        navigator.serviceWorker.removeEventListener(
          "message",
          onMessage,
        );
      });
    });
  }

  return (
    <>
      <RoomDialogComponent />
      <QRCodeDialogComponent />
      <AboutDialogComponent />
      <ForwardDialogComponent />
      <div
        class="sticky top-0 z-50 flex h-12 w-full flex-wrap items-center
          gap-4 border-b border-border bg-background/80 px-2
          backdrop-blur"
      >
        <h2 class="hidden font-mono text-xl font-bold sm:block">
          Weblink
        </h2>
        <Nav />
        <div class="ml-auto"></div>
        <Show
          when={
            sessionService.clientServiceStatus() ===
            "connected"
          }
        >
          <Button onClick={openQRCodeDialog} size="icon">
            <IconQRCode class="size-6" />
          </Button>
        </Show>
        <JoinRoomButton />
      </div>
      <ReloadPrompt />

      {props.children}
    </>
  );
};

export default function App(props: RouteSectionProps) {
  const storageManager =
    createLocalStorageManager("ui-theme");

  return (
    <>
      <MetaProvider>
        <Style>
          {`
          :root {
            --background-image: url(${backgroundImage() ?? ""});
            --background-image-opacity: ${appOptions.backgroundImageOpacity};
          }`}
        </Style>
      </MetaProvider>
      <Toaster />
      <ColorModeScript storageType={storageManager.type} />
      <ColorModeProvider storageManager={storageManager}>
        <ChatProvider>
          <InnerApp> {props.children}</InnerApp>
        </ChatProvider>
      </ColorModeProvider>
    </>
  );
}
