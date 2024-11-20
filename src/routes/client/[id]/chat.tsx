import {
  RouteSectionProps,
  useNavigate,
} from "@solidjs/router";
import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { Button } from "@/components/ui/button";
import {
  createScrollEnd,
  keepBottom,
} from "@/libs/hooks/keep-bottom";
import { cn } from "@/libs/cn";
import DropArea from "@/components/drop-area";
import { A } from "@solidjs/router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

import { FloatingButton } from "@/components/floating-button";
import { createElementSize } from "@solid-primitives/resize-observer";

import PhotoSwipeLightbox from "photoswipe/lightbox";
import {
  SendClipboardMessage,
  messageStores,
  StoreMessage,
} from "@/libs/core/messge";
import { getInitials } from "@/libs/utils/name";
import { MessageContent } from "@/routes/client/[id]/components/message";
import { ChatBar } from "@/routes/client/[id]/components/chat-bar";
import { sessionService } from "@/libs/services/session-service";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconArrowDownward,
  IconAssignment,
  IconChevronLeft,
  IconClose,
  IconConnectWithoutContract,
  IconDataInfoAlert,
  IconDelete,
  IconFolderMatch,
  IconMenu,
  IconPlaceItem,
  IconStorage,
} from "@/components/icons";
import { createComfirmDeleteClientDialog } from "@/components/box/confirm-delete-dialog";
import { t } from "@/i18n";
import { ConnectionBadge } from "@/routes/components/connection-badge";
import { toast } from "solid-sonner";
import { PeerSession } from "@/libs/core/session";
import { v4 } from "uuid";
import { appOptions, setAppOptions } from "@/options";
import { createClipboardHistoryDialog } from "@/components/box/clipboard-history";
import clientInfoDialog from "./components/chat-client-info";
import { handleDropItems } from "@/libs/utils/process-file";
import { ClientInfo, Client } from "@/libs/core/type";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { catchErrorAsync } from "@/libs/catch";

