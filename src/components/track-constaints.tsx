import { t } from "@/i18n";
import { catchErrorAsync } from "@/libs/catch";
import {
  createMemo,
  createEffect,
  Show,
  createSignal,
} from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import {
  Switch,
  SwitchLabel,
  SwitchControl,
  SwitchThumb,
} from "./ui/switch";
import { Label } from "./ui/label";
import { createDialog } from "./dialogs/dialog";
import { Button } from "./ui/button";
import { makePersisted } from "@solid-primitives/storage";

const getSupportedConstraints = () => {
  return "mediaDevices" in navigator
    ? navigator.mediaDevices.getSupportedConstraints()
    : {};
};

const constraints = getSupportedConstraints();

export const [
  microphoneConstraints,
  setMicrophoneConstraints,
] = makePersisted(
  createStore({
    autoGainControl:
      "autoGainControl" in constraints ? true : undefined,
    echoCancellation:
      "echoCancellation" in constraints ? true : undefined,
    noiseSuppression:
      "noiseSuppression" in constraints ? true : undefined,
    voiceIsolation:
      "voiceIsolation" in constraints ? true : undefined,
  }),
  {
    name: "microphoneConstraints",
    storage: sessionStorage,
  },
);

export const [speakerConstraints, setSpeakerConstraints] =
  makePersisted(
    createStore({
      suppressLocalAudioPlayback:
        "suppressLocalAudioPlayback" in constraints
          ? true
          : undefined,
    }),
    {
      name: "speakerConstraints",
      storage: sessionStorage,
    },
  );

export const [videoConstraints, setVideoConstraints] =
  createStore({
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 60 },
  });

export const createApplyConstraintsDialog = () => {
  const [mediaStream, setMediaStream] =
    createSignal<MediaStream | null>(null);

  createEffect(() => {
    const stream = mediaStream();
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.getConstraints();
      });
    }
  });

  const audioTracks = () => {
    return mediaStream()?.getAudioTracks();
  };

  const microphoneAudioTrack = () => {
    return audioTracks()?.find(
      (track) => track.contentHint === "speech",
    );
  };

  const speakerAudioTrack = () => {
    return audioTracks()?.find(
      (track) => track.contentHint === "music",
    );
  };

  const {
    open: openDialog,
    close,
    Component,
  } = createDialog({
    title: () =>
      t("common.media_selection_dialog.apply_constraints"),
    description: () =>
      t(
        "common.media_selection_dialog.apply_constraints_description",
      ),
    content: () => (
      <div class="flex flex-col gap-2">
        <Show when={microphoneAudioTrack()}>
          {(track) => (
            <div class="flex flex-col gap-2 rounded-md border border-border p-2">
              <Label class="font-bold">
                {t(
                  "common.media_selection_dialog.microphone_constraints",
                )}
              </Label>
              <MicrophoneTrackConstraints track={track()} />
            </div>
          )}
        </Show>
        <Show when={speakerAudioTrack()}>
          {(track) => (
            <div class="flex flex-col gap-2 rounded-md border border-border p-2">
              <Label class="font-bold">
                {t(
                  "common.media_selection_dialog.speaker_constraints",
                )}
              </Label>
              <SpeakerTrackConstraints track={track()} />
            </div>
          )}
        </Show>
      </div>
    ),
  });

  const open = (stream: MediaStream) => {
    setMediaStream(stream);
    openDialog();
  };

  return { open, close, Component };
};

export const SpeakerTrackConstraints = (props: {
  track: MediaStreamTrack;
}) => {
  const capabilities = createMemo(() => {
    const capabilities = props.track.getCapabilities();
    console.log(capabilities);
    return {
      suppressLocalAudioPlayback:
        "suppressLocalAudioPlayback" in capabilities,
    };
  });
  const [enableConstraints, setEnableConstraints] =
    createStore({
      suppressLocalAudioPlayback: false,
    });
  createEffect(() => {
    const track = props.track;
    const constraints = track.getConstraints();
    setEnableConstraints(
      "suppressLocalAudioPlayback",
      !!(constraints as any)?.suppressLocalAudioPlayback,
    );
  });
  const applyConstraints = async (
    name: keyof typeof enableConstraints,
    value: boolean,
  ) => {
    setEnableConstraints(name, value);
    const constraints = props.track.getConstraints() as any;
    const newConstraints = {
      ...constraints,
      [name]: value,
    };
    const [err] = await catchErrorAsync(
      props.track.applyConstraints(newConstraints),
    );
    if (err) {
      console.error(err);
      toast.error(
        `Error applying ${name} constraint: ${err.message}`,
      );
      setEnableConstraints(name, !!constraints[name]);
    }
  };
  return (
    <>
      <Switch
        class="flex items-center justify-between gap-2"
        disabled={
          !capabilities().suppressLocalAudioPlayback
        }
        checked={
          enableConstraints.suppressLocalAudioPlayback
        }
        onChange={(value) => {
          applyConstraints(
            "suppressLocalAudioPlayback",
            value,
          );
        }}
      >
        <SwitchLabel>
          {t(
            "common.media_selection_dialog.constraints.suppress_local_audio_playback",
          )}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
    </>
  );
};

