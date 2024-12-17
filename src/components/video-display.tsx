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
  createContext,
  useContext,
  createSignal,
} from "solid-js";
import { createStore } from "solid-js/store";
import { ClientAvatar } from "./client-avatar";
import { createMediaTracks } from "@/libs/hooks/tracks";

const VideoContext = createContext<{
  videoRef: Accessor<HTMLVideoElement | null>;
  videoTrack: Accessor<MediaStreamTrack | null>;
  audioTracks: Accessor<MediaStreamTrack[]>;
}>();

export const useVideoDisplay = () => {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error(
      "useVideoDisplay must be used within a VideoDisplay",
    );
  }
  return context;
};

export const VideoDisplay = (
  props: {
    class?: string;
    stream: MediaStream | null | undefined;
    name: string;
    muted?: boolean;
    avatar?: string;
  } & ParentProps,
) => {
  const stream = createMemo(() => props.stream ?? null);

  const tracks = createMediaTracks(stream);

  const audioTracks = createMemo(() =>
    tracks().filter((track) => track.kind === "audio"),
  );

  const speaking = createMemo(() => {
    return audioTracks().map((track) => {
      return createCheckVolume(
        () => new MediaStream([track]),
      );
    });
  });

  const anySpeaking = createMemo(() => {
    return speaking().some((speak) => speak());
  });

  const videoTrack = createMemo(
    () =>
      tracks().find((track) => track.kind === "video") ??
      null,
  );

  const videoStream = createMemo(() => {
    const track = videoTrack();
    if (!track) return null;
    return new MediaStream([track]);
  });

  const [videoRef, setVideoRef] =
    createSignal<HTMLVideoElement | null>(null);

  createEffect(() => {
    const video = videoRef();
    if (video) {
      video.srcObject = videoStream() ?? null;
    }
  });

  return (
    <VideoContext.Provider
      value={{ videoRef, videoTrack, audioTracks }}
    >
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
            when={videoStream()}
            fallback={
              <ClientAvatar
                class="absolute left-1/2 top-1/2 size-14 -translate-x-1/2
                  -translate-y-1/2"
                avatar={props.avatar}
                name={props.name}
              />
            }
          >
            <video
              autoplay
              muted={props.muted}
              class="absolute inset-0 size-full bg-black object-contain"
              ref={setVideoRef}
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
    </VideoContext.Provider>
  );
};
