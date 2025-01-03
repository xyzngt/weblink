import {
  EventHandler,
  MultiEventEmitter,
} from "@/libs/utils/event-emitter";
import {
  comparePasswordHash,
  hashPassword,
} from "@/libs/core/utils/encrypt/e2e";
import { WebSocketSignalingService } from "../signaling/ws-signaling-service";
import {
  ClientServiceEventMap,
  RawSignal,
  TransferClient,
} from "../type";
import {
  ClientService,
  ClientServiceInitOptions,
} from "../type";
import { UpdateClientOptions } from "./firebase-client-service";
import { toast } from "solid-sonner";
import {
  catchErrorAsync,
  catchErrorSync,
} from "@/libs/catch";

export class WebSocketClientService
  implements ClientService
{
  private eventEmitter =
    new MultiEventEmitter<ClientServiceEventMap>();
  private roomId: string;
  private password: string | null;
  private client: TransferClient;
  private socket: WebSocket | null = null;
  private controller: AbortController | null = null;
  private signalingServices: Map<
    string,
    WebSocketSignalingService
  > = new Map();

  private eventListeners: Map<string, Array<Function>> =
    new Map();

  private maxReconnectAttempts = 3;
  private reconnectAttempts = 0;
  private reconnectInterval = 3000;
  private websocketUrl: string;
  private status:
    | "created"
    | "connecting"
    | "connected"
    | "disconnected" = "created";

  get info() {
    return this.client;
  }

  constructor({
    roomId,
    password,
    client,
    websocketUrl,
  }: ClientServiceInitOptions) {
    this.roomId = roomId;
    this.password = password;
    this.client = { ...client, createdAt: Date.now() };
    this.websocketUrl =
      websocketUrl ?? import.meta.env.VITE_WEBSOCKET_URL;
  }

  private setStatus(
    status: "connecting" | "connected" | "disconnected",
  ) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent("statuschange", status);
  }

  private dispatchEvent<
    K extends keyof ClientServiceEventMap,
  >(event: K, data: ClientServiceEventMap[K]) {
    return this.eventEmitter.dispatchEvent(event, data);
  }

  addEventListener<K extends keyof ClientServiceEventMap>(
    event: K,
    callback: EventHandler<ClientServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.addEventListener(
      event,
      callback,
      options,
    );
  }

  removeEventListener<
    K extends keyof ClientServiceEventMap,
  >(
    event: K,
    callback: EventHandler<ClientServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.removeEventListener(
      event,
      callback,
      options,
    );
  }

  private async initialize(resume?: boolean) {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        console.warn(
          `WebSocket already initialized, return existing socket`,
        );
        return this.socket;
      } else if (
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        console.warn(
          `WebSocket is connecting, wait for connection`,
        );
        return this.socket;
      } else {
        console.warn(
          `WebSocket is not open, destroy existing socket`,
        );
        this.destroy();
      }
    }

    const wsUrl = new URL(this.websocketUrl);

    wsUrl.searchParams.append("room", this.roomId);
    if (this.password) {
      const hash = await hashPassword(this.password).catch(
        (error) => {
          this.password = null;
          toast.error(
            `failed to hash password: ${error.message}`,
          );
          return null;
        },
      );
      if (hash) {
        wsUrl.searchParams.append("pwd", hash);
      }
    }

    const socket = new WebSocket(wsUrl);
    const setupListeners = (socket: WebSocket) => {
      if (this.controller) {
        this.controller.abort();
      }
      const controller = new AbortController();

      this.controller = controller;

      window.addEventListener(
        "beforeunload",
        () => {
          this.destroy();
        },
        { signal: controller.signal },
      );
      window.addEventListener(
        "unload",
        () => {
          this.destroy();
        },
        { signal: controller.signal },
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (this.socket?.readyState === WebSocket.OPEN)
            return;
          this.setStatus("disconnected");
          this.reconnect();
        },
        { signal: controller.signal },
      );

      socket.addEventListener(
        "message",
        (ev) => {
          const [error, signal] = catchErrorSync(
            () => JSON.parse(ev.data) as RawSignal,
          );
          if (error) {
            console.error(
              `WebSocket message error: ${error.message}`,
            );
            return;
          }
          switch (signal.type) {
            case "join":
              this.emit(
                "join",
                signal.data as TransferClient,
              );
              break;
            case "leave":
              this.emit(
                "leave",
                signal.data as TransferClient,
              );
              break;
            case "ping":
              socket.send(JSON.stringify({ type: "pong" }));
              break;
            default:
              break;
          }
        },
        { signal: controller.signal },
      );

      socket.addEventListener(
        "error",
        (ev) => {
          console.warn(`WebSocket error:`, ev);
        },
        { signal: controller.signal },
      );

      socket.addEventListener(
        "close",
        () => {
          this.setStatus("disconnected");
          this.reconnect();
        },
        {
          signal: controller.signal,
        },
      );
      this.socket = socket;
      return socket;
    };

    const connectController = new AbortController();

    return new Promise<WebSocket>((resolve, reject) => {
      this.setStatus("connecting");
      let timer = window.setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
        this.setStatus("disconnected");
        this.destroy();
      }, 10000);

      connectController.signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
        },
      );

      socket.addEventListener(
        "close",
        (ev) => {
          reject(
            new Error(
              `WebSocket error ${ev.code} ${ev.reason}`,
            ),
          );
          connectController.abort();
          this.setStatus("disconnected");
          this.destroy();
        },
        { once: true, signal: connectController.signal },
      );
      socket.addEventListener(
        "message",
        async (ev) => {
          const [error, message] = catchErrorSync(
            () => JSON.parse(ev.data) as RawSignal,
          );
          if (error) {
            console.error(
              `WebSocket message error: ${error.message}`,
            );
            this.destroy();
            return reject(error);
          }
          if (message.type === "connected") {
            const passwordHash = message.data;
            if (passwordHash) {
              if (!this.password) {
                this.destroy();
                return reject(
                  new Error("password required"),
                );
              }

              const passwordMatch =
                await comparePasswordHash(
                  this.password,
                  passwordHash,
                );
              if (!passwordMatch) {
                this.destroy();
                return reject(
                  new Error("incorrect password"),
                );
              }
            } else {
              this.password = null;
              toast.error(
                "the room is not password protected",
              );
            }
            socket.send(
              JSON.stringify({
                type: "join",
                data: { ...this.client, resume },
              }),
            );
            this.setStatus("connected");
            resolve(socket);
          } else if (message.type === "error") {
            this.destroy();
            reject(new Error(message.data));
          }
          connectController.abort();
        },
        { once: true, signal: connectController.signal },
      );
    }).then((socket) => setupListeners(socket));
  }

  private async reconnect() {
    const [error, socket] = await catchErrorAsync(
      this.initialize(true),
    );
    if (error) {
      this.reconnectAttempts++;
      console.log(
        `Reconnect failed, attempt: ${this.reconnectAttempts}`,
      );
      if (
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        setTimeout(
          () => this.reconnect(),
          this.reconnectInterval,
        );
      } else {
        console.log(
          `Reach max reconnect attempts, send leave message`,
        );
        this.destroy();
      }
      return;
    }

    this.signalingServices.forEach((service) => {
      service.resetSocket(socket);
    });

    this.reconnectAttempts = 0;
    console.log(`WebSocket reconnect success`);
  }

  createSender(
    targetClientId: string,
  ): WebSocketSignalingService | null {
    let service =
      this.signalingServices.get(targetClientId);
    if (service) {
      console.warn(
        `sender to remote client: ${targetClientId} already exists`,
      );
      return null;
    }

    if (!this.socket) {
      throw Error("WebSocket not initialized");
    }
    service = new WebSocketSignalingService(
      this.socket,
      this.client.clientId,
      targetClientId,
      this.password,
    );
    this.signalingServices.set(targetClientId, service);
    return service;
  }
  removeSender(targetClientId: string) {
    const service =
      this.signalingServices.get(targetClientId);
    if (service) {
      service.destroy();
      this.signalingServices.delete(targetClientId);
    }
  }
  listenForJoin(
    callback: (client: TransferClient) => void,
  ) {
    this.on("join", callback);
  }

  listenForLeave(
    callback: (client: TransferClient) => void,
  ) {
    this.on("leave", callback);
  }
  async createClient() {
    await this.initialize();
  }
  destroy() {
    this.signalingServices.forEach((service) =>
      service.destroy(),
    );
    this.eventListeners.clear();
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            type: "leave",
            data: this.client,
          }),
        );
      }
      this.socket = null;
    }
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.setStatus("disconnected");
  }
  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach((callback) => callback(data));
  }

  private on(event: string, callback: Function) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  async updateClient(options: UpdateClientOptions) {
    this.client.name = options.name ?? this.client.name;
  }
}
