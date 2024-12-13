import {
  RouteSectionProps,
  useSearchParams,
} from "@solidjs/router";
import {
  createEffect,
  createSignal,
  ErrorBoundary,
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
  getRandomAvatar,
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
import createAboutDialog from "./components/about-dialog";
import {
  appInitialized,
  appOptions,
  backgroundImage,
  localeOptionsMap,
  localFromLanguage,
  setAppInitialized,
  setAppOptions,
  setStarterMessageSent,
  starterMessageSent,
  TurnServerOptions,
} from "./options";
import { MetaProvider, Style } from "@solidjs/meta";
import { produce } from "solid-js/store";
import { createQRCodeDialog } from "./components/create-qrcode-dialog";
import { createForwardDialog } from "./components/forward-dialog";
import { createReloadPrompt } from "./libs/hooks/reload-prompt";
import { catchErrorAsync } from "./libs/catch";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./components/ui/hover-card";
import {
  IconHome,
  IconLink,
  IconPermContactCalendar,
} from "./components/icons";
import { getInitials } from "./libs/utils/name";
import { Button } from "./components/ui/button";
import { t, isDictLoaded } from "./i18n";
import { v4 } from "uuid";
import { createIsMobile } from "./libs/hooks/create-mobile";
import { messageStores } from "./libs/core/messge";
import { sleep } from "./libs/utils/sleep";
import { makePersisted } from "@solid-primitives/storage";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";

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
    if (clientProfile.initalJoin) {
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
      setClientProfile("initalJoin", true);
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

  const initStarterMessage = async () => {
    const instructorClientId = v4();
    const instructorName = t("common.starter.starter_name");
    messageStores.setClient({
      clientId: instructorClientId,
      name: instructorName,
      avatar: getRandomAvatar(instructorName),
    });

    await messageStores.addMessage({
      id: v4(),
      type: "text",
      client: instructorClientId,
      target: clientProfile.clientId,
      data: t("common.starter.welcome"),
      createdAt: Date.now(),
      status: "received",
    });
    await sleep(1);
    await messageStores.addMessage({
      id: v4(),
      type: "text",
      client: instructorClientId,
      target: clientProfile.clientId,
      data: t("common.starter.tip1"),
      createdAt: Date.now(),
      status: "received",
    });
    await sleep(1);
    await messageStores.addMessage({
      id: v4(),
      type: "text",
      client: instructorClientId,
      target: clientProfile.clientId,
      data: t("common.starter.tip2"),
      createdAt: Date.now(),
      status: "received",
    });
  };

  onMount(async () => {
    parseSearchParams();
    if (!localeOptionsMap[appOptions.locale]) {
      setAppOptions(
        "locale",
        localFromLanguage(navigator.language),
      );
    }

    if (!appInitialized()) {
      setAppInitialized(true);
      openAboutDialog();
    }
  });

  createEffect(() => {
    if (isDictLoaded() && !starterMessageSent()) {
      setStarterMessageSent(true);
      initStarterMessage();
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
  const { roomStatus } = useWebRTC();
  const isMobile = createIsMobile();
  return (
    <>
      <RoomDialogComponent />
      <QRCodeDialogComponent />
      <AboutDialogComponent />
      <ForwardDialogComponent />
      <div class="flex h-full min-h-full w-full flex-col md:flex-row">
        <div
          class="sticky top-0 z-50 h-[var(--mobile-header-height)]
            max-h-[100vh] w-[var(--desktop-header-width)] flex-shrink-0
            overflow-y-auto border-b border-border bg-background/80
            backdrop-blur scrollbar-none md:border-b-0 md:border-r"
        >
          <div
            class="sticky top-0 flex h-full max-h-[100vh] items-center gap-2
              px-2 py-0 md:flex-col md:px-0 md:py-2"
          >
            <Nav class="items-center gap-2 p-2 md:flex-col md:gap-4" />
            <div class="flex-1"></div>
            <HoverCard
              gutter={6}
              placement={
                isMobile() ? "bottom" : "right-end"
              }
            >
              <HoverCardTrigger
                as={Avatar}
                class="size-8 hover:cursor-pointer md:mt-auto md:size-10"
                onTouchStart={() => {
                  if (isMobile()) {
                    openQRCodeDialog();
                  }
                }}
              >
                <AvatarImage
                  src={clientProfile.avatar ?? undefined}
                />
                <AvatarFallback>
                  {getInitials(clientProfile.name)}
                </AvatarFallback>
              </HoverCardTrigger>
              <HoverCardContent class="flex flex-col gap-2">
                <div class="flex gap-4">
                  <Avatar class="size-12">
                    <AvatarImage
                      src={
                        clientProfile.avatar ?? undefined
                      }
                    />
                    <AvatarFallback>
                      {getInitials(clientProfile.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div class="flex flex-col gap-2">
                    <p class="text-sm font-medium">
                      {clientProfile.name}
                    </p>
                    <Show when={roomStatus.roomId}>
                      {(room) => (
                        <p class="flex items-center gap-1 text-xs text-muted-foreground">
                          <IconHome class="size-4" />{" "}
                          {room()}
                        </p>
                      )}
                    </Show>
                    <Show when={roomStatus.profile}>
                      {(profile) => (
                        <p class="flex items-center gap-1 text-xs text-muted-foreground">
                          <IconPermContactCalendar class="size-4" />
                          {new Date(
                            profile().createdAt,
                          ).toLocaleString()}
                        </p>
                      )}
                    </Show>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  class="gap-2"
                  onClick={async () => {
                    const [err] = await catchErrorAsync(
                      navigator.clipboard.writeText(
                        joinUrl(),
                      ),
                    );
                    if (err) {
                      toast.error(
                        t(
                          "common.notification.link_copy_failed",
                        ),
                      );
                    } else {
                      toast.success(
                        t(
                          "common.notification.link_copy_success",
                        ),
                      );
                    }
                  }}
                >
                  <IconLink class="size-4" />

                  {t("common.nav.share_link")}
                </Button>
              </HoverCardContent>
            </HoverCard>
            <JoinRoomButton class="md:hidden" />
          </div>
        </div>
        <div class="flex-1">
          <ErrorBoundary
            fallback={(err: Error, reset) => (
              <div
                class="flex size-full max-w-[100vw] flex-col justify-center gap-2
                  px-2 py-4"
              >
                <h3 class="h3 mb-4">
                  {t("common.error_boundary.title")}
                </h3>
                <Label>
                  {t("common.error_boundary.description")}
                </Label>
                <div class="flex h-full flex-col gap-2">
                  <p>{err.message}</p>
                  {/* Print stack trace */}
                  <Textarea
                    readOnly
                    class="flex-1 overflow-x-auto whitespace-pre-wrap text-nowrap
                      text-xs scrollbar-thin"
                    value={err.stack}
                  />
                </div>
                <Button onClick={() => reset()}>
                  {t("common.error_boundary.reset")}
                </Button>
              </div>
            )}
          >
            {props.children}
          </ErrorBoundary>
        </div>
      </div>
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
        <Toaster />
        <ColorModeProvider storageManager={storageManager}>
          <ChatProvider>
            <InnerApp> {props.children}</InnerApp>
          </ChatProvider>
        </ColorModeProvider>
      </MetaProvider>
    </>
  );
}
