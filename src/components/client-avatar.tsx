import { getInitials } from "@/libs/utils/name";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar";
import { Client } from "@/libs/core/type";
import { PolymorphicProps } from "@kobalte/core";
import { Image } from "@kobalte/core";
import { splitProps, ValidComponent } from "solid-js";
import { cn } from "@/libs/cn";

type ClientAvatarProps<T extends ValidComponent = "span"> =
  PolymorphicProps<
    T,
    Image.ImageRootProps<T> & {
      class?: string | undefined;
      client: Client;
    }
  >;

export const ClientAvatar = <
  T extends ValidComponent = "span",
>(
  props: ClientAvatarProps<T>,
) => {
  const [local, rest] = splitProps(
    props as ClientAvatarProps,
    ["client", "class"],
  );
  return (
    <Avatar class={cn(local.class)} {...rest}>
      <AvatarImage src={local.client.avatar ?? undefined} />
      <AvatarFallback>
        {getInitials(local.client.name)}
      </AvatarFallback>
    </Avatar>
  );
};
