import {
  Accessor,
  createEffect,
  createSignal,
} from "solid-js";

export const createMediaTracks = (
  mediaStream: Accessor<MediaStream | null>,
) => {
  const [tracks, setTracks] = createSignal<
    MediaStreamTrack[]
  >(mediaStream()?.getTracks() ?? []);

  createEffect<AbortController | undefined>((prev) => {
    const stream = mediaStream();

    if (prev) prev.abort();

    if (!stream) {
      setTracks([]);
      return;
    }

    const controller = new AbortController();
    stream.addEventListener(
      "addtrack",
      (event) => {
        setTracks((prev) => [...prev, event.track]);
      },
      {
        signal: controller.signal,
      },
    );
    stream.addEventListener(
      "removetrack",
      (event) => {
        setTracks((prev) =>
          prev.filter((track) => track !== event.track),
        );
      },
      {
        signal: controller.signal,
      },
    );
    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        setTracks((prev) =>
          prev.filter((t) => t !== track),
        );
      });
    });
    setTracks(stream.getTracks());
    return controller;
  });

  return tracks;
};
