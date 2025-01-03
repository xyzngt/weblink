import {
  Client,
  ClientID,
  SessionID,
} from "@/libs/core/type";
import { UpdateClientOptions } from "./client/firebase-client-service";
import { EventHandler } from "@/libs/utils/event-emitter";

export type ClientServiceEventMap = {
  "statuschange":
    | "connected"
    | "connecting"
    | "disconnected";
};

export interface ClientService {
  get info(): TransferClient;

  addEventListener<K extends keyof ClientServiceEventMap>(
    event: K,
    callback: EventHandler<ClientServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<
    K extends keyof ClientServiceEventMap,
  >(
    event: K,
    callback: EventHandler<ClientServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;

  createSender: (
    target: ClientID,
  ) => SignalingService | null;
  removeSender: (target: ClientID) => void;

  listenForJoin(
    callback: (client: TransferClient) => void,
  ): void;
  listenForLeave(
    callback: (client: TransferClient) => void,
  ): void;

  createClient(): Promise<void>;
  updateClient(options: UpdateClientOptions): Promise<void>;

  destroy(): void;
}

export type Unsubscribe = () => void;

export type SignalingServiceEventMap = {
  signal: ClientSignal;
  connect: void;
  close: void;
};

export interface SignalingService {
  sendSignal: (signal: RawSignal) => Promise<void>;
  addEventListener<
    K extends keyof SignalingServiceEventMap,
  >(
    event: K,
    callback: EventHandler<SignalingServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;

  removeEventListener<
    K extends keyof SignalingServiceEventMap,
  >(
    event: K,
    callback: EventHandler<SignalingServiceEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;

  clientId: ClientID;
  targetClientId: ClientID;

  destroy: () => void;
}

export interface RawSignal {
  type: string;
  data: any;
}

export interface ClientSignal extends RawSignal {
  clientId: ClientID;
  targetClientId: ClientID | null;
}

export type SendSignalOptions = {
  bocast?: boolean;
};

export interface ClientServiceInitOptions {
  roomId: string;
  password: string | null;
  client: Client;
  websocketUrl?: string;
}

export type TransferClient = Client & { createdAt: number };
