import { Component, Match, Show, Switch } from "solid-js";
import { t } from "@/i18n";
import { sessionService } from "@/libs/services/session-service";
import { createRoomDialog } from "@/components/join-dialog";
import { useWebRTC } from "@/libs/core/rtc-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { clientProfile } from "@/libs/core/store";
import {
  IconEditSquare,
  IconLogin,
  IconLogout,
  IconShare,
} from "@/components/icons";
import { createQRCodeDialog } from "@/components/create-qrcode-dialog";
import { toast } from "solid-sonner";
const Client: Component = (props) => {
  const { joinRoom, roomStatus, leaveRoom } = useWebRTC();
  const {
    open: openRoomDialog,
    Component: RoomDialogComponent,
  } = createRoomDialog();
  const {
    open: openQRCodeDialog,
    Component: QRCodeDialogComponent,
  } = createQRCodeDialog();
  return (
    <>
      <RoomDialogComponent />
      <QRCodeDialogComponent />

      <div
        class="absolute left-1/2 top-1/2 flex max-h-[100vh] w-full max-w-xs
          -translate-x-1/2 -translate-y-1/2 flex-col items-stretch
          gap-2 overflow-hidden rounded-lg border border-border/50
          bg-background/50 p-4 backdrop-blur"
      >
        <Switch>
          <Match
            when={
              sessionService.clientServiceStatus() ===
              "connected"
            }
          >
            <div class="flex flex-col items-center gap-2">
              <p class="text-xl font-bold">
                {t("client.index.after_join.title", {
                  room: roomStatus.roomId,
                })}
              </p>
              <p class="text-sm text-muted-foreground">
                {t("client.index.after_join.description")}
              </p>
            </div>
            <Button
              class="gap-2"
              onClick={() => {
                openQRCodeDialog();
              }}
            >
              <IconShare class="size-6" />
              <span class="w-full text-center">
                {t("client.index.share_room")}
              </span>
            </Button>
            <Button
              variant="outline"
              class="gap-2"
              onClick={() => leaveRoom()}
            >
              <IconLogout class="size-6" />
              <span class="w-full text-center">
                {t("client.index.leave_room")}
              </span>
            </Button>
            <p class="text-xs text-muted-foreground">
              {t("client.index.after_join.tip")}
            </p>
          </Match>
          <Match
            when={
              sessionService.clientServiceStatus() ===
              "connecting"
            }
          >
            <div class="flex flex-col items-center gap-2">
              <p class="text-xl font-bold">
                {t("client.index.connecting.title")}
              </p>
              <p class="text-sm text-muted-foreground">
                {t("client.index.connecting.description")}
              </p>
              <Spinner
                size="lg"
                class="bg-black dark:bg-white"
              />
            </div>
          </Match>
          <Match
            when={
              sessionService.clientServiceStatus() ===
              "disconnected"
            }
          >
            <div class="flex flex-col items-center gap-2">
              <p class="text-xl font-bold">
                {t("client.index.before_join.title")}
              </p>
              <p class="text-sm text-muted-foreground">
                {t("client.index.before_join.description")}
              </p>
            </div>
            <Button
              class="gap-2"
              variant="outline"
              onClick={async () => {
                const { result } = await openRoomDialog();
                if (result) {
                  joinRoom().catch((e) => {
                    console.error(e);
                    toast.error(e.message);
                  });
                }
              }}
            >
              <IconEditSquare class="size-6" />
              <span class="w-full text-center">
                {t("client.index.edit_profile")}
              </span>
            </Button>
            <Show when={!clientProfile.initalJoin}>
              <Button
                class="gap-2"
                onClick={() =>
                  joinRoom().catch((e) => {
                    console.error(e);
                    toast.error(e.message);
                  })
                }
              >
                <IconLogin class="size-6" />
                <span class="w-full text-center">
                  {t("client.index.join_room")}
                </span>
              </Button>
            </Show>
          </Match>
        </Switch>
      </div>
    </>
  );
};

export default Client;
