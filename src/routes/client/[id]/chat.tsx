import {
  RouteSectionProps,
  useNavigate,
} from "@solidjs/router";
import { useWebRTC } from "@/libs/core/rtc-context";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
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
import { createDialog } from "@/components/dialogs/dialog";

import { FloatingButton } from "@/components/floating-button";
import { createElementSize } from "@solid-primitives/resize-observer";

import PhotoSwipeLightbox from "photoswipe/lightbox";
import {
  SendClipboardMessage,
  messageStores,
  SessionMessage,
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
  DropdownMenuItemLabel,
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
  IconMenu,
  IconPlaceItem,
} from "@/components/icons";
import { createComfirmDeleteClientDialog } from "@/components/box/confirm-delete-dialog";
import { t } from "@/i18n";
import { ConnectionBadge } from "@/components/chat/clientlist";
import { toast } from "solid-sonner";
import { PeerSession } from "@/libs/core/session";
import { v4 } from "uuid";
import { appOptions, setAppOptions } from "@/options";
import { createClipboardHistoryDialog } from "@/components/box/clipboard-history";
import clientInfoDialog from "./components/chat-client-info";
import { handleDropItems } from "./components/process-file";
export default function ClientPage(
  props: RouteSectionProps,
) {
  const navigate = useNavigate();
  const { send, roomStatus } = useWebRTC();
  const client = createMemo(() =>
    messageStores.clients.find(
      (client) => client.clientId === props.params.id,
    ),
  );
  const clientInfo = createMemo(
    () => sessionService.clientInfo[props.params.id],
  );
  createEffect(() => {
    if (messageStores.status() === "ready" && !client()) {
      navigate("/", { replace: true });
    }
  });

  const {
    open: openClientInfoDialog,
    Component: ClientInfoDialogComponent,
  } = clientInfoDialog();

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

  const { open, Component } =
    createComfirmDeleteClientDialog();
  const session = createMemo<PeerSession | undefined>(
    () =>
      clientInfo() &&
      sessionService.sessions[clientInfo()!.clientId],
  );

  const {
    open: openClipboardHistoryDialog,
    Component: ClipboardHistoryDialogComponent,
  } = createClipboardHistoryDialog();

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
      <Component />
      <ClipboardHistoryDialogComponent />
      <Show when={client()}>
        {(client) => (
          <div
            class={cn(
              "flex flex-1 flex-col [&>*]:p-1 md:[&>*]:p-2",
            )}
          >
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

            <ClientInfoDialogComponent class="flex max-h-[90%] flex-col" />
            <div
              class="sticky top-12 z-10 flex items-center justify-between gap-1
                border-b border-border bg-background/80 backdrop-blur"
            >
              <div class="flex w-full items-center gap-2">
                <Button
                  as={A}
                  href="/"
                  size="icon"
                  variant="ghost"
                >
                  <IconChevronLeft class="size-8" />
                </Button>

                <Avatar>
                  <AvatarImage
                    src={client().avatar ?? undefined}
                  />
                  <AvatarFallback>
                    {getInitials(client().name)}
                  </AvatarFallback>
                </Avatar>
                <h4 class={cn("h4")}>{client().name}</h4>
                <ConnectionBadge client={clientInfo()} />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    as={Button}
                    size="icon"
                    variant="ghost"
                    class="ml-auto"
                  >
                    <IconMenu class="size-6" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="min-w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuGroupLabel>
                        {t("chat.menu.client_options")}
                      </DropdownMenuGroupLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={() => {
                          openClientInfoDialog(
                            client().clientId,
                          );
                        }}
                      >
                        <IconDataInfoAlert class="size-4" />
                        {t("chat.menu.connection_status")}
                      </DropdownMenuItem>
                      <Show
                        when={
                          clientInfo()?.onlineStatus ===
                          "offline"
                        }
                      >
                        <DropdownMenuItem
                          class="gap-2"
                          onSelect={async () => {
                            const session =
                              sessionService.sessions[
                                client().clientId
                              ];
                            if (session) {
                              try {
                                await session.listen();
                                if (!session.polite)
                                  await session.connect();
                              } catch (error) {
                                console.error(error);
                                if (
                                  error instanceof Error
                                ) {
                                  toast.error(
                                    error.message,
                                  );
                                }
                              }
                            }
                          }}
                        >
                          <IconConnectWithoutContract class="size-4" />
                          {t("chat.menu.connect")}
                        </DropdownMenuItem>
                      </Show>
                      <Show when={clientInfo()?.clipboard}>
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
                            {t("chat.menu.clipboard")}
                          </DropdownMenuItem>
                        )}
                      </Show>

                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={async () => {
                          if (!(await open()).cancel) {
                            messageStores.deleteClient(
                              client().clientId,
                            );
                          }
                        }}
                      >
                        <IconDelete class="size-4" />
                        {t("chat.menu.delete_client")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuCheckboxItem
                          class="gap-2"
                          checked={
                            appOptions.redirectToClient ===
                            client().clientId
                          }
                          onChange={(checked) => {
                            setAppOptions(
                              "redirectToClient",
                              checked
                                ? client().clientId
                                : undefined,
                            );
                          }}
                        >
                          {t("chat.menu.redirect")}
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <DropArea
              class="relative flex-1"
              onDragOver={(ev) => {
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
                      class="fixed top-1/2 -translate-x-1/2 text-muted/50"
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
                if (ev.dataTransfer?.items) {
                  console.log(
                    "drop",
                    ev.dataTransfer.items,
                  );
                  const files = await handleDropItems(
                    ev.dataTransfer.items,
                  );

                  files.forEach((file) => {
                    send(file, {
                      target: client().clientId,
                    });
                  });
                }
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
