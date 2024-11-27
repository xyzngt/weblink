import { ConnectionBadge } from "@/components/connection-badge";
import { createDialog } from "@/components/dialogs/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n";
import { messageStores } from "@/libs/core/messge";
import { PeerSession } from "@/libs/core/session";
import {
  ClientInfo,
  Client,
  ClientID,
} from "@/libs/core/type";
import { sessionService } from "@/libs/services/session-service";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

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

  const session = createMemo<PeerSession | null>(() => {
    return target()
      ? sessionService.sessions[target()!]
      : null;
  });

  const [stats, setStats] = createSignal<{
    reports: any[];
    candidateType: string | undefined;
  }>({
    reports: [],
    candidateType: undefined,
  });

  const updateStats = async (pc: RTCPeerConnection) => {
    const stats = await pc.getStats();
    const reports: any[] = [];
    let candidateType: string | undefined;
    stats.forEach((report) => {
      reports.push(report);
      if (report.type === "transport") {
        let activeCandidatePair = stats.get(
          report.selectedCandidatePairId,
        ) as RTCIceCandidatePairStats;
        if (!activeCandidatePair) return;
        let remoteCandidate = stats.get(
          activeCandidatePair.remoteCandidateId,
        );
        let localCandidate = stats.get(
          activeCandidatePair.localCandidateId,
        );
        if (
          localCandidate?.candidateType ||
          remoteCandidate?.candidateType
        ) {
          candidateType =
            localCandidate?.candidateType ??
            remoteCandidate?.candidateType;
        }
      }
    });
    setStats({ reports, candidateType });
  };

  let timer: number | undefined;
  onMount(() => {
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      const pc = session()?.peerConnection;
      if (pc) {
        updateStats(pc);
      }
    }, 1000);
    onCleanup(() => {
      window.clearInterval(timer);
      timer = undefined;
    });
  });

  createEffect(() => {
    const pc = session()?.peerConnection;
    if (pc) {
      updateStats(pc);
    }
  });

  const { open: openDialog, Component } = createDialog({
    title: () =>
      t("common.client_info_dialog.title", {
        name: client()?.name,
      }),
    content: () => (
      <div class="grid grid-cols-3 gap-2 overflow-y-auto p-1">
        <div class="col-span-3 flex justify-between gap-2">
          <p>{t("common.client_info_dialog.client_id")}</p>
          <p class="text-sm">{client()?.clientId}</p>
        </div>
        <div class="col-span-3 flex justify-between gap-2">
          <p>{t("common.client_info_dialog.status")}</p>
          <ConnectionBadge client={info() ?? undefined} />
        </div>
        <Show when={info()}>
          {(info) => (
            <>
              <div class="col-span-3 flex justify-between gap-2">
                <p>
                  {t(
                    "common.client_info_dialog.created_at",
                  )}
                </p>
                <p>
                  {new Date(
                    info()?.createdAt ?? 0,
                  ).toLocaleString()}
                </p>
              </div>
              <div class="col-span-3 flex justify-between gap-2">
                <p>
                  {t(
                    "common.client_info_dialog.candidate_type",
                  )}
                </p>
                <p>
                  <Badge variant="outline">
                    {stats().candidateType}
                  </Badge>
                </p>
              </div>
              <div class="col-span-3 flex flex-col gap-1">
                <Label>
                  {t(
                    "common.client_info_dialog.stats_reports",
                  )}
                </Label>
                <Textarea
                  readOnly
                  value={JSON.stringify(
                    stats().reports,
                    null,
                    2,
                  )}
                  class="h-64 w-full overflow-auto text-nowrap font-mono text-xs
                    scrollbar-thin"
                />
              </div>
            </>
          )}
        </Show>
      </div>
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
