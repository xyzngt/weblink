import {
  createEffect,
  createRoot,
  createSignal,
  untrack,
} from "solid-js";
import { reconcile } from "solid-js/store";

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
      display.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          console.log(
            `display stream remove track`,
            track.id,
          );
          display.removeTrack(track);

          setLocalStream(null);
          if (display.getTracks().length > 0) {
            setLocalStream(display);
          }
        });
      });

      setLocalStream(display);
    }
  });

  createEffect(() => {
    console.log(
      "displayStream changed",
      displayStream()?.getTracks(),
    );
  });
});
