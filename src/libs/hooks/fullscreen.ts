import {
  createSignal,
  createEffect,
  onCleanup,
  Accessor,
} from "solid-js";

type CreateFullscreenResult = {
  isSupported: Accessor<boolean>;
  isFullscreen: Accessor<boolean>;
  isThisElementFullscreen: Accessor<boolean>;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
};

// Store the element currently in fullscreen mode (if any)
const [
  currentFullscreenElement,
  setCurrentFullscreenElement,
] = createSignal<HTMLElement | null>(
  document.fullscreenElement as HTMLElement | null,
);

// Determine if fullscreen is supported
const [isSupported] = createSignal(
  typeof document !== "undefined" &&
    "fullscreenEnabled" in document
    ? document.fullscreenEnabled
    : false,
);

export function createFullscreen(
  element: Accessor<HTMLElement | null | undefined>,
): CreateFullscreenResult {
  // Event handler for when the fullscreen state changes
  const onFullscreenChange = () => {
    setCurrentFullscreenElement(
      document.fullscreenElement as HTMLElement | null,
    );
  };

  // Determine if any element is currently in fullscreen mode
  const isFullscreen = () =>
    currentFullscreenElement() !== null;

  // Determine if the currently passed element is the one in fullscreen mode
  const isThisElementFullscreen = () =>
    currentFullscreenElement() === element();

  // Request the element to enter fullscreen mode
  const requestFullscreen = async () => {
    const el = element();
    if (!el) return;
    if (!isSupported()) {
      console.warn(
        "Current browser does not support fullscreen mode.",
      );
      return;
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        // Safari compatibility handling
        (el as any).webkitRequestFullscreen();
      }
    } catch (error) {
      console.error(
        "Request to enter fullscreen failed:",
        error,
      );
    }
  };

  // Exit fullscreen
  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.error("Exit fullscreen failed:", error);
      }
    }
  };

  // Listen for fullscreen event changes
  // Note: fullscreenchange event is bound to document
  if (typeof document !== "undefined") {
    document.addEventListener(
      "fullscreenchange",
      onFullscreenChange,
    );
    onCleanup(() => {
      document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange,
      );
      exitFullscreen();
    });
  }

  // When the elementAccessor becomes null, if the current element is in fullscreen mode, exit fullscreen
  createEffect(() => {
    const el = element();
    if (!el && isThisElementFullscreen()) {
      exitFullscreen();
    }
  });

  return {
    isSupported,
    isFullscreen,
    isThisElementFullscreen,
    requestFullscreen,
    exitFullscreen,
  };
}