const ChatHeader: Component<{
  info?: ClientInfo;
  client: Client;
  class?: string;
}> = (props) => {
  const {
    open: openClipboardHistoryDialog,
    Component: ClipboardHistoryDialogComponent,
  } = createClipboardHistoryDialog();
  const {
    open: openConfirmDeleteClientDialog,
    Component: ConfirmDeleteClientDialogComponent,
  } = createComfirmDeleteClientDialog();
  const {
    open: openClientInfoDialog,
    Component: ClientInfoDialogComponent,
  } = clientInfoDialog();

  return (
    <>
      <ClipboardHistoryDialogComponent />
      <ConfirmDeleteClientDialogComponent />
      <ClientInfoDialogComponent />
      <div class={props.class}>
        <div class="flex w-full items-center gap-2">
          <Button
            class="sm:hidden"
            as={A}
            href="/"
            size="icon"
            variant="ghost"
          >
            <IconChevronLeft class="size-8" />
          </Button>

          <Avatar>
            <AvatarImage
              src={props.client.avatar ?? undefined}
            />
            <AvatarFallback>
              {getInitials(props.client.name)}
            </AvatarFallback>
          </Avatar>
          <h4 class={cn("h4")}>{props.client.name}</h4>
          <ConnectionBadge client={props.info} />
          <div class="ml-auto" />
          <Tooltip>
            <TooltipTrigger>
              <Button
                as={A}
                href="../sync"
                variant="ghost"
                size="icon"
              >
                <IconFolderMatch class="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("client.sync.title")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger
                  as={Button}
                  size="icon"
                  variant="ghost"
                >
                  <IconMenu class="size-6" />
                </DropdownMenuTrigger>
                <DropdownMenuContent class="min-w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuGroupLabel>
                      {t("client.menu.options")}
                    </DropdownMenuGroupLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="gap-2"
                      onSelect={() => {
                        openClientInfoDialog(
                          props.client.clientId,
                        );
                      }}
                    >
                      <IconDataInfoAlert class="size-4" />
                      {t("client.menu.connection_status")}
                    </DropdownMenuItem>
                    <Show
                      when={
                        props.info?.onlineStatus ===
                        "offline"
                      }
                    >
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={async () => {
                          const session =
                            sessionService.sessions[
                              props.client.clientId
                            ];
                          if (session) {
                            try {
                              await session.listen();
                              if (!session.polite)
                                await session.connect();
                            } catch (error) {
                              console.error(error);
                              if (error instanceof Error) {
                                toast.error(error.message);
                              }
                            }
                          }
                        }}
                      >
                        <IconConnectWithoutContract class="size-4" />
                        {t("client.menu.connect")}
                      </DropdownMenuItem>
                    </Show>
                    <Show when={props.info?.clipboard}>
                      {(clipboard) => (
                        <DropdownMenuItem
                          class="gap-2"
                          onSelect={() => {
                            openClipboardHistoryDialog(
                              clipboard,
                            );
                          }}
                        >
                          <IconAssignment class="size-4" />
                          {t("client.menu.clipboard")}
                        </DropdownMenuItem>
                      )}
                    </Show>

                    <DropdownMenuItem
                      class="gap-2"
                      onSelect={async () => {
                        if (
                          !(
                            await openConfirmDeleteClientDialog(
                              props.client.name,
                            )
                          ).cancel
                        ) {
                          messageStores.deleteClient(
                            props.client.clientId,
                          );
                        }
                      }}
                    >
                      <IconDelete class="size-4" />
                      {t("client.menu.delete_client")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuCheckboxItem
                        class="gap-2"
                        checked={
                          appOptions.redirectToClient ===
                          props.client.clientId
                        }
                        onChange={(checked) => {
                          setAppOptions(
                            "redirectToClient",
                            checked
                              ? props.client.clientId
                              : undefined,
                          );
                        }}
                      >
                        {t("client.menu.redirect")}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>
              {t("client.menu.options")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  );
};

export default function ClientPage(
  props: RouteSectionProps,
) {
  const navigate = useNavigate();
  const { sendText, sendFile } = useWebRTC();
  const client = createMemo<Client | null>(
    () =>
      messageStores.clients.find(
        (client) => client.clientId === props.params.id,
      ) ?? null,
  );
  const clientInfo = createMemo<ClientInfo | undefined>(
    () => sessionService.clientInfo[props.params.id],
  );
  createEffect(() => {
    if (messageStores.status() === "ready" && !client()) {
      navigate("/", { replace: true });
    }
  });

  const position = createScrollEnd(document);

  const isBottom = createMemo(() => {
    const pos = position();
    if (!pos) return true;

    return pos.height <= pos.bottom + 10;
  });

  const [enable, setEnable] = createSignal(true);
  createEffect(() => {
    if (enable() !== isBottom()) {
      setEnable(isBottom());
    }
  });

  const messages = createMemo<StoreMessage[]>(
    () =>
      messageStores.messages.filter(
        (message) =>
          message.client === props.params.id ||
          message.target === props.params.id,
      ) ?? [],
  );
  let toBottom: (
    delay: number | undefined,
    instant: boolean,
  ) => void;
  onMount(() => {
    toBottom = keepBottom(document, enable);

    toBottom(50, true);

    createEffect(() => {
      if (props.location.pathname !== "/") {
        toBottom(50, true);
      }
    });
    createEffect(() => {
      if (messages().length) {
        toBottom(10, false);
      }
    });
    createEffect(() => {
      if (
        clientInfo()?.onlineStatus === "online" &&
        enable()
      ) {
        toBottom(10, true);
      }
    });
  });

  const [bottomElem, setBottomElem] =
    createSignal<HTMLElement>();
  const size = createElementSize(bottomElem);

  const session = createMemo<PeerSession | null>(
    () =>
      (clientInfo() &&
        sessionService.sessions[clientInfo()!.clientId]) ??
      null,
  );

  const onClipboard = (ev: ClipboardEvent) => {
    const s = session();
    if (!s) return;
    for (const item of ev.clipboardData?.items ?? []) {
      if (item.kind === "string") {
        item.getAsString((data) => {
          if (data) {
            s.sendMessage({
              type: "send-clipboard",
              id: v4(),
              createdAt: Date.now(),
              client: s.clientId,
              target: s.targetClientId,
              data,
            } satisfies SendClipboardMessage);
          }
        });
        break;
      }
    }
  };

  onMount(() => {
    if (navigator.clipboard && appOptions.enableClipboard) {
      window.addEventListener("paste", onClipboard);

      onCleanup(() => {
        window.removeEventListener("paste", onClipboard);
      });
    }
  });

  let loadedTimer: number | undefined;

  return (
    <div class="flex h-full w-full flex-col">
      <Show when={client()}>
        {(client) => (
          <div class={cn("flex flex-1 flex-col [&>*]:p-1")}>
            <FloatingButton
              onClick={async () => {
                toBottom?.(0, false);
              }}
              delay={500}
              duration={150}
              isVisible={!enable()}
              class="fixed z-50 size-12 rounded-full shadow-md backdrop-blur
                data-[expanded]:animate-in data-[closed]:animate-out
                data-[closed]:fade-out-0 data-[expanded]:fade-in-0
                data-[closed]:zoom-out-75 data-[expanded]:zoom-in-75"
              style={{
                bottom: `${16 + (size.height ?? 0)}px`,
                right:
                  "calc(1rem + var(--scrollbar-width, 0px))",
              }}
            >
              <IconArrowDownward class="size-6 sm:size-8" />
            </FloatingButton>
            <ChatHeader
              info={clientInfo()}
              client={client()}
              class="sticky top-12 z-10 flex items-center justify-between gap-1
                border-b border-border bg-background/80 backdrop-blur"
            />
            <DropArea
              class="relative flex-1"
              overlay={(ev) => {
                if (!ev) return;
                if (ev.dataTransfer) {
                  const hasFiles =
                    ev.dataTransfer?.types.includes(
                      "Files",
                    );

                  if (hasFiles) {
                    ev.dataTransfer.dropEffect = "move";
                  } else {
                    ev.dataTransfer.dropEffect = "none";
                  }
                }
                return (
                  <div class="pointer-events-none absolute inset-0 bg-muted/50 text-center">
                    <span
                      class="fixed top-1/2 -translate-x-1/2 text-muted-foreground/20"
                      style={{
                        "--tw-translate-y": `-${(size.height ?? 0) / 2}px`,
                      }}
                    >
                      <Show
                        when={
                          ev.dataTransfer?.dropEffect ===
                          "move"
                        }
                        fallback={
                          <IconClose class="size-32" />
                        }
                      >
                        <IconPlaceItem class="size-32" />
                      </Show>
                    </span>
                  </div>
                );
              }}
              onDrop={async (ev) => {
                if (!ev.dataTransfer?.items) return;
                const abortController =
                  new AbortController();
                const toastId = toast.loading(
                  t("common.notification.processing_files"),
                  {
                    duration: Infinity,
                    action: {
                      label: t("common.action.cancel"),
                      onClick: () =>
                        abortController.abort(
                          "User cancelled",
                        ),
                    },
                  },
                );

                const [error, files] =
                  await catchErrorAsync(
                    handleDropItems(
                      ev.dataTransfer.items,
                      abortController.signal,
                    ),
                  );
                toast.dismiss(toastId);
                if (error) {
                  console.warn(error);
                  if (error.message !== "User cancelled") {
                    toast.error(error.message);
                  }
                  return;
                }

                files.forEach((file) => {
                  sendFile(file, client().clientId);
                });
              }}
            >
              <ul
                class="flex flex-col gap-2 p-2"
                ref={(ref) => {
                  onMount(() => {
                    const lightbox = new PhotoSwipeLightbox(
                      {
                        gallery: ref,
                        bgOpacity: 0.8,
                        children: "a#image",
                        initialZoomLevel: "fit",
                        closeOnVerticalDrag: true,
                        // wheelToZoom: true, // enable wheel-based zoom

                        pswpModule: () =>
                          import("photoswipe"),
                      },
                    );
                    lightbox.on("uiRegister", function () {
                      lightbox.pswp?.ui?.registerElement({
                        name: "download-button",
                        order: 8,
                        isButton: true,
                        tagName: "a",

                        // SVG with outline
                        html: {
                          isCustomSVG: true,
                          inner:
                            '<path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z" id="pswp__icn-download"/>',
                          outlineID: "pswp__icn-download",
                        },

                        // Or provide full svg:
                        // html: '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" class="pswp__icn"><path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z" /></svg>',

                        // Or provide any other markup:
                        // html: '<i class="fa-solid fa-download"></i>'

                        onInit: (el, pswp) => {
                          const e = el as HTMLAnchorElement;

                          e.setAttribute(
                            "target",
                            "_blank",
                          );
                          e.setAttribute("rel", "noopener");

                          pswp.on("change", () => {
                            e.download =
                              pswp.currSlide?.data.element
                                ?.dataset.download ?? "";

                            e.href =
                              pswp.currSlide?.data.src ??
                              "";
                          });
                        },
                      });
                    });
                    lightbox.init();
                  });
                }}
              >
                <For each={messages()}>
                  {(message, index) => (
                    <MessageContent
                      message={message}
                      onLoad={() => {
                        if (message.type === "file") {
                          console.log(
                            `${message.fileName} loaded`,
                          );
                        }
                        clearTimeout(loadedTimer);
                        loadedTimer = window.setTimeout(
                          () => {
                            toBottom(250, false);
                          },
                          250,
                        );
                      }}
                      class={cn(
                        index() === messages().length - 1 &&
                          "animate-message mb-20",
                      )}
                    />
                  )}
                </For>
              </ul>
            </DropArea>
            <Show
              when={clientInfo()?.onlineStatus === "online"}
            >
              <ChatBar
                client={client()}
                ref={setBottomElem}
              />
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
