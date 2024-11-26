import { t } from "@/i18n";
import { Component, createEffect, onMount } from "solid-js";
import { toast } from "solid-sonner";
import { useRegisterSW } from "virtual:pwa-register/solid";

export const ReloadPrompt: Component = () => {
  onMount(() => {
    const {
      needRefresh: [needRefresh, setNeedRefresh],
      offlineReady: [offlineReady, setOfflineReady],
      updateServiceWorker,
    } = useRegisterSW({
      immediate: true,
      async onRegisteredSW(swScriptUrl, registration) {
        registration &&
          setInterval(async () => {
            // console.log("Checking for sw update");
            await registration.update();
          }, 60 * 1000 /* 60s for testingpurposes */);
      },
      onRegisterError(error) {
        console.error("SW registration error", error);
      },
      onNeedRefresh() {
        toast.info("New version available, click to ", {
          action: {
            label: t("common.action.reload"),
            onClick: () => updateServiceWorker(true),
          },
        });
      },
      onOfflineReady() {
        console.log("App ready to work offline");
      },
    });
  });

  return <></>;
};
