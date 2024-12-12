import {
  createEffect,
  createMemo,
  createSignal,
  Show,
} from "solid-js";
import { createDialog } from "./dialogs/dialog";
import {
  IconMicFilled,
  IconMonitor,
  IconVideoCam,
  IconVolumeOff,
} from "./icons";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { createStore } from "solid-js/store";
import { Button } from "./ui/button";
import {
  createSpeakers,
  createMicrophones,
  createCameras,
} from "@/libs/utils/devices";
import { catchErrorAsync } from "@/libs/catch";
import { toast } from "solid-sonner";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { createPermission } from "@solid-primitives/permission";
import {
  Switch,
  SwitchControl,
  SwitchLabel,
  SwitchThumb,
} from "./ui/switch";
import { t } from "@/i18n";
import { createIsMobile } from "@/libs/hooks/create-mobile";
import { localStream } from "@/libs/stream";

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

export type MediaDeviceInfoType = {
  label: string;
  deviceId: string;
};

export const [devices, setDevices] = createStore<{
  camera: MediaDeviceInfoType | null;
  microphone: MediaDeviceInfoType | null;
  speaker: MediaDeviceInfoType | null;
}>({
  camera: null,
  microphone: null,
  speaker: null,
});

const [enableScreen, setEnableScreen] = createSignal(true);
const [enableScreenSpeaker, setEnableScreenSpeaker] =
  createSignal(true);
const [enableScreenMicrophone, setEnableScreenMicrophone] =
  createSignal(false);

const [enableUserMicrophone, setEnableUserMicrophone] =
  createSignal(true);
const [enableUserCamera, setEnableUserCamera] =
  createSignal(true);

