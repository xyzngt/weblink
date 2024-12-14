import {
  IconVideoCamOff,
  IconVolumeUpFilled,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/libs/cn";
import { createCheckVolume } from "@/libs/hooks/check-volume";
import {
  ParentProps,
  Accessor,
  createEffect,
  createMemo,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { ClientAvatar } from "./client-avatar";

export const VideoDisplay = (
  props: {
    class?: string;
    stream: MediaStream | null | undefined;
    name: string;
    muted?: boolean;
    avatar?: string;
  } & ParentProps,
) => {
  const [speaking, setSpeaking] = createStore<
    Array<[string, Accessor<boolean>]>
  >([]);

  createEffect(() => {
    const remoteTracks = props.stream
      ?.getAudioTracks()
      .map((track) => {
        return [
          track.contentHint,
          createCheckVolume(() => new MediaStream([track])),
        ] as [string, Accessor<boolean>];
      });
    setSpeaking(remoteTracks ?? []);
  });

  const anySpeaking = createMemo(() => {
    return speaking.some(([_, speak]) => speak());
  });

  const videoTrack = createMemo(() => {
    return props.stream?.getVideoTracks()[0];
  });

  return (
    <div
      class={cn(
        "relative overflow-hidden rounded-lg bg-muted",
        props.class,
      )}
    >
      <Show
        when={props.stream}
        fallback={
          <IconVideoCamOff
            class="absolute left-1/2 top-1/2 size-1/2 -translate-x-1/2
              -translate-y-1/2 text-muted-foreground/10"
          />
        }
      >
        <Show
          when={videoTrack()}
          fallback={
            <ClientAvatar
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              avatar={props.avatar}
              name={props.name}
            />
          }
        >
          <video
            autoplay
            muted={props.muted}
            class="absolute inset-0 size-full bg-black object-contain"
            ref={(ref) => {
              createEffect(() => {
                ref &&
                  (ref.srcObject = props.stream ?? null);
              });
            }}
          />
        </Show>
      </Show>
      <div class="absolute left-1 top-1 flex gap-1">
        <Badge
          variant="secondary"
          class="gap-1 bg-black/50 text-xs text-white hover:bg-black/80"
        >
          {props.name}
          <IconVolumeUpFilled
            class={cn(
              "size-4",
              anySpeaking() ? "block" : "hidden",
            )}
          />
        </Badge>
      </div>
      {props.children}
    </div>
  );
};
