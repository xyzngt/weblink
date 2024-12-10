import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import { useWebRTC } from "@/libs/core/rtc-context";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import {
  localStream,
  setDisplayStream,
} from "@/libs/stream";
import { devices } from "./setting";
import { sessionService } from "@/libs/services/session-service";
import { t } from "@/i18n";
import {
  Callout,
  CalloutContent,
  CalloutTitle,
} from "@/components/ui/callout";
import { Collapsible } from "@/components/ui/collapsible";
import {
  IconClose,
  IconScreenShare,
  IconStopScreenShare,
  IconVideoCam,
} from "@/components/icons";
import { makePersisted } from "@solid-primitives/storage";

export interface VideoChatProps {}

const constraints = {
  video: {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 60 },
  },
  audio: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  },
} satisfies MediaStreamConstraints;

export default function Video() {
  if (!navigator.mediaDevices) {
    return (
      <div
        class="mx-auto flex min-h-[calc(100%_-_3rem)] flex-col items-center
          justify-center gap-8 p-4"
      >
        <h2 class="max-6-xs text-6xl font-thin uppercase">
          {t("video.no_support")}
        </h2>
        <p class="text-sm text-muted-foreground">
          {t("video.no_support_description")}
        </p>
      </div>
    );
  }

  const { roomStatus, remoteStreams } = useWebRTC();
  const openScreen = async () => {
    const local =
      await navigator.mediaDevices.getDisplayMedia({
        video: {
          ...constraints.video,
        },
        audio: {
          deviceId: devices.speaker?.deviceId,
          ...constraints.audio,
        },
      });

    setDisplayStream(local);
  };

  const openCamera = async () => {
    const local = await navigator.mediaDevices.getUserMedia(
      {
        video: {
          deviceId: devices.camera?.deviceId,
          ...constraints.video,
        },
        audio: {
          deviceId: devices.microphone?.deviceId,
          ...constraints.audio,
        },
      },
    );

    setDisplayStream(local);
  };

  const closeStream = async () => {
    setDisplayStream(null);
  };

  const [showWarning, setShowWarning] = makePersisted(
    createSignal(true),
    {
      name: "video-warning",
      storage: localStorage,
    },
  );

  return (
    <>
      <div
        class="sticky top-[var(--mobile-header-height)] z-10 flex h-12
          w-full items-center justify-between border-b border-border
          bg-background/50 px-4 backdrop-blur sm:top-0"
      >
        <h4 class="h4">
          {t("video.title")}
          {roomStatus.roomId
            ? ` - ${roomStatus.roomId}`
            : ""}
        </h4>
      </div>
      <Show when={showWarning()}>
        <Callout variant="warning" class="relative">
          <CalloutContent>
            The video chat feature is still under
            development and functionality may be unstable.
          </CalloutContent>
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => setShowWarning(false)}
          >
            <IconClose class="size-4" />
          </button>
        </Callout>
      </Show>

      <div
        class="grid w-full grid-cols-1 place-content-center gap-2
          md:grid-cols-2"
      >
        <div class="relative aspect-video w-full overflow-hidden bg-muted">
          <Show
            when={localStream()}
            fallback={
              <div class="absolute inset-0 content-center text-center">
                {t("video.no_stream")}
              </div>
            }
          >
            {(stream) => (
              <video
                ref={(ref) => {
                  createEffect(() => {
                    ref.srcObject = stream();
                  });
                }}
                autoplay
                controls
                muted
                class="absolute inset-0 h-full w-full bg-black object-contain"
              ></video>
            )}
          </Show>
          <Show when={roomStatus.profile}>
            {(info) => (
              <div class="absolute left-1 top-1">
                <Badge
                  variant="outline"
                  class="text-xs text-white mix-blend-difference"
                >
                  Self
                </Badge>
              </div>
            )}
          </Show>
          <div class="absolute left-1/2 top-1 flex -translate-x-1/2 gap-1">
            <Show
              when={navigator.mediaDevices.getDisplayMedia}
            >
              <Button
                size="sm"
                onClick={openScreen}
                class="h-8 text-nowrap rounded-full p-2 hover:gap-1
                  [&:hover>.grid]:grid-cols-[1fr]"
              >
                <IconScreenShare class="size-4" />
                <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
                  <span class="min-w-0">
                    {localStream()
                      ? t("common.action.change")
                      : t("common.action.open")}
                  </span>
                </p>
              </Button>
            </Show>
            <Show when={devices.camera}>
              <Button
                size="sm"
                class="h-8 text-nowrap rounded-full p-2 hover:gap-1
                  [&:hover>.grid]:grid-cols-[1fr]"
                onClick={openCamera}
              >
                <IconVideoCam class="size-4" />
                <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
                  <span class="min-w-0">
                    {localStream()
                      ? t("common.action.change")
                      : t("common.action.open")}
                  </span>
                </p>
              </Button>
            </Show>

            <Show when={localStream()}>
              <Button
                size="sm"
                onClick={closeStream}
                variant="destructive"
                class="h-8 text-nowrap rounded-full p-2 hover:gap-1
                  [&:hover>.grid]:grid-cols-[1fr]"
              >
                <IconStopScreenShare class="size-4" />
                <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
                  <span class="min-w-0">
                    {t("common.action.close")}
                  </span>
                </p>
              </Button>
            </Show>
          </div>
        </div>
        <For
          each={Object.values(
            sessionService.clientInfo,
          ).filter(
            (client) => client.onlineStatus === "online",
          )}
        >
          {(client) => (
            <Show
              when={remoteStreams[client.clientId]}
              // fallback={
              //   <div class="absolute inset-0 content-center text-center">
              //     No Stream
              //   </div>
              // }
            >
              {(stream) => (
                <div class="relative aspect-video w-full overflow-hidden bg-muted">
                  <video
                    autoplay
                    controls
                    ref={(ref) => {
                      createEffect(() => {
                        ref.srcObject = stream();
                      });
                    }}
                    class="absolute inset-0 h-full w-full bg-black object-contain"
                  />
                  <div class="absolute left-1 top-1 flex gap-1">
                    <Badge
                      variant="secondary"
                      class="bg-black/50 text-xs text-white hover:bg-black/80"
                    >
                      {client.name}
                    </Badge>
                    <Show when={client.candidateType}>
                      {(candidateType) => (
                        <Badge
                          variant="secondary"
                          class="bg-black/50 text-xs text-white hover:bg-black/80"
                        >
                          {candidateType()}
                        </Badge>
                      )}
                    </Show>
                  </div>
                </div>
              )}
            </Show>
          )}
        </For>
      </div>
      {/* <div class="h-auto overflow-x-auto text-xs">
          <pre>{JSON.stringify(devices(), null, 2)}</pre>
          <pre>{JSON.stringify(roomStatus, null, 2)}</pre>
          </div> */}
    </>
  );
}
