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
    const display = displayStream();
    if (currentStream?.id === display?.id) return;

    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        currentStream.removeTrack(track);
        track.stop();
      });
      setLocalStream(null);
    }

    if (display) {
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
