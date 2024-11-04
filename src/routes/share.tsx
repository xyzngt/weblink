import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { ClientInfo } from "@/libs/core/type";
import { sessionService } from "@/libs/services/session-service";
import { getInitials } from "@/libs/utils/name";
import { RouteSectionProps } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
} from "solid-js";

const ShareClientItem = (props: { client: ClientInfo }) => {
  return (
    <li class="flex gap-2">
      <Avatar>
        <AvatarImage
          src={props.client.avatar ?? undefined}
        />
        <AvatarFallback>
          {getInitials(props.client.name)}
        </AvatarFallback>
      </Avatar>
      <p>{props.client.name}</p>
    </li>
  );
};

const Share = (props: RouteSectionProps) => {
  const availableClients = createMemo(() =>
    Object.values(sessionService.clientInfo).filter(
      (client) => client.onlineStatus === "online",
    ),
  );

  return (
    <div class="container flex flex-col gap-2">
      <h2 class="h2">Share</h2>
      <ul>
        <For each={availableClients()}>
          {(item) => <ShareClientItem client={item} />}
        </For>
      </ul>
    </div>
  );
};

export default Share;
