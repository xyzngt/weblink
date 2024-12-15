import {
  createSignal,
  createEffect,
  onCleanup,
  Accessor,
} from "solid-js";

type CreatePictureInPictureResult = {
  isSupported: Accessor<boolean>;
  isInPip: Accessor<boolean>;
  isThisElementInPip: Accessor<boolean>;
  requestPictureInPicture: () => Promise<void>;
  exitPictureInPicture: () => Promise<void>;
};

// Store the video element currently in PIP mode (if any)
const [currentPipElement, setCurrentPipElement] =
  createSignal<HTMLVideoElement | null>(
    document?.pictureInPictureElement as HTMLVideoElement | null,
  );

// Determine if picture-in-picture is supported
const [isSupported] = createSignal(
  typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document
    ? document.pictureInPictureEnabled
    : false,
);

export function createPictureInPicture(
  videoElement: Accessor<
    HTMLVideoElement | null | undefined
  >,
): CreatePictureInPictureResult {
  // When the video enters PIP, update currentPipElement
  const onEnterPictureInPicture = (event: Event) => {
    const target = event.target as HTMLVideoElement;
    setCurrentPipElement(target);
  };

  // When the video leaves PIP, update currentPipElement
  const onLeavePictureInPicture = () => {
    setCurrentPipElement(null);
  };

  // Determine if there is a video currently in PIP mode
  const isInPip = () => currentPipElement() !== null;

  // Determine if the current incoming video element is the current PIP element
  const isThisElementInPip = () =>
    currentPipElement() === videoElement();

  // Request the incoming video to enter picture-in-picture mode
  const requestPictureInPicture = async () => {
    const videoEle = videoElement();
    if (!videoEle) return;
    if (!isSupported()) {
      console.warn(
        "This browser does not support picture-in-picture.",
      );
      return;
    }
    try {
      await videoEle.requestPictureInPicture();
    } catch (error) {
      console.error(
        "Request to enter picture-in-picture failed:",
        error,
      );
    }
  };

  // Exit picture-in-picture mode
  const exitPictureInPicture = async () => {
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch (error) {
        console.error(
          "Failed to exit picture-in-picture:",
          error,
        );
      }
    }
  };

  // Listen for event bindings and unbindings on the current video element
  createEffect(() => {
    const videoEle = videoElement();
    if (videoEle && isSupported()) {
      videoEle.addEventListener(
        "enterpictureinpicture",
        onEnterPictureInPicture,
      );
      videoEle.addEventListener(
        "leavepictureinpicture",
        onLeavePictureInPicture,
      );

      onCleanup(() => {
        videoEle.removeEventListener(
          "enterpictureinpicture",
          onEnterPictureInPicture,
        );
        videoEle.removeEventListener(
          "leavepictureinpicture",
          onLeavePictureInPicture,
        );
      });
    }
  });

  // When videoAccessor becomes null, if currently in PIP, exit
  createEffect(() => {
    const videoEle = videoElement();
    if (!videoEle && isThisElementInPip()) {
      exitPictureInPicture();
    }
  });

  return {
    isSupported,
    isInPip,
    isThisElementInPip,
    requestPictureInPicture,
    exitPictureInPicture,
  };
}
