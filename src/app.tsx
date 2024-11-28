import {
  RouteSectionProps,
  useSearchParams,
} from "@solidjs/router";

import {
  createSignal,
  onCleanup,
  onMount,
  ParentProps,
  Show,
} from "solid-js";
import { Toaster } from "@/components/ui/sonner";
import ChatProvider from "./components/chat/chat-provider";
import Nav from "@/components/nav";
import {
  ColorModeProvider,
  ColorModeScript,
  createLocalStorageManager,
} from "@kobalte/core";
import {
  clientProfile,
  setClientProfile,
} from "./libs/core/store";
import { useWebRTC } from "./libs/core/rtc-context";
import {
  JoinRoomButton,
  createRoomDialog,
} from "./components/join-dialog";
import { toast } from "solid-sonner";
import { sessionService } from "./libs/services/session-service";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { createReloadPrompt } from "./libs/hooks/reload-prompt";
import { catchErrorAsync } from "./libs/catch";

const createWakeLock = () => {
  const [wakeLock, setWakeLock] =
    createSignal<WakeLockSentinel | null>(null);

  const requestWakeLock = async () => {
    if (!navigator.wakeLock) {
      return;
    }
    const lock = wakeLock();
    if (lock && lock.released === false) {
      return;
    }

    const [err, newLock] = await catchErrorAsync(
      navigator.wakeLock.request("screen"),
    );
    if (err) {
      console.error(err);
      return;
    }
    setWakeLock(newLock);
    newLock.addEventListener("release", () => {
      setWakeLock(null);
    });
  };
  const handleVisibilityChange = async () => {
    if (document.visibilityState === "visible") {
      await requestWakeLock();
    }
  };
  onMount(async () => {
    await requestWakeLock();
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  });
  onCleanup(() => {
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    wakeLock()?.release();
  });
  return wakeLock;
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

  const parseSearchParams = async () => {
    let reset = false;
    if (search.id && search.id !== clientProfile.roomId) {
      setClientProfile("roomId", search.id as string);
      setSearch({ id: null }, { replace: true });
      reset = true;
    }
    if (
      search.pwd &&
      search.pwd !== clientProfile.password
    ) {
      setClientProfile("password", search.pwd as string);
      setSearch({ pwd: null }, { replace: true });
      reset = true;
    }
    if (search.stun) {
      const stunServers = JSON.parse(
        search.stun as string,
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
        search.turn as string,
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
  };

  onMount(async () => {
    parseSearchParams();

    if (appOptions.showAboutDialog) {
      openAboutDialog();
    }
  });

  createWakeLock();
  createReloadPrompt();

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
          <Tooltip>
            <TooltipTrigger
              as={Button}
              onClick={openQRCodeDialog}
              size="icon"
            >
              <IconQRCode class="size-6" />
            </TooltipTrigger>
            <TooltipContent>
              {t("common.nav.share_link")}
            </TooltipContent>
          </Tooltip>
        </Show>
        <JoinRoomButton />
      </div>

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
        <ColorModeScript
          storageType={storageManager.type}
        />
      </MetaProvider>
      <Toaster />
      <ColorModeProvider storageManager={storageManager}>
        <ChatProvider>
          <InnerApp> {props.children}</InnerApp>
        </ChatProvider>
      </ColorModeProvider>
    </>
  );
}
