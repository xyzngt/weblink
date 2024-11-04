import { useColorMode } from "@kobalte/core";
import { clientProfile } from "@/libs/core/store";
import { joinUrl } from "@/components/join-dialog";
import { toast } from "solid-sonner";
import { createDialog } from "@/components/dialogs/dialog";
import { QRCode } from "@/components/qrcode";
import { t } from "@/i18n";
import { Input } from "@/components/ui/input";

export const createQRCodeDialog = () => {
  const { colorMode } = useColorMode();
  const { open, Component: QRCodeDialogComponent } =
    createDialog({
      title: () => t("common.scan_qrcode_dialog.title"),
      description: () => (
        <>
          <span class="text-lg font-bold">
            {clientProfile.name}&nbsp;
          </span>
          <span class="text-sm text-muted-foreground">
            {t("common.scan_qrcode_dialog.invite", {
              room: clientProfile.roomId,
            })}
          </span>
        </>
      ),
      content: () => {
        const url = joinUrl();
        return (
          <div class="flex select-none flex-col items-center gap-2">
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    toast.success(
                      t(
                        "common.notification.link_copy_success",
                      ),
                    );
                  })
                  .catch(() => {
                    toast.error(
                      t("common.notification.copy_failed"),
                    );
                  });
              }}
            >
              <QRCode
                value={url}
                dark={
                  colorMode() === "dark"
                    ? "#ffffff"
                    : "#000000"
                }
                light="#00000000"
                logo={clientProfile.avatar ?? undefined}
                logoShape="circle"
              />
            </div>
            <Input
              class="h-8 w-full max-w-sm select-all whitespace-pre-wrap break-all
                text-xs hover:underline"
              readOnly
              onContextMenu={async (e) => {
                e.preventDefault();
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    toast.success(
                      t(
                        "common.notification.link_copy_success",
                      ),
                    );
                  })
                  .catch(() => {
                    toast.error(
                      t("common.notification.copy_failed"),
                    );
                  });
              }}
              value={joinUrl()}
            />
            <p>
              {t("common.scan_qrcode_dialog.description")}
            </p>
            <p class="mt-2 text-sm text-muted-foreground">
              {t("common.scan_qrcode_dialog.tip")}
            </p>
          </div>
        );
      },
    });
  return { open, Component: QRCodeDialogComponent };
};
