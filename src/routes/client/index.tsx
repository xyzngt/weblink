import { Component, Match, Switch } from "solid-js";
import { t } from "@/i18n";
import { sessionService } from "@/libs/services/session-service";
import Logo from "../../../public/favicon.svg?component-solid";
const Client: Component = (props) => {
  return (
    <div class="relative h-full w-full">
      <Switch>
        <Match
          when={
            sessionService.clientServiceStatus() ===
            "connected"
          }
        >
          <div
            class="absolute left-1/2 top-1/2 flex -translate-x-1/2
              -translate-y-1/2 flex-col items-center gap-2 rounded-lg p-4
              opacity-50"
          >
            <Logo class="size-36" />
          </div>
        </Match>{" "}
        *
        <Match
          when={
            sessionService.clientServiceStatus() ===
            "disconnected"
          }
        >
          <div
            class="absolute left-1/2 top-1/2 flex -translate-x-1/2
              -translate-y-1/2 flex-col items-center p-4 text-center
              backdrop-blur"
          >
            <div class="flex flex-col items-center gap-2">
              <p class="text-xl font-bold">
                {t("chat.index.guide_title")}
              </p>
              <p class="text-sm">
                {t("chat.index.guide_description")}
              </p>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
};

export default Client;
