import {
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";

const MOBILE_BREAKPOINT = 768;

export function createIsMobile() {
  const [isMobile, setIsMobile] = createSignal<boolean>(
    window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    ).matches,
  );

  createEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    onCleanup(() => {
      mql.removeEventListener("change", onChange);
    });
  }, []);

  return isMobile;
}
