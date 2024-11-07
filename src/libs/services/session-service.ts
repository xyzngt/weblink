import {
  createStore,
  produce,
  reconcile,
  SetStoreFunction,
} from "solid-js/store";
import { PeerSession } from "../core/session";
import { ClientID, ClientInfo, Client } from "../core/type";
import {
  ClientService,
  TransferClient,
} from "../core/services/type";
import { Accessor, createSignal, Setter } from "solid-js";
import {
  SendClipboardMessage,
  SessionMessage,
  StorageMessage,
} from "../core/messge";
import { ChunkMetaData } from "../cache";
import { v4 } from "uuid";

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
    this.service = cs;
    const controller = new AbortController();
    cs.addEventListener(
      "status-change",
      (ev) => {
        this.setClientServiceStatus(ev.detail);

        if (ev.detail === "disconnected") {
          // this.destoryAllSession();
          controller?.abort();
        }
      },
      { signal: controller.signal },
    );
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

  addClient(client: TransferClient) {
    if (!this.service) {
      console.warn(
        `can not add client, client service not found`,
      );
      return;
    }
    if (this.sessions[client.clientId]) {
      console.log(
        `client ${client.clientId} has already created`,
      );
      return;
    }

    if (this.sessions[client.clientId]) {
      return;
    }

    const polite =
      this.service.info.createdAt < client.createdAt;

    const session = new PeerSession(
      this.service?.getSender(client.clientId),
      {
        polite,
      },
    );

    this.setClientInfo(client.clientId, {
      ...client,
      onlineStatus: "offline",
      messageChannel: false,
    } satisfies ClientInfo);
    this.setSessions(client.clientId, session);

    const controller = new AbortController();
    session.addEventListener(
      "connecting",
      () => {
        this.setClientInfo(
          client.clientId,
          "onlineStatus",
          "connecting",
        );
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "connected",
      () => {
        this.setClientInfo(
          client.clientId,
          "onlineStatus",
          "online",
        );
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "close",
      () => {
        this.setClientInfo(
          client.clientId,
          "onlineStatus",
          "offline",
        );
        controller.abort();
      },
      { signal: controller.signal },
    );

    session.addEventListener(
      "disconnect",
      () => {
        this.setClientInfo(
          client.clientId,
          "onlineStatus",
          "offline",
        );
        session.listen();
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
      "messageChannelChange",
      (ev) => {
        this.setClientInfo(
          client.clientId,
          "messageChannel",
          ev.detail === "ready",
        );
      },
    );

    controller.signal.addEventListener("abort", () => {
      this.destorySession(session.clientId);
    });

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

export const sessionService = new SessionService();
