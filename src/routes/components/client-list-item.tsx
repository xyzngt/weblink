import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Component,
  ComponentProps,
  splitProps,
  createMemo,
  Switch,
  Match,
  Show,
} from "solid-js";
import { cn } from "@/libs/cn";
import { A } from "@solidjs/router";
import { Client, ClientInfo } from "@/libs/core/type";
import {
  messageStores,
  StoreMessage,
} from "@/libs/core/messge";
import { PortableContextMenu } from "@/components/portable-contextmenu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  IconAudioFileFilled,
  IconDelete,
  IconDraftFilled,
  IconFolderMatch,
  IconPhotoFilled,
  IconStorage,
  IconVideoFileFilled,
} from "@/components/icons";

import { sessionService } from "@/libs/services/session-service";
import { createComfirmDeleteClientDialog } from "@/components/box/confirm-delete-dialog";
import { t } from "@/i18n";
import { createTimeAgo } from "@/libs/utils/timeago";
import { getInitials } from "@/libs/utils/name";
import { ConnectionBadge } from "./connection-badge";

export interface UserItemProps
  extends ComponentProps<"li"> {
  client: Client;
  collapsed: boolean;
  message?: StoreMessage;
}

export const UserItem: Component<UserItemProps> = (
  props,
) => {
  const [local, other] = splitProps(props, [
    "client",
    "collapsed",
    "class",
  ]);

  const clientInfo = createMemo<ClientInfo | undefined>(
    () => sessionService.clientInfo[local.client.clientId],
  );

  const { open, Component } =
    createComfirmDeleteClientDialog();

  const renderLastMessage = () => {
    switch (props.message?.type) {
      case "text": {
        return (
          <p class="muted line-clamp-2 break-all">
            {props.message.data}
          </p>
        );
      }
      case "file": {
        return (
          <div class="muted line-clamp-2 break-all">
            <div class="space-x-1 [&>*]:align-middle [&_*]:inline [&_svg]:size-4">
              <Switch
                fallback={
                  <>
                    <span>
                      <IconDraftFilled />
                    </span>
                    <span>{props.message.fileName}</span>
                  </>
                }
              >
                <Match
                  when={props.message.mimeType?.startsWith(
                    "image",
                  )}
                >
                  <>
                    <span>
                      <IconPhotoFilled />
                    </span>
                    <span>{props.message.fileName}</span>
                  </>
                </Match>
                <Match
                  when={props.message.mimeType?.startsWith(
                    "video",
                  )}
                >
                  <>
                    <span>
                      <IconVideoFileFilled />
                    </span>
                    <span>{props.message.fileName}</span>
                  </>
                </Match>
                <Match
                  when={props.message.mimeType?.startsWith(
                    "audio",
                  )}
                >
                  <>
                    <span>
                      <IconAudioFileFilled />
                    </span>
                    <span>{props.message.fileName}</span>
                  </>
                </Match>
              </Switch>
            </div>
          </div>
        );
      }
      default: {
        return <></>;
      }
    }
  };

  return (
    <>
      <Component />
      <PortableContextMenu
        menu={(close) => (
          <>
            <ContextMenuItem
              as={A}
              href={`/client/${local.client.clientId}/sync`}
              class="gap-2"
              onSelect={() => {
                close();
              }}
            >
              <IconFolderMatch class="size-4" />
              {t("client.sync.title")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              class="gap-2"
              onSelect={async () => {
                if (!(await open()).cancel) {
                  messageStores.deleteClient(
                    local.client.clientId,
                  );
                }
                close();
              }}
            >
              <IconDelete class="size-4" />
              {t("common.action.delete")}
            </ContextMenuItem>
          </>
        )}
      >
        {(p) => (
          <li
            class={cn(
              "flex w-full flex-col transition-colors hover:bg-muted/50",
            )}
            {...p}
          >
            <A
              class="flex gap-2 px-2 transition-colors hover:cursor-pointer
                sm:px-1"
              href={`/client/${local.client.clientId}/chat`}
            >
              <Avatar
                class={cn(
                  "self-center",
                  local.collapsed ? "size-12" : "size-10",
                )}
              >
                <AvatarImage
                  src={local.client.avatar ?? undefined}
                />
                <AvatarFallback>
                  {getInitials(local.client.name)}
                </AvatarFallback>
              </Avatar>
              <Show when={!local.collapsed}>
                <div class="w-full flex-1 space-y-1">
                  <p class="flex w-full flex-wrap items-center justify-between gap-2">
                    <span class="line-clamp-1 text-ellipsis font-bold">
                      {props.client.name}
                    </span>
                    <ConnectionBadge
                      client={clientInfo()}
                    />
                  </p>
                  {renderLastMessage()}
                  <Show when={props.message?.createdAt}>
                    {(createdAt) => (
                      <span class="muted float-end text-nowrap text-xs">
                        {createTimeAgo(createdAt())}
                      </span>
                    )}
                  </Show>
                </div>
              </Show>
            </A>
          </li>
        )}
      </PortableContextMenu>
    </>
  );
};
