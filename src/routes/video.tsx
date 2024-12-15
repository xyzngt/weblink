import {
  Accessor,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  For,
  JSX,
  ParentProps,
  Show,
} from "solid-js";
import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Button,
  ButtonProps,
} from "@/components/ui/button";
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
  IconFullscreen,
  IconMic,
  IconMicOff,
  IconPause,
  IconPictureInPicture,
  IconPictureInPictureOff,
  IconPip,
  IconPipExit,
  IconPlayArrow,
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
import { useAudioPlayer } from "@/components/audio-player";
import {
  useVideoDisplay,
  VideoDisplay,
} from "../components/video-display";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createMediaTracks } from "@/libs/hooks/tracks";
import { createPictureInPicture } from "@/libs/hooks/picture-in-picture";
import { createFullscreen } from "@/libs/hooks/fullscreen";

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

  const { setPlay, playState, hasAudio } = useAudioPlayer();

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
            w-full items-center gap-2 border-b border-border
            bg-background/50 px-4 backdrop-blur sm:top-0"
        >
          <h4 class="h4">
            {t("video.title")}
            {roomStatus.roomId
              ? ` - ${roomStatus.roomId}`
              : ""}
          </h4>
          <div class="flex-1"></div>
          <Show when={hasAudio()}>
            <Tooltip>
              <TooltipTrigger
                as={Button}
                onClick={() => setPlay(!playState())}
                size="icon"
                class="size-8"
                variant={
                  playState() ? "secondary" : "default"
                }
              >
                <Dynamic
                  component={
                    playState()
                      ? IconVolumeUp
                      : IconVolumeOff
                  }
                  class="size-4"
                />
              </TooltipTrigger>
              <TooltipContent>
                {playState()
                  ? t("common.action.mute")
                  : t("common.action.unmute")}
              </TooltipContent>
            </Tooltip>
          </Show>

          <TabsList class="h-8 w-min">
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
            "grid w-full place-content-center gap-2 sm:p-2",
            tab() == "1" ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          <VideoDisplay
            class="aspect-video
              max-h-[calc(100vh-3rem-var(--mobile-header-height))] w-full
              sm:max-h-[calc(100vh-3rem)]"
            stream={localStream()}
            name={`${clientProfile.name} (You)`}
            avatar={clientProfile.avatar ?? undefined}
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
          </VideoDisplay>
          <For
            each={Object.values(
              sessionService.clientInfo,
            ).filter(
              (client) => client.stream !== undefined,
            )}
          >
            {(client) => (
              <VideoDisplay
                class="aspect-video
                  max-h-[calc(100vh-3rem-var(--mobile-header-height))] w-full
                  sm:max-h-[calc(100vh-3rem)]"
                stream={client.stream}
                name={client.name}
                avatar={client.avatar ?? undefined}
                muted={true}
              >
                <RemoteToolbar
                  class={cn(
                    "absolute top-1 flex gap-1",
                    isMobile()
                      ? "right-1"
                      : "left-1/2 -translate-x-1/2",
                  )}
                  client={client}
                />
              </VideoDisplay>
            )}
          </For>
        </div>
      </Tabs>
    </>
  );
}

const FlexButton = (
  props: {
    icon: JSX.Element;
    onClick: () => void;
  } & ButtonProps &
    ParentProps,
) => {
  return (
    <Button
      {...props}
      class="h-8 text-nowrap rounded-full p-2 hover:gap-1
        [&:hover>.grid]:grid-cols-[1fr]"
    >
      {props.icon}
      <Show when={props.children}>
        <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
          <span class="min-w-0">{props.children}</span>
        </p>
      </Show>
    </Button>
  );
};

