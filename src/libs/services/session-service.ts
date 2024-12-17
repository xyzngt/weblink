import {
  createStore,
  produce,
  reconcile,
  SetStoreFunction,
} from "solid-js/store";
import { PeerSession } from "../core/session";
import { ClientID, ClientInfo } from "../core/type";
import {
  ClientService,
  TransferClient,
} from "../core/services/type";
import {
  Accessor,
  createEffect,
  createSignal,
  Setter,
} from "solid-js";
import {
  SendClipboardMessage,
  StorageMessage,
} from "../core/messge";
import { v4 } from "uuid";
import { getIceServers } from "../core/store";
import { appOptions } from "@/options";

class SessionService {
  readonly sessions: Record<ClientID, PeerSession>;
  readonly clientInfo: Record<ClientID, ClientInfo>;
  private setSessions: SetStoreFunction<
    Record<ClientID, PeerSession>
  >;
  private setClientInfo: SetStoreFunction<
    Record<ClientID, ClientInfo>
  >;
  private service?: ClientService;

  get clientService() {
    return this.service;
  }

  clientServiceStatus: Accessor<
    "connecting" | "connected" | "disconnected"
  >;

  private setClientServiceStatus: Setter<
    "connecting" | "connected" | "disconnected"
  >;

  iceServers: Promise<RTCIceServer[]>;

  constructor() {
    const [sessions, setSessions] = createStore<
      Record<ClientID, PeerSession>
    >({});
    this.sessions = sessions;
    this.setSessions = setSessions;
    const [clientInfo, setClientInfo] = createStore<
      Record<ClientID, ClientInfo>
    >({});
    this.clientInfo = clientInfo;
    this.setClientInfo = setClientInfo;
    const [clientServiceStatus, setClientServiceStatus] =
      createSignal<
        "connecting" | "connected" | "disconnected"
      >("disconnected");
    this.clientServiceStatus = clientServiceStatus;
    this.setClientServiceStatus = setClientServiceStatus;

    this.iceServers = getIceServers();
  }

  updateIceServers() {
    this.iceServers = getIceServers();
  }

  setClipboard(message: SendClipboardMessage) {
    this.setClientInfo(
      message.client,
      produce((state) => {
        state.clipboard = [
          ...(state.clipboard ?? []),
          message,
        ];
      }),
    );
  }

  setStorage(message: StorageMessage) {
    this.setClientInfo(
      message.client,
      produce((state) => {
        state.storage = [...(message.data ?? [])];
      }),
    );
  }

  setClientService(cs: ClientService) {
    if (this.service) {
      console.warn(
        `client service already set, destory old service`,
      );
      this.destoryService();
    }
    this.service = cs;

    cs.addEventListener("statuschange", (ev) => {
      this.setClientServiceStatus(ev.detail);
    });
  }

  destoryService() {
    this.service?.destroy();
    this.service = undefined;
  }

  destorySession(target: ClientID) {
    const session = this.sessions[target];
    if (!session) {
      console.log(
        `can not destory session, session ${target} not found`,
      );
      return;
    }
    session.close();
    this.service?.removeSender(target);
    this.setClientInfo(target, undefined!);
    this.setSessions(target, undefined!);
  }

  requestStorage(client: ClientID) {
    const session = this.sessions[client];
    if (!session) {
      return;
    }
    session.sendMessage({
      type: "request-storage",
      id: v4(),
      createdAt: Date.now(),
      client: session.clientId,
      target: session.targetClientId,
    });
  }

  async addClient(client: TransferClient) {
    if (!this.service) {
      throw new Error(
        `can not add client: ${client.clientId}, client service not found`,
      );
    }
    if (this.sessions[client.clientId]) {
      throw new Error(
        `client ${client.clientId} has already created`,
      );
    }
    const polite =
      this.service.info.createdAt < client.createdAt;
    const sender = this.service.createSender(
      client.clientId,
    );
    if (!sender) {
      throw new Error(
        `can not create sender for client: ${client.clientId}`,
      );
    }
    const session = new PeerSession(sender, {
      polite,
      iceServers: await this.iceServers,
      relayOnly:
        appOptions.servers.turns.length > 0 &&
        appOptions.relayOnly,
    });

    this.setClientInfo(client.clientId, {
      ...client,
      onlineStatus: "offline",
      messageChannel: false,
    } satisfies ClientInfo);
    this.setSessions(client.clientId, session);

    const controller = new AbortController();

    session.addEventListener(
      "statuschange",
      (ev) => {
        console.log(`session status change`, ev.detail);
        switch (ev.detail) {
          case "created":
            break;
          case "connecting":
            this.setClientInfo(
              client.clientId,
              "onlineStatus",
              "connecting",
            );
            break;
          case "connected":
            this.setClientInfo(
              client.clientId,
              "onlineStatus",
              "online",
            );
            break;
          case "reconnecting":
            this.setClientInfo(
              client.clientId,
              "onlineStatus",
              "reconnecting",
            );
            break;
          case "disconnected":
            this.setClientInfo(
              client.clientId,
              "onlineStatus",
              "offline",
            );
            break;
          case "closed":
            this.setClientInfo(
              client.clientId,
              "onlineStatus",
              "offline",
            );
            controller.abort();
            this.destorySession(session.clientId);
            break;
        }
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "error",
      (ev) => {
        console.error(
          `session ${client.clientId} error`,
          ev.detail,
        );
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "remotestreamchange",
      (ev) => {
        this.setClientInfo(
          client.clientId,
          "stream",
          reconcile(ev.detail ?? undefined),
        );
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "messagechannelchange",
      (ev) => {
        if (this.clientInfo[client.clientId]) {
          this.setClientInfo(
            client.clientId,
            "messageChannel",
            ev.detail === "ready",
          );
        }
      },
    );

    return session;
  }

  destoryAllSession() {
    Object.values(this.sessions).forEach((session) =>
      session.close(),
    );
    this.setSessions(reconcile({}));
    this.setClientInfo(reconcile({}));

    this.service?.destroy();
    this.service = undefined;
  }
}

let sessionService: SessionService;

createEffect(() => {
  if (sessionService && appOptions.servers.turns) {
    sessionService.updateIceServers();
  }
});

sessionService = new SessionService();

export { sessionService };
