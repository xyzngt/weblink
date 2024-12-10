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
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  IconAudioFileFilled,
  IconDelete,
  IconDraftFilled,
  IconFolderMatch,
  IconPhotoFilled,
  IconVideoFileFilled,
} from "@/components/icons";

import { sessionService } from "@/libs/services/session-service";
import { createComfirmDeleteClientDialog } from "@/components/box/confirm-delete-dialog";
import { t } from "@/i18n";
import { createTimeAgo } from "@/libs/utils/timeago";
import { getInitials } from "@/libs/utils/name";
import { ConnectionBadge } from "../../components/connection-badge";
import { IconFile } from "@/components/icon-file";

export interface UserItemProps
  extends ComponentProps<"li"> {
  client: Client;
  collapsed: boolean;
  message?: StoreMessage;
}

const MessageData = (props: { message?: StoreMessage }) => {
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
            <IconFile mimetype={props.message.mimeType} />
            <span>{props.message.fileName}</span>
          </div>
        </div>
      );
    }
    default: {
      return <></>;
    }
  }
};

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

  const {
    open: openConfirmDeleteClientDialog,
    Component: ConfirmDeleteClientDialog,
  } = createComfirmDeleteClientDialog();

  return (
    <>
      <ConfirmDeleteClientDialog />
      <PortableContextMenu
        menu={(close) => (
          <ContextMenuGroup>
            <ContextMenuGroupLabel>
              {local.client.name}
            </ContextMenuGroupLabel>
            <ContextMenuSeparator />
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

            <ContextMenuItem
              class="gap-2"
              onSelect={async () => {
                close();
                const result = (
                  await openConfirmDeleteClientDialog(
                    local.client.name,
                  )
                ).result;
                if (!result) return;
                messageStores.deleteClient(
                  local.client.clientId,
                );
              }}
            >
              <IconDelete class="size-4" />
              {t("common.action.delete")}
            </ContextMenuItem>
          </ContextMenuGroup>
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
              <Avatar class="size-10 self-center">
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
                  <MessageData message={props.message} />
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
