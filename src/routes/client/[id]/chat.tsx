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
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import {
  createScrollEnd,
  keepBottom,
} from "@/libs/hooks/keep-bottom";
import { cn } from "@/libs/cn";
import DropArea from "@/components/drop-area";
import { FloatingButton } from "@/components/floating-button";
import { createElementSize } from "@solid-primitives/resize-observer";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import {
  SendClipboardMessage,
  messageStores,
  StoreMessage,
} from "@/libs/core/messge";
import { ChatBar } from "@/routes/client/[id]/components/chat-bar";
import { sessionService } from "@/libs/services/session-service";
import {
  IconArrowDownward,
  IconClose,
  IconPlaceItem,
} from "@/components/icons";
import { t } from "@/i18n";
import { toast } from "solid-sonner";
import { PeerSession } from "@/libs/core/session";
import { v4 } from "uuid";
import { appOptions } from "@/options";
import { handleDropItems } from "@/libs/utils/process-file";
import { ClientInfo, Client } from "@/libs/core/type";
import { catchErrorAsync } from "@/libs/catch";
import { ChatMoreMessageButton } from "./components/chat-more-message-button";
import { MessageContent } from "./components/message";
import { ChatHeader } from "./components/chat-header";

export default function ClientPage(
  props: RouteSectionProps,
) {
  const navigate = useNavigate();
  const { sendFile } = useWebRTC();
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

  const [messages, setMessages] = createSignal<
    StoreMessage[]
  >([]);

  const allMessages = createMemo<StoreMessage[]>(
    () =>
      messageStores.messages.filter(
        (message) =>
          message.client === props.params.id ||
          message.target === props.params.id,
      ) ?? [],
  );

  const getMoreMessages = (count: number) => {
    const msgs: StoreMessage[] = [];
    const currentMessages = untrack(messages);
    const totalMessages = untrack(allMessages);

    const tailIndex =
      totalMessages.length - currentMessages.length - 1;
    if (tailIndex < 0) {
      console.warn("no more messages");
      return;
    }
    for (let i = tailIndex; i >= 0; i--) {
      if (msgs.length >= count) break;
      const message = totalMessages[i];
      msgs.push(message);
    }
    setMessages([...msgs.reverse(), ...currentMessages]);
  };

  // load messages after message store is ready
  createEffect(() => {
    if (props.location.pathname) {
      setMessages([]);
    }

    if (messageStores.status() === "ready") {
      getMoreMessages(10);
    }
  });

  // always keep the last message in the message list
  createEffect(() => {
    if (allMessages().length === 0) return;

    const lastMessage =
      allMessages()[allMessages().length - 1];
    if (!lastMessage) return;
    const currentLastMessage =
      messages()[messages().length - 1];
    if (!currentLastMessage) {
      setMessages([lastMessage]);
      return;
    }

    if (lastMessage.id === currentLastMessage.id) return;

    // if delete last message, do nothing
    if (messages().length > 1) {
      const secondLastMessage =
        messages()[messages().length - 2];
      if (secondLastMessage?.id === lastMessage.id) {
        return;
      }
    }

    setMessages([...messages(), lastMessage]);
    toBottom(10, false);
  });
  let toBottom: (
    delay: number | undefined,
    instant: boolean,
  ) => void;
  onMount(() => {
    toBottom = keepBottom(document, enable);
    createEffect(() => {
      if (props.location.pathname !== "/") {
        toBottom(0, true);
        toBottom(100, true);
      }
    });

    createEffect(() => {
      if (
        clientInfo()?.onlineStatus === "online" &&
        enable()
      ) {
        toBottom(100, true);
      }
    });
  });

  const [loaded, setLoaded] = createSignal(false);

  createEffect(() => {
    if (loaded()) {
      toBottom(0, true);
    }
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
          <div class={cn("flex flex-1 flex-col [&>*]:p-2")}>
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
              class="sticky top-[var(--mobile-header-height)] md:top-0 z-10 flex items-center justify-between gap-1
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
                        html: {
                          isCustomSVG: true,
                          inner:
                            '<path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z" id="pswp__icn-download"/>',
                          outlineID: "pswp__icn-download",
                        },
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
                <Show
                  when={
                    messages().length !==
                    allMessages().length
                  }
                >
                  <div class="flex justify-center">
                    <ChatMoreMessageButton
                      onIntersect={() => {
                        const prevScrollHeight =
                          document.documentElement
                            .scrollHeight;

                        getMoreMessages(5);

                        document.documentElement.scrollTop +=
                          document.documentElement
                            .scrollHeight -
                          prevScrollHeight;
                      }}
                    />
                  </div>
                </Show>
                <For each={messages()}>
                  {(message, index) => (
                    <MessageContent
                      message={message}
                      onDelete={() => {
                        console.log(
                          `delete message ${message.id}`,
                        );
                        if (
                          messageStores.deleteMessage(
                            message.id,
                          )
                        ) {
                          setMessages(
                            messages().filter(
                              (m) => m.id !== message.id,
                            ),
                          );
                        }
                      }}
                      onLoad={() => {
                        clearTimeout(loadedTimer);
                        loadedTimer = window.setTimeout(
                          () => {
                            setLoaded(true);
                            if (
                              index() ===
                              messages().length - 1
                            ) {
                              toBottom(100, true);
                            }
                          },
                          100,
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
