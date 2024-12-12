import {
  createEffect,
  createRoot,
  createSignal,
  untrack,
} from "solid-js";

const [streamLocal, setLocalStream] =
  createSignal<MediaStream | null>(null);

export const localStream = streamLocal;

export const [displayStream, setDisplayStream] =
  createSignal<MediaStream | null>();

createRoot(() => {
  createEffect(() => {
    const currentStream = untrack(localStream);

    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });

      setLocalStream(null);
    }

    const display = displayStream();
    if (display) {
      display.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
      });
      display.getVideoTracks().forEach((track) => {
        track.contentHint = "motion";
      });

      display.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          console.log(
            `display stream remove track`,
            track.id,
          );
          display.removeTrack(track);
          if (display.getTracks().length === 0) {
            setLocalStream(null);
          }
        });
      });

      setLocalStream(display);
    }
  });
});
