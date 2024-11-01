import { createDialog } from "@/components/dialogs/dialog";
import { t } from "@/i18n";
import { messageStores } from "@/libs/core/messge";
import {
  ClientInfo,
  Client,
  ClientID,
} from "@/libs/core/type";
import { sessionService } from "@/libs/services/session-service";
import { createMemo, createSignal, Show } from "solid-js";

const clientInfoDialog = () => {
  const [target, setTarget] = createSignal<ClientID | null>(
    null,
  );

  const info = createMemo<ClientInfo | null>(() => {
    return target()
      ? (sessionService.clientInfo[target()!] ?? null)
      : null;
  });
  const client = createMemo<Client | null>(() => {
    return target()
      ? (messageStores.clients.find(
          (client) => client.clientId === target(),
        ) ?? null)
      : null;
  });

  const { open: openDialog, Component } = createDialog({
    title: () =>
      t("common.client_info_dialog.title", {
        name: client()?.name,
      }),
    content: () => (
      <Show
        when={info()}
        fallback={t("common.client_info_dialog.leave")}
      >
        {(info) => (
          <div class="grid grid-cols-3 gap-4 overflow-y-auto">
            <p class="justify-self-end">
              {t("common.client_info_dialog.status")}
            </p>
            <p class="col-span-2">{info()?.onlineStatus}</p>
            <p class="justify-self-end">
              {t("common.client_info_dialog.client_id")}
            </p>
            <p class="col-span-2 text-sm">
              {info().clientId}
            </p>
            <p class="justify-self-end">
              {t("common.client_info_dialog.created_at")}
            </p>
            <p class="col-span-2">
              {new Date(info().createdAt).toLocaleString()}
            </p>

            <div class="col-span-3">
              <pre class="overflow-x-auto font-mono text-xs">
                {JSON.stringify(
                  info().statsReports,
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        )}
      </Show>
    ),
  });

  const open = (clientId: ClientID) => {
    setTarget(clientId);
    openDialog();
  };

  return {
    open,
    Component,
  };
};

export default clientInfoDialog;
