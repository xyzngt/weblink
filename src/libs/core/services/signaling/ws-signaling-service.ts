// signaling/websocket-signaling-service.ts
import { v4 as uuidv4 } from "uuid";
import {
  RawSignal,
  ClientSignal,
  SignalingService,
  SignalingServiceEventMap,
} from "../type";
import {
  encryptData,
  decryptData,
} from "@/libs/core/utils/encrypt/e2e";
import {
  EventHandler,
  MultiEventEmitter,
} from "@/libs/utils/event-emitter";

export class WebSocketSignalingService
  implements SignalingService
{
  private eventEmitter: MultiEventEmitter<SignalingServiceEventMap> =
    new MultiEventEmitter();
  private socket: WebSocket;
  private _clientId: string;
  private _targetClientId: string;
  private password: string | null = null;
  private messageQueue: RawSignal[] = [];
  constructor(
    socket: WebSocket,
    clientId: string,
    targetClientId: string,
    password: string | null = null,
  ) {
    this.socket = socket;
    this._clientId = clientId;
    this._targetClientId = targetClientId;
    this.password = password;

    // Handle incoming messages
    this.socket.addEventListener("message", this.onMessage);
  }

  addEventListener<
    K extends keyof SignalingServiceEventMap,
  >(
    event: K,
    callback: EventHandler<SignalingServiceEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.addEventListener(
      event,
      callback,
      options,
    );
  }

  removeEventListener<
    K extends keyof SignalingServiceEventMap,
  >(
    event: K,
    callback: EventHandler<SignalingServiceEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void {
    return this.eventEmitter.removeEventListener(
      event,
      callback,
      options,
    );
  }

  dispatchEvent<K extends keyof SignalingServiceEventMap>(
    event: K,
    data: SignalingServiceEventMap[K],
  ): boolean {
    return this.eventEmitter.dispatchEvent(event, data);
  }

  setSocket(socket: WebSocket) {
    this.socket.removeEventListener(
      "message",
      this.onMessage,
    );
    this.socket = socket;
    this.socket.addEventListener("message", this.onMessage);

    const sendQueue = () => {
      this.messageQueue.forEach((signal) => {
        this.sendSignal(signal);
      });
      this.messageQueue.length = 0;
    };

    if (this.socket.readyState === WebSocket.OPEN) {
      sendQueue;
    } else {
      this.socket.addEventListener("open", sendQueue, {
        once: true,
      });
    }
  }

  get clientId(): string {
    return this._clientId;
  }

  get targetClientId(): string {
    return this._targetClientId;
  }

  async sendSignal(signal: RawSignal): Promise<void> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("socket is not open");
    }

    if (this.password) {
      signal.data = await encryptData(
        this.password,
        signal.data,
      );
    }

    const message = {
      type: "message",
      data: {
        type: signal.type,
        targetClientId: this._targetClientId,
        clientId: this._clientId,
        data: signal.data,
      } as ClientSignal,
    };
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.messageQueue.push(signal);
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private onMessage = async (event: MessageEvent) => {
    const signal: RawSignal = JSON.parse(event.data);
    if (signal.type !== "message") return;

    const message = signal.data as ClientSignal;
    // Check if the signal is intended for this client
    if (
      message.targetClientId &&
      message.targetClientId !== this._clientId
    )
      return;

    // Check if the signal is from the target client
    if (message.clientId !== this._targetClientId) return;

    if (this.password) {
      message.data = await decryptData(
        this.password,
        message.data,
      );
    }
    message.data = JSON.parse(message.data);

    this.dispatchEvent("signal", message);
  };

  destroy() {
    this.eventEmitter.clearListeners();
    this.socket.removeEventListener(
      "message",
      this.onMessage,
    );
    // Additional cleanup if necessary
  }
}
