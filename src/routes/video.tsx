import {
  Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  ParentProps,
  Show,
} from "solid-js";
import { useWebRTC } from "@/libs/core/rtc-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  localStream,
  setDisplayStream,
} from "@/libs/stream";
import { sessionService } from "@/libs/services/session-service";
import { t } from "@/i18n";
import {
  Callout,
  CalloutContent,
} from "@/components/ui/callout";
import {
  IconClose,
  IconCropSquare,
  IconMic,
  IconMicOff,
  IconScreenShare,
  IconSettings,
  IconStopScreenShare,
  IconVolumeOff,
  IconVolumeUp,
  IconVolumeUpFilled,
  IconWindow,
} from "@/components/icons";
import { makePersisted } from "@solid-primitives/storage";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/libs/cn";
import { ClientInfo } from "@/libs/core/type";
import { createIsMobile } from "@/libs/hooks/create-mobile";
import { Dynamic } from "solid-js/web";
import { createCheckVolume } from "@/libs/hooks/check-volume";
import { createMediaSelectionDialog } from "@/components/media-selection-dialog";
import { createStore } from "solid-js/store";
import { clientProfile } from "@/libs/core/store";
import { createApplyConstraintsDialog } from "@/components/track-constaints";

export default function Video() {
  if (!("mediaDevices" in navigator)) {
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

  const { roomStatus } = useWebRTC();

  const [showWarning, setShowWarning] = makePersisted(
    createSignal(true),
    {
      name: "video-warning",
      storage: localStorage,
    },
  );
  const isMobile = createIsMobile();

  const [tab, setTab] = createSignal(
    isMobile() ? "1" : "2",
  );

  createEffect(() => {
    setTab(isMobile() ? "1" : "2");
  });

  return (
    <>
      <Tabs
        value={tab()}
        onChange={(value) => setTab(value)}
        class="flex size-full flex-col"
        defaultValue="2"
      >
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
          <TabsList class="w-min">
            <TabsTrigger value="2">
              <IconWindow class="size-4" />
            </TabsTrigger>
            <TabsTrigger value="1">
              <IconCropSquare class="size-4" />
            </TabsTrigger>
            <TabsIndicator />
          </TabsList>
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
          class={cn(
            "grid w-full place-content-center gap-2",
            tab() == "1" ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          <VideoItem
            stream={localStream()}
            name={`${clientProfile.name} (You)`}
            muted={true}
          >
            <LocalToolbar
              client={roomStatus.profile ?? undefined}
              class={cn(
                "absolute top-1 flex gap-1",
                isMobile()
                  ? "right-1"
                  : "left-1/2 -translate-x-1/2",
              )}
            />
          </VideoItem>
          <For
            each={Object.values(
              sessionService.clientInfo,
            ).filter(
              (client) => client.stream !== undefined,
            )}
          >
            {(client) => (
              <VideoItem
                stream={client.stream}
                name={client.name}
              />
            )}
          </For>
        </div>
      </Tabs>
    </>
  );
}

const LocalToolbar = (props: {
  client?: ClientInfo;
  class?: string;
}) => {
  const closeStream = async () => {
    setDisplayStream(null);
  };

  const {
    open: openMediaSelection,
    Component: MediaSelectionDialogComponent,
  } = createMediaSelectionDialog();

  const {
    open: openApplyConstraintsDialog,
    Component: ApplyConstraintsDialogComponent,
  } = createApplyConstraintsDialog();

  const audioTracks = createMemo(() => {
    const stream = localStream();
    return stream?.getAudioTracks();
  });

  const microphoneAudioTrack = createMemo(() => {
    return (
      audioTracks()?.find((track) => {
        return track.contentHint === "speech";
      }) ?? null
    );
  });

  const speakerAudioTrack = createMemo(() => {
    return (
      audioTracks()?.find((track) => {
        return track.contentHint === "music";
      }) ?? null
    );
  });

  const [microphoneMuted, setMicrophoneMuted] =
    createSignal(false);
  const [speakerMuted, setSpeakerMuted] =
    createSignal(false);

  createEffect(() => {
    const track = microphoneAudioTrack();
    if (track) {
      track.enabled = !microphoneMuted();
    }
  });

  createEffect(() => {
    const track = speakerAudioTrack();
    if (track) {
      track.enabled = !speakerMuted();
    }
  });

  return (
    <div
      class={cn(
        "flex gap-1 rounded-full bg-black/50",
        props.class,
      )}
    >
      <MediaSelectionDialogComponent />
      <ApplyConstraintsDialogComponent />
      <Button
        size="sm"
        onClick={async () => {
          const { result } = await openMediaSelection();
          if (result) {
            setDisplayStream(result);
          }
        }}
        variant={localStream() ? "secondary" : "default"}
        class="h-8 text-nowrap rounded-full p-2 hover:gap-1
          [&:hover>.grid]:grid-cols-[1fr]"
      >
        <IconScreenShare class="size-4" />
        <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
          <span class="min-w-0">
            {localStream()
              ? t("common.action.change")
              : t("common.action.select")}
          </span>
        </p>
      </Button>

      <Show when={speakerAudioTrack()}>
        <Button
          size="sm"
          class="h-8 text-nowrap rounded-full p-2 hover:gap-1
            [&:hover>.grid]:grid-cols-[1fr]"
          variant={speakerMuted() ? "default" : "secondary"}
          onClick={() => {
            setSpeakerMuted(!speakerMuted());
          }}
        >
          <Dynamic
            component={
              speakerMuted() ? IconVolumeOff : IconVolumeUp
            }
            class="size-4"
          />
          <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
            <span class="min-w-0">
              {speakerMuted()
                ? t("common.action.unmute")
                : t("common.action.mute")}
            </span>
          </p>
        </Button>
      </Show>

      <Show when={microphoneAudioTrack()}>
        <Button
          size="sm"
          class="h-8 text-nowrap rounded-full p-2 hover:gap-1
            [&:hover>.grid]:grid-cols-[1fr]"
          variant={
            microphoneMuted() ? "default" : "secondary"
          }
          onClick={() => {
            setMicrophoneMuted(!microphoneMuted());
          }}
        >
          <Dynamic
            component={
              microphoneMuted() ? IconMicOff : IconMic
            }
            class="size-4"
          />
          <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
            <span class="min-w-0">
              {microphoneMuted()
                ? t("common.action.unmute")
                : t("common.action.mute")}
            </span>
          </p>
        </Button>
      </Show>

      <Show when={audioTracks()}>
        <Button
          class="h-8 text-nowrap rounded-full p-2 hover:gap-1
            [&:hover>.grid]:grid-cols-[1fr]"
          size="sm"
          onClick={() => {
            const stream = localStream();
            if (stream) {
              openApplyConstraintsDialog(stream);
            }
          }}
          variant="secondary"
        >
          <IconSettings class="size-4" />
          <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
            <span class="min-w-0">
              {t("common.action.settings")}
            </span>
          </p>
        </Button>
      </Show>

      <Show when={localStream()}>
        <Button
          size="sm"
          onClick={() => closeStream()}
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
  );
};

const VideoItem = (
  props: {
    stream: MediaStream | null | undefined;
    name: string;
    muted?: boolean;
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

  return (
    <div
      class="relative aspect-video
        max-h-[calc(100vh-3rem-var(--mobile-header-height))] w-full
        overflow-hidden bg-muted sm:max-h-[calc(100vh-3rem)]"
    >
      <Show
        when={props.stream}
        fallback={
          <div class="absolute inset-0 content-center text-center">
            no stream
          </div>
        }
      >
        <video
          autoplay
          controls
          muted={props.muted}
          class="absolute inset-0 size-full bg-black object-contain"
          ref={(ref) => {
            createEffect(() => {
              ref && (ref.srcObject = props.stream ?? null);
            });
          }}
        />
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
