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

const getSupportedConstraints = () => {
  return "mediaDevices" in navigator
    ? navigator.mediaDevices.getSupportedConstraints()
    : {};
};

const constraints = getSupportedConstraints();

export const [
  microphoneConstraints,
  setMicrophoneConstraints,
] = createStore({
  autoGainControl:
    "autoGainControl" in constraints ? true : undefined,
  echoCancellation:
    "echoCancellation" in constraints ? true : undefined,
  noiseSuppression:
    "noiseSuppression" in constraints ? true : undefined,
  voiceIsolation:
    "voiceIsolation" in constraints ? true : undefined,
});

export const [speakerConstraints, setSpeakerConstraints] =
  createStore({});

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
    content: () => (
      <Show when={microphoneAudioTrack()}>
        {(track) => (
          <div class="flex flex-col gap-2 p-2">
            <Label>
              {t(
                "common.media_selection_dialog.microphone_constraints",
              )}
            </Label>
            <TrackConstraints track={track()} />
          </div>
        )}
      </Show>
    ),
  });

  const open = (stream: MediaStream) => {
    setMediaStream(stream);
    openDialog();
  };

  return { open, close, Component };
};

export const TrackConstraints = (props: {
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
      !!(constraints as any).voiceIsolation,
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
        disabled={!capabilities().autoGainControl}
        class="flex items-center justify-between gap-2"
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
        disabled={!capabilities().echoCancellation}
        class="flex items-center justify-between gap-2"
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
        disabled={!capabilities().noiseSuppression}
        class="flex items-center justify-between gap-2"
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
        disabled={!capabilities().voiceIsolation}
        class="flex items-center justify-between gap-2"
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

export const createPresetMicrophoneConstraintsDialog = () => {
  const { open, close, Component } = createDialog({
    title: () =>
      t("common.media_selection_dialog.preset_constraints"),
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
    confirm: (
      <Button onClick={() => close()}>
        {t("common.action.apply")}
      </Button>
    ),
  });

  return { open, close, Component };
};