const RemoteToolbar = (props: {
  client?: ClientInfo;
  class?: string;
}) => {
  const { videoRef, audioTracks } = useVideoDisplay();

  const [muted, setMuted] = createSignal(false);

  const {
    isInPip,
    isThisElementInPip,
    isSupported: isPipSupported,
    requestPictureInPicture,
    exitPictureInPicture,
  } = createPictureInPicture(videoRef);

  createEffect(() => {
    audioTracks().forEach((track) => {
      track.enabled = !muted();
    });
  });

  const {
    isSupported: isFullscreenSupported,
    isFullscreen,
    requestFullscreen,
    exitFullscreen,
    isThisElementFullscreen,
  } = createFullscreen(videoRef);

  return (
    <div
      class={cn(
        "flex gap-1 rounded-full bg-black/50",
        props.class,
      )}
    >
      <Show when={audioTracks().length > 0}>
        <FlexButton
          size="sm"
          variant={muted() ? "default" : "secondary"}
          onClick={() => setMuted(!muted())}
          icon={
            <Dynamic
              component={
                muted() ? IconVolumeOff : IconVolumeUp
              }
              class="size-4"
            />
          }
        >
          {muted()
            ? t("common.action.unmute")
            : t("common.action.mute")}
        </FlexButton>
      </Show>
      <Show when={videoRef()}>
        {(ref) => (
          <>
            <Show when={isFullscreenSupported()}>
              <FlexButton
                icon={<IconFullscreen class="size-4" />}
                onClick={() => {
                  if (isThisElementFullscreen()) {
                    exitFullscreen();
                  } else {
                    requestFullscreen();
                  }
                }}
                variant={
                  isThisElementFullscreen()
                    ? "default"
                    : "secondary"
                }
              >
                {isThisElementFullscreen()
                  ? t("common.action.exit_fullscreen")
                  : isFullscreen()
                    ? t("common.action.switch_fullscreen")
                    : t("common.action.fullscreen")}
              </FlexButton>
            </Show>
            <Show when={isPipSupported()}>
              <FlexButton
                icon={
                  <Dynamic
                    component={
                      isInPip() ? IconPipExit : IconPip
                    }
                    class="size-4"
                  />
                }
                onClick={() => {
                  if (isThisElementInPip()) {
                    exitPictureInPicture();
                  } else {
                    requestPictureInPicture();
                  }
                }}
                variant={
                  isThisElementInPip()
                    ? "default"
                    : "secondary"
                }
              >
                {isThisElementInPip()
                  ? t(
                      "common.action.exit_picture_in_picture",
                    )
                  : isInPip()
                    ? t(
                        "common.action.switch_picture_in_picture",
                      )
                    : t("common.action.picture_in_picture")}
              </FlexButton>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

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

  const tracks = createMediaTracks(
    () => localStream() ?? null,
  );

  const audioTracks = createMemo(() =>
    tracks().filter((track) => track.kind === "audio"),
  );

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
      <FlexButton
        size="sm"
        onClick={async () => {
          const { result } = await openMediaSelection();
          if (result) {
            setDisplayStream(result);
          }
        }}
        icon={<IconScreenShare class="size-4" />}
        variant={localStream() ? "secondary" : "default"}
      >
        {localStream()
          ? t("common.action.change")
          : t("common.action.select")}
      </FlexButton>

      <Show when={speakerAudioTrack()}>
        <FlexButton
          size="sm"
          variant={speakerMuted() ? "default" : "secondary"}
          onClick={() => {
            setSpeakerMuted(!speakerMuted());
          }}
          icon={
            <Dynamic
              component={
                speakerMuted()
                  ? IconVolumeOff
                  : IconVolumeUp
              }
              class="size-4"
            />
          }
        >
          {speakerMuted()
            ? t("common.action.unmute")
            : t("common.action.mute")}
        </FlexButton>
      </Show>

      <Show when={microphoneAudioTrack()}>
        <FlexButton
          size="sm"
          variant={
            microphoneMuted() ? "default" : "secondary"
          }
          onClick={() => {
            setMicrophoneMuted(!microphoneMuted());
          }}
          icon={
            <Dynamic
              component={
                microphoneMuted() ? IconMicOff : IconMic
              }
              class="size-4"
            />
          }
        >
          {microphoneMuted()
            ? t("common.action.unmute")
            : t("common.action.mute")}
        </FlexButton>
      </Show>

      <Show when={audioTracks().length > 0}>
        <FlexButton
          size="sm"
          onClick={() => {
            const stream = localStream();
            if (stream) {
              openApplyConstraintsDialog(stream);
            }
          }}
          variant="secondary"
          icon={<IconSettings class="size-4" />}
        >
          {t("common.action.settings")}
        </FlexButton>
      </Show>

      <Show when={localStream()}>
        <FlexButton
          size="sm"
          onClick={() => closeStream()}
          variant="destructive"
          icon={<IconStopScreenShare class="size-4" />}
        >
          {t("common.action.close")}
        </FlexButton>
      </Show>
    </div>
  );
};
