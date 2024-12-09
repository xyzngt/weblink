import {
  For,
  createMemo,
  createEffect,
  Show,
  createSignal,
  ComponentProps,
} from "solid-js";
import { cn } from "@/libs/cn";

import {
  RouteSectionProps,
  useCurrentMatches,
  useNavigate,
} from "@solidjs/router";
import { ClientID, ClientInfo } from "@/libs/core/type";

import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";

import { createIsMobile } from "@/libs/hooks/create-mobile";
import { makePersisted } from "@solid-primitives/storage";
import { IconPerson } from "@/components/icons";
import { messageStores } from "@/libs/core/messge";
import { t } from "@/i18n";
import { sessionService } from "@/libs/services/session-service";
import { appOptions } from "@/options";
import { UserItem } from "./components/client-list-item";

export interface UserItemProps
  extends ComponentProps<"li"> {
  client: ClientInfo;
  collapsed: boolean;
}

export default function Home(props: RouteSectionProps) {
  const isMobile = createIsMobile();
  const navigate = useNavigate();
  const matches = useCurrentMatches();
  const [size, setSize] = makePersisted(
    createSignal<number[]>(),
    {
      storage: sessionStorage,
      name: "resizable-sizes",
    },
  );
  createEffect(() => {
    if (isMobile()) {
      if (matches()[matches().length - 1].path === "/") {
        setSize([1, 0]);
      } else {
        setSize([1]);
      }
    }
  });

  createEffect(() => {
    const clientId = appOptions.redirectToClient;
    if (!clientId) return;

    const clientInfo = sessionService.clientInfo[clientId];
    if (clientInfo) {
      navigate(`/client/${clientId}/chat`, {
        replace: true,
      });
    }
  });

  const getLastMessage = (clientId: ClientID) =>
    messageStores.messages.findLast(
      (message) =>
        message.client === clientId ||
        message.target === clientId,
    );

  const clntWithLastMsg = createMemo(() => {
    return messageStores.clients
      .map((client) => {
        return {
          client,
          message: getLastMessage(client.clientId),
          clientInfo: sessionService.clientInfo[
            client.clientId
          ] as ClientInfo | undefined,
        };
      })
      .toSorted((c1, c2) => {
        const c1Online =
          c1.clientInfo?.onlineStatus === "online";
        const c2Online =
          c2.clientInfo?.onlineStatus === "online";
        if (c1Online && !c2Online) return -1;
        if (!c1Online && c2Online) return 1;

        return (
          (c2.message?.createdAt ?? 0) -
          (c1.message?.createdAt ?? 0)
        );
      });
  });

  return (
    <Resizable
      sizes={size()}
      onSizesChange={(sizes) => setSize(sizes)}
    >
      <Show
        when={
          !isMobile() ||
          matches()[matches().length - 1].path === "/"
        }
      >
        <ResizablePanel
          class={cn(
            `bg-background/80 backdrop-blur
            data-[collapsed]:transition-all data-[collapsed]:ease-in-out`,
          )}
          collapsible
          initialSize={0.2}
          maxSize={0.3}
          minSize={0.15}
        >
          {(props) => {
            createEffect(() => {
              if (
                props.collapsed &&
                matches()[matches().length - 1].path === "/"
              ) {
                props.expand();
              }
            });
            return (
              <div
                class="top-0 h-full w-full overflow-x-hidden md:sticky
                  md:max-h-[100vh] md:overflow-y-auto"
              >
                <ul
                  class={cn(
                    "flex h-full w-full flex-col [&>li]:py-1",
                    props.collapsed
                      ? ""
                      : "divide-y divide-muted",
                  )}
                >
                  <For
                    each={clntWithLastMsg()}
                    fallback={
                      <div class="relative h-full w-full overflow-hidden">
                        <div
                          class="absolute left-1/2 top-1/2 flex w-1/2 -translate-x-1/2
                            -translate-y-1/2 flex-col items-center"
                        >
                          <IconPerson class="text-muted/10" />
                          <p class="text-xs text-muted-foreground md:hidden">
                            {t("client.index.mobile_tip")}
                          </p>
                        </div>
                      </div>
                    }
                  >
                    {({ client, message }) => (
                      <UserItem
                        message={message}
                        client={client}
                        collapsed={props.collapsed}
                      />
                    )}
                  </For>
                </ul>
              </div>
            );
          }}
        </ResizablePanel>
      </Show>
      <Show when={!isMobile()}>
        <ResizableHandle withHandle />
      </Show>

      <Show
        when={
          !isMobile() ||
          matches()[matches().length - 1].path !== "/"
        }
      >
        <ResizablePanel
          class="relative"
          minSize={0.7}
          initialSize={0.8}
        >
          {(resizeProps) => {
            createEffect(() => {
              if (!isMobile() && (size()?.[1] ?? 0) < 0.7) {
                resizeProps.resize(0.7);
              }
            });

            return <>{props.children}</>;
          }}
        </ResizablePanel>
      </Show>
    </Resizable>
  );
}