export const MicrophoneTrackConstraints = (props: {
  track: MediaStreamTrack;
}) => {
  const capabilities = createMemo(() => {
    const capabilities = props.track.getCapabilities();
    return {
      noiseSuppression: "noiseSuppression" in capabilities,
      echoCancellation: "echoCancellation" in capabilities,
      autoGainControl: "autoGainControl" in capabilities,
      voiceIsolation: "voiceIsolation" in capabilities,
    };
  });

  const [enableConstraints, setEnableConstraints] =
    createStore({
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
      voiceIsolation: false,
    });
  createEffect(() => {
    const track = props.track;
    const constraints = track.getConstraints();
    setEnableConstraints(
      "noiseSuppression",
      !!constraints.noiseSuppression,
    );
    setEnableConstraints(
      "echoCancellation",
      !!constraints.echoCancellation,
    );
    setEnableConstraints(
      "autoGainControl",
      !!constraints.autoGainControl,
    );
    setEnableConstraints(
      "voiceIsolation",
      !!(constraints as any)?.voiceIsolation,
    );
  });

  const applyConstraints = async (
    name: keyof typeof enableConstraints,
    value: boolean,
  ) => {
    setEnableConstraints(name, value);
    const constraints = props.track.getConstraints() as any;
    const newConstraints = {
      ...constraints,
      [name]: value,
    };
    const [err] = await catchErrorAsync(
      props.track.applyConstraints(newConstraints),
    );
    if (err) {
      console.error(err);
      toast.error(
        `Error applying ${name} constraint: ${err.message}`,
      );
      setEnableConstraints(name, !!constraints[name]);
    }
  };

  return (
    <>
      <Switch
        class="flex items-center justify-between gap-2"
        disabled={!capabilities().autoGainControl}
        checked={enableConstraints.autoGainControl}
        onChange={(value) => {
          applyConstraints("autoGainControl", value);
        }}
      >
        <SwitchLabel>
          {t(
            "common.media_selection_dialog.constraints.auto_gain_control",
          )}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch
        class="flex items-center justify-between gap-2"
        disabled={!capabilities().echoCancellation}
        checked={enableConstraints.echoCancellation}
        onChange={(value) => {
          applyConstraints("echoCancellation", value);
        }}
      >
        <SwitchLabel>
          {t(
            "common.media_selection_dialog.constraints.echo_cancellation",
          )}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch
        class="flex items-center justify-between gap-2"
        disabled={!capabilities().noiseSuppression}
        checked={enableConstraints.noiseSuppression}
        onChange={(value) => {
          applyConstraints("noiseSuppression", value);
        }}
      >
        <SwitchLabel>
          {t(
            "common.media_selection_dialog.constraints.noise_suppression",
          )}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch
        class="flex items-center justify-between gap-2"
        disabled={!capabilities().voiceIsolation}
        checked={enableConstraints.voiceIsolation}
        onChange={(value) => {
          applyConstraints("voiceIsolation", value);
        }}
      >
        <SwitchLabel>
          {t(
            "common.media_selection_dialog.constraints.voice_isolation",
          )}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
    </>
  );
};

export const createPresetSpeakerTrackConstraintsDialog =
  () => {
    return createDialog({
      title: () => t("common.action.settings"),
      content: () => (
        <div class="flex flex-col gap-2 p-2">
          <Switch
            disabled={
              speakerConstraints.suppressLocalAudioPlayback ===
              undefined
            }
            class="flex items-center justify-between gap-2"
            checked={
              speakerConstraints.suppressLocalAudioPlayback
            }
            onChange={(value) => {
              setSpeakerConstraints(
                "suppressLocalAudioPlayback",
                value,
              );
            }}
          >
            <SwitchLabel>
              {t(
                "common.media_selection_dialog.constraints.suppress_local_audio_playback",
              )}
            </SwitchLabel>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
        </div>
      ),
    });
  };

export const createPresetMicrophoneConstraintsDialog =
  () => {
    return createDialog({
      title: () => t("common.action.settings"),
      content: () => (
        <div class="flex flex-col gap-2">
          <Switch
            disabled={
              microphoneConstraints.autoGainControl ===
              undefined
            }
            class="flex items-center justify-between gap-2"
            checked={microphoneConstraints.autoGainControl}
            onChange={(value) =>
              setMicrophoneConstraints(
                "autoGainControl",
                value,
              )
            }
          >
            <SwitchLabel>
              {t(
                "common.media_selection_dialog.constraints.auto_gain_control",
              )}
            </SwitchLabel>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
          <Switch
            disabled={
              microphoneConstraints.echoCancellation ===
              undefined
            }
            class="flex items-center justify-between gap-2"
            checked={microphoneConstraints.echoCancellation}
            onChange={(value) =>
              setMicrophoneConstraints(
                "echoCancellation",
                value,
              )
            }
          >
            <SwitchLabel>
              {t(
                "common.media_selection_dialog.constraints.echo_cancellation",
              )}
            </SwitchLabel>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
          <Switch
            disabled={
              microphoneConstraints.noiseSuppression ===
              undefined
            }
            class="flex items-center justify-between gap-2"
            checked={microphoneConstraints.noiseSuppression}
            onChange={(value) =>
              setMicrophoneConstraints(
                "noiseSuppression",
                value,
              )
            }
          >
            <SwitchLabel>
              {t(
                "common.media_selection_dialog.constraints.noise_suppression",
              )}
            </SwitchLabel>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
          <Switch
            disabled={
              microphoneConstraints.voiceIsolation ===
              undefined
            }
            class="flex items-center justify-between gap-2"
            checked={microphoneConstraints.voiceIsolation}
            onChange={(value) =>
              setMicrophoneConstraints(
                "voiceIsolation",
                value,
              )
            }
          >
            <SwitchLabel>
              {t(
                "common.media_selection_dialog.constraints.voice_isolation",
              )}
            </SwitchLabel>
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
        </div>
      ),
    });
  };