export const createMediaSelectionDialog = () => {
  const [stream, setStream] =
    createSignal<MediaStream | null>(null);

  const audioTrack = () => {
    return stream()?.getAudioTracks();
  };

  const cameras = createCameras();
  const microphones = createMicrophones();
  const speakers = createSpeakers();

  const canGetUserMedia = createMemo(() => {
    return navigator.mediaDevices.getUserMedia;
  });

  const canGetDisplayMedia = createMemo(() => {
    return navigator.mediaDevices.getDisplayMedia;
  });

  const cameraPermission = createPermission("camera");
  const microphonePermission =
    createPermission("microphone");

  const availableCameras = createMemo(() => {
    const cams = cameras()
      .filter((cam) => cam.deviceId !== "")
      .map((cam) => ({
        label: cam.label,
        deviceId: cam.deviceId,
      }));

    return cams;
  });

  const availableSpeakers = createMemo(() => {
    const spks = speakers()
      .filter((spk) => spk.deviceId !== "")
      .map((spk) => ({
        label: spk.label,
        deviceId: spk.deviceId,
      }));
    return spks;
  });

  const availableMicrophones = createMemo(() => {
    const mics = microphones()
      .filter((mic) => mic.deviceId !== "")
      .map((mic) => ({
        label: mic.label,
        deviceId: mic.deviceId,
      }));

    return mics;
  });

  const closeStream = () => {
    stream()
      ?.getTracks()
      .forEach((track) => {
        stream()?.removeTrack(track);
        track.stop();
      });
    setStream(null);
  };
  const openScreen = async (
    enableScreen: boolean = true,
    enableSpeaker: boolean = true,
    enableMicrophone: boolean = false,
  ) => {
    const [err, local] = await catchErrorAsync(
      navigator.mediaDevices.getDisplayMedia({
        video: enableScreen
          ? {
              deviceId: devices.camera?.deviceId,
              ...constraints.video,
            }
          : false,
        audio:
          enableSpeaker && speakers().length !== 0
            ? {
                deviceId: devices.speaker?.deviceId,
                ...constraints.audio,
              }
            : false,
      }),
    );
    if (err) {
      toast.error(err.message);
      return;
    }

    local.getAudioTracks().forEach((track) => {
      track.contentHint = "music";
    });

    if (enableMicrophone) {
      const [err, microphoneMedia] = await catchErrorAsync(
        navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: devices.microphone?.deviceId,
            ...constraints.audio,
          },
        }),
      );
      if (err) {
        toast.error(err.message);
      } else {
        const microphoneTrack =
          microphoneMedia.getAudioTracks()[0];
        microphoneTrack.contentHint = "speech";
        local.addTrack(microphoneTrack);
      }
    }

    console.log(`get stream`, local.getAudioTracks());

    setStream(local);
  };
  const openCamera = async (
    enableCamera: boolean = true,
    enableMicrophone: boolean = true,
  ) => {
    const [err, local] = await catchErrorAsync(
      navigator.mediaDevices.getUserMedia({
        video:
          enableCamera && availableCameras().length !== 0
            ? {
                deviceId: devices.camera?.deviceId,
                ...constraints.video,
              }
            : undefined,
        audio:
          enableMicrophone &&
          availableMicrophones().length !== 0
            ? {
                deviceId: devices.microphone?.deviceId,
                ...constraints.audio,
              }
            : undefined,
      }),
    );
    if (err) {
      toast.error(err.message);
      return;
    }

    local.getAudioTracks().forEach((track) => {
      track.contentHint = "speech";
    });

    setStream(local);
  };
  const isMobile = createIsMobile();
  const { open, close, Component, submit } =
    createDialog<MediaStream>({
      title: () => t("common.media_selection_dialog.title"),
      content: () => (
        <Tabs
          class="flex flex-col gap-2 overflow-y-auto"
          defaultValue={isMobile() ? "user" : "screen"}
        >
          <TabsList>
            <TabsTrigger value="screen" class="gap-1">
              <IconMonitor class="size-4" />
              <span>
                {t("common.media_selection_dialog.screen")}
              </span>
            </TabsTrigger>
            <TabsTrigger value="user" class="gap-1">
              <IconVideoCam class="size-4" />
              <span>
                {t(
                  "common.media_selection_dialog.user_media",
                )}
              </span>
            </TabsTrigger>
            <TabsIndicator />
          </TabsList>
          <div
            class="relative aspect-video w-full overflow-hidden rounded-lg
              bg-muted"
          >
            <Show
              when={stream()}
              fallback={
                <Show when={localStream()}>
                  <video
                    ref={(ref) =>
                      (ref.srcObject = localStream())
                    }
                    autoplay
                    controls
                    muted
                    class="absolute inset-0 size-full bg-black object-contain"
                  >
                    Your browser does not support the video
                    tag.
                  </video>

                  <Badge
                    variant="secondary"
                    class="absolute left-2 top-2 bg-black/50 text-white
                      hover:bg-black/80"
                  >
                    {t(
                      "common.media_selection_dialog.current",
                    )}
                  </Badge>
                </Show>
              }
            >
              {(stream) => (
                <>
                  <video
                    ref={(ref) =>
                      (ref.srcObject = stream())
                    }
                    autoplay
                    controls
                    muted
                    class="absolute inset-0 size-full bg-black object-contain"
                  >
                    Your browser does not support the video
                    tag.
                  </video>
                  <Badge
                    variant="secondary"
                    class="absolute left-2 top-2 gap-1 bg-black/50 text-white
                      hover:bg-black/80"
                  >
                    {t(
                      "common.media_selection_dialog.preview",
                    )}
                    <Show when={audioTrack()?.length === 0}>
                      <IconVolumeOff class="size-4" />
                    </Show>
                    <Show when={audioTrack()?.length === 2}>
                      <IconMicFilled class="size-4" />
                    </Show>
                  </Badge>
                </>
              )}
            </Show>
          </div>
          <TabsContent
            value="screen"
            class="flex flex-col gap-2"
          >
            <Show
              when={
                microphones().length !== 0 &&
                microphonePermission() === "prompt"
              }
            >
              <Button
                size="sm"
                class="w-full"
                onClick={async () => {
                  const [err, local] =
                    await catchErrorAsync(
                      navigator.mediaDevices.getUserMedia({
                        audio: true,
                      }),
                    );
                  if (err) {
                    toast.error(err.message);
                    return;
                  }
                  local.getTracks().forEach((track) => {
                    track.stop();
                    local?.removeTrack(track);
                  });
                }}
              >
                {t(
                  "common.media_selection_dialog.request_microphone_permission",
                )}
              </Button>
            </Show>
            <Switch
              class="flex items-center justify-between gap-2"
              checked={enableScreen()}
              onChange={(value) => setEnableScreen(value)}
            >
              <SwitchLabel>
                {t(
                  "common.media_selection_dialog.enable_screen",
                )}
              </SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>
            <Switch
              class="flex items-center justify-between gap-2"
              checked={enableScreenSpeaker()}
              onChange={(value) =>
                setEnableScreenSpeaker(value)
              }
            >
              <SwitchLabel>
                {t(
                  "common.media_selection_dialog.enable_speaker",
                )}
              </SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>
            <Show
              when={
                enableScreenSpeaker() &&
                availableSpeakers().length !== 0
              }
            >
              <Select<MediaDeviceInfoType>
                value={devices.speaker}
                placeholder={
                  <span class="muted">
                    {speakers().length === 0
                      ? t(
                          "common.media_selection_dialog.no_speaker_available",
                        )
                      : t(
                          "common.media_selection_dialog.select_speaker",
                        )}
                  </span>
                }
                onChange={(value) => {
                  setDevices("speaker", value);
                }}
                optionTextValue="label"
                optionValue="deviceId"
                options={availableSpeakers()}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item.rawValue?.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger>
                  <SelectValue<MediaDeviceInfoType>>
                    {(state) =>
                      state.selectedOption().label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>

            <Switch
              class="flex items-center justify-between gap-2"
              disabled={
                availableMicrophones().length === 0 ||
                microphonePermission() !== "granted"
              }
              checked={enableScreenMicrophone()}
              onChange={(value) =>
                setEnableScreenMicrophone(value)
              }
            >
              <SwitchLabel>
                {t(
                  "common.media_selection_dialog.enable_microphone",
                )}
              </SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>
            <Show
              when={
                enableScreenMicrophone() &&
                availableMicrophones().length !== 0 &&
                microphonePermission() === "granted"
              }
            >
              <Select<MediaDeviceInfoType>
                value={devices.microphone}
                placeholder={
                  <span class="muted">
                    {availableMicrophones().length === 0
                      ? t(
                          "common.media_selection_dialog.no_microphone_available",
                        )
                      : t(
                          "common.media_selection_dialog.select_microphone",
                        )}
                  </span>
                }
                onChange={(value) => {
                  setDevices("microphone", value);
                }}
                optionTextValue="label"
                optionValue="deviceId"
                options={availableMicrophones()}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item.rawValue?.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger>
                  <SelectValue<MediaDeviceInfoType>>
                    {(state) =>
                      state.selectedOption().label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>
            <div class="flex gap-2">
              <Show
                when={stream()}
                fallback={
                  <Show when={canGetDisplayMedia()}>
                    <Button
                      size="sm"
                      onClick={() =>
                        openScreen(
                          enableScreen(),
                          enableScreenSpeaker(),
                          enableScreenMicrophone(),
                        )
                      }
                      class="w-full"
                    >
                      {t(
                        "common.media_selection_dialog.open_screen",
                      )}
                    </Button>
                  </Show>
                }
              >
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={closeStream}
                  class="w-full"
                >
                  {t("common.media_selection_dialog.close")}
                </Button>
                <Show when={canGetDisplayMedia()}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      closeStream();
                      openScreen(
                        enableScreen(),
                        enableScreenSpeaker(),
                        enableScreenMicrophone(),
                      );
                    }}
                    class="w-full"
                  >
                    {t(
                      "common.media_selection_dialog.change",
                    )}
                  </Button>
                </Show>
              </Show>
            </div>
          </TabsContent>
          <TabsContent
            value="user"
            class="flex flex-col gap-2"
          >
            <div class="flex gap-2">
              <Show
                when={
                  cameras().length !== 0 &&
                  cameraPermission() === "prompt"
                }
              >
                <Button
                  size="sm"
                  class="w-full"
                  onClick={async () => {
                    const [err, local] =
                      await catchErrorAsync(
                        navigator.mediaDevices.getUserMedia(
                          {
                            video: true,
                          },
                        ),
                      );
                    if (err) {
                      toast.error(err.message);
                      return;
                    }
                    local.getTracks().forEach((track) => {
                      track.stop();
                      local?.removeTrack(track);
                    });
                  }}
                >
                  {t(
                    "common.media_selection_dialog.request_camera_permission",
                  )}
                </Button>
              </Show>
              <Show
                when={
                  microphones().length !== 0 &&
                  microphonePermission() === "prompt"
                }
              >
                <Button
                  size="sm"
                  class="w-full"
                  onClick={async () => {
                    const [err, local] =
                      await catchErrorAsync(
                        navigator.mediaDevices.getUserMedia(
                          {
                            audio: true,
                          },
                        ),
                      );
                    if (err) {
                      toast.error(err.message);
                      return;
                    }
                    local.getTracks().forEach((track) => {
                      track.stop();
                      local?.removeTrack(track);
                    });
                  }}
                >
                  {t(
                    "common.media_selection_dialog.request_microphone_permission",
                  )}
                </Button>
              </Show>
            </div>

            <Switch
              disabled={
                availableCameras().length === 0 ||
                cameraPermission() !== "granted"
              }
              class="flex items-center justify-between gap-2"
              checked={enableUserCamera()}
              onChange={(value) =>
                setEnableUserCamera(value)
              }
            >
              <SwitchLabel>
                {t(
                  "common.media_selection_dialog.enable_camera",
                )}
              </SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>

            <Show
              when={
                enableUserCamera() &&
                availableCameras().length !== 0 &&
                cameraPermission() === "granted"
              }
            >
              <Select<MediaDeviceInfoType>
                value={devices.camera}
                placeholder={
                  <span class="muted">
                    {availableCameras().length === 0
                      ? t(
                          "common.media_selection_dialog.no_camera_available",
                        )
                      : t(
                          "common.media_selection_dialog.select_camera",
                        )}
                  </span>
                }
                onChange={(value) => {
                  setDevices("camera", value);
                }}
                optionTextValue="label"
                optionValue="deviceId"
                options={availableCameras()}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item.rawValue?.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger>
                  <SelectValue<MediaDeviceInfoType>>
                    {(state) =>
                      state.selectedOption().label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>
            <Switch
              disabled={
                availableMicrophones().length === 0 ||
                microphonePermission() !== "granted"
              }
              class="flex items-center justify-between gap-2"
              checked={enableUserMicrophone()}
              onChange={(value) =>
                setEnableUserMicrophone(value)
              }
            >
              <SwitchLabel>
                {t(
                  "common.media_selection_dialog.enable_microphone",
                )}
              </SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>

            <Show
              when={
                enableUserMicrophone() &&
                availableMicrophones().length !== 0 &&
                microphonePermission() === "granted"
              }
            >
              <Select<MediaDeviceInfoType>
                value={devices.microphone}
                placeholder={
                  <span class="muted">
                    {availableMicrophones().length === 0
                      ? t(
                          "common.media_selection_dialog.no_microphone_available",
                        )
                      : t(
                          "common.media_selection_dialog.select_microphone",
                        )}
                  </span>
                }
                onChange={(value) => {
                  setDevices("microphone", value);
                }}
                optionTextValue="label"
                optionValue="deviceId"
                options={availableMicrophones()}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item.rawValue?.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger>
                  <SelectValue<MediaDeviceInfoType>>
                    {(state) =>
                      state.selectedOption().label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>
            <div class="flex gap-2">
              <Show
                when={
                  (availableCameras().length !== 0 &&
                    cameraPermission() === "granted") ||
                  (availableMicrophones().length !== 0 &&
                    microphonePermission() === "granted")
                }
              >
                <Show
                  when={stream()}
                  fallback={
                    <Show when={canGetUserMedia()}>
                      <Button
                        size="sm"
                        class="w-full"
                        onClick={() =>
                          openCamera(
                            enableUserCamera(),
                            enableUserMicrophone(),
                          )
                        }
                      >
                        {t(
                          "common.media_selection_dialog.open_user_media",
                        )}
                      </Button>
                    </Show>
                  }
                >
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={closeStream}
                    class="w-full"
                  >
                    {t(
                      "common.media_selection_dialog.close",
                    )}
                  </Button>
                  <Show when={canGetUserMedia()}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        closeStream();
                        openCamera();
                      }}
                      class="w-full"
                    >
                      {t(
                        "common.media_selection_dialog.change",
                      )}
                    </Button>
                  </Show>
                </Show>
              </Show>
            </div>
          </TabsContent>
        </Tabs>
      ),
      confirm: (
        <Button
          disabled={!stream()}
          onClick={() => submit(stream()!)}
        >
          {t("common.action.confirm")}
        </Button>
      ),
      cancel: (
        <Button variant="secondary" onClick={() => close()}>
          {t("common.action.cancel")}
        </Button>
      ),
      onCancel: () => {
        closeStream();
      },
      onSubmit: () => {
        setStream(null);
      },
    });

  return { open, close, Component };
};
