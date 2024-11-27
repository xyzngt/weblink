import { SignalingService } from "./services/type";
import {
  EventHandler,
  MultiEventEmitter,
} from "../utils/event-emitter";
import { SessionMessage } from "./messge";
import { waitChannel } from "./utils/channel";
import { appOptions } from "@/options";
import { catchErrorAsync, catchErrorSync } from "../catch";

export interface PeerSessionOptions {
  polite?: boolean;
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
}

export type PeerSessionEventMap = {
  created: void;
  connecting: void;
  connected: void;
  close: void;
  channel: RTCDataChannel;
  message: SessionMessage;
  error: Error;
  disconnect: void;
  messageChannelChange: "ready" | "closed";
  reconnect: void;
};

export class PeerSession {
  private eventEmitter: MultiEventEmitter<PeerSessionEventMap> =
    new MultiEventEmitter();
  peerConnection: RTCPeerConnection | null = null;
  private makingOffer: boolean = false;
  private ignoreOffer: boolean = false;
  private connectable: boolean = false;
  private sender: SignalingService;
  private controller: AbortController | null = null;
  private channels: RTCDataChannel[] = [];
  private messageChannel: RTCDataChannel | null = null;
  private iceServers: RTCIceServer[] = [];
  private closed: boolean = false;
  private relayOnly: boolean;
  readonly polite: boolean;
  constructor(
    sender: SignalingService,
    {
      polite = true,
      iceServers,
      relayOnly = false,
    }: PeerSessionOptions = {},
  ) {
    this.sender = sender;
    this.polite = polite;
    this.iceServers = iceServers ?? [];
    this.relayOnly = relayOnly;
  }

  get clientId() {
    return this.sender.clientId;
  }

  get targetClientId() {
    return this.sender.targetClientId;
  }

  addEventListener<K extends keyof PeerSessionEventMap>(
    eventName: K,
    handler: EventHandler<PeerSessionEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void {
    return this.eventEmitter.addEventListener(
      eventName,
      handler.bind(this),
      options,
    );
  }
  removeEventListener<K extends keyof PeerSessionEventMap>(
    eventName: K,
    handler: EventHandler<PeerSessionEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void {
    return this.eventEmitter.removeEventListener(
      eventName,
      handler,
      options,
    );
  }

  private dispatchEvent<
    K extends keyof PeerSessionEventMap,
  >(eventName: K, event: PeerSessionEventMap[K]) {
    return this.eventEmitter.dispatchEvent(
      eventName,
      event,
    );
  }

  private async initializeConnection() {
    if (this.peerConnection) {
      if (
        this.peerConnection.connectionState === "connected"
      ) {
        throw new Error(
          `can not initialize connection, session ${this.clientId} already connected`,
        );
      }
      this.disconnect();
    }

    console.log(
      `initialize connection, session ${this.clientId}`,
    );
    if (this.controller) {
      throw new Error(
        `can not initialize connection, controller already exists`,
      );
    }
    this.controller = new AbortController();
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: this.relayOnly ? "relay" : "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
    });
    this.peerConnection = pc;

    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver("video", {
        direction: "recvonly",
      });
      pc.addTransceiver("audio", {
        direction: "recvonly",
      });
    }

    this.dispatchEvent("created", undefined);

    window.addEventListener(
      "beforeunload",
      () => {
        this.disconnect();
      },
      { signal: this.controller.signal },
    );

    window.addEventListener(
      "visibilitychange",
      () => {
        if (pc.connectionState === "connected") return;
        this.handleConnectionError();
      },
      { signal: this.controller.signal },
    );

    pc.addEventListener(
      "icecandidate",
      async (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) {
          this.sender.sendSignal({
            type: "candidate",
            data: JSON.stringify({
              candidate: ev.candidate.toJSON(),
            }),
          });
        }
      },
      {
        signal: this.controller.signal,
      },
    );

    pc.addEventListener(
      "iceconnectionstatechange",
      async () => {
        const state = pc.iceConnectionState;
        switch (state) {
          case "connected":
          case "completed":
            break;
          case "disconnected":
          case "failed":
            break;
          default:
            break;
        }
      },
      {
        signal: this.controller.signal,
      },
    );

    pc.addEventListener(
      "datachannel",
      (ev) => {
        this.channels.push(ev.channel);

        ev.channel.addEventListener(
          "close",
          () => {
            const index = this.channels.findIndex(
              (channel) => channel.id === ev.channel.id,
            );
            if (index !== -1) {
              this.channels.splice(index, 1);
            }

            if (ev.channel.protocol === "message") {
              this.messageChannel = null;
            }
          },

          { once: true },
        );

        if (ev.channel.protocol === "message") {
          ev.channel.addEventListener(
            "message",
            (ev) => {
              const [error, message] = catchErrorSync(
                () => JSON.parse(ev.data) as SessionMessage,
              );
              if (error) {
                console.error(error);
                return;
              }
              this.dispatchEvent("message", message);
            },
            { signal: this.controller?.signal },
          );

          this.messageChannel = ev.channel;
          this.dispatchEvent(
            "messageChannelChange",
            "ready",
          );
        }

        this.dispatchEvent("channel", ev.channel);
      },
      {
        signal: this.controller.signal,
      },
    );

    pc.addEventListener(
      "signalingstatechange",
      () => {
        if (pc.signalingState === "closed") {
          this.disconnect();
        }
      },
      {
        signal: this.controller.signal,
      },
    );

    pc.addEventListener(
      "negotiationneeded",
      async () => {
        console.log(
          `client ${this.clientId} onNegotiationneeded`,
        );
        await this.renegotiate();
      },
      { signal: this.controller.signal },
    );

    pc.addEventListener(
      "connectionstatechange",
      () => {
        switch (pc.connectionState) {
          case "new":
            break;
          case "connecting":
            this.dispatchEvent("connecting", undefined);
            break;
          case "connected":
            this.connectable = true;
            this.dispatchEvent("connected", undefined);
            break;
          case "failed":
          case "closed":
          case "disconnected":
            this.handleConnectionError();
            break;
          default:
            break;
        }
      },
      { signal: this.controller.signal },
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") {
          if (
            this.peerConnection?.connectionState !==
            "connected"
          ) {
            this.disconnect();
          }
        }
      },
      { signal: this.controller.signal },
    );

    return pc;
  }

  private async handleConnectionError() {
    this.disconnect();
    if (!this.connectable) {
      console.warn(
        `connection error, session ${this.clientId} is not connectable, disconnect`,
      );
      return;
    }
    let reconnectAttempts = 0;
    const attemptReconnect = async () => {
      reconnectAttempts++;
      console.log(
        `attempt reconnect, attempt ${reconnectAttempts}`,
      );

      const [err] = await catchErrorAsync(this.reconnect());
      if (err) {
        console.error(
          `reconnect attempt ${reconnectAttempts} failed, error: `,
          err,
        );
        if (reconnectAttempts <= 10) {
          window.setTimeout(
            () => {
              if (
                ["connecting", "connected"].includes(
                  this.peerConnection?.connectionState ??
                    "",
                )
              ) {
                return;
              }
              if (this.closed) {
                return;
              }
              attemptReconnect();
            },
            Math.random() * (500 + reconnectAttempts * 500),
          );
        } else {
          console.error(
            `reconnect attempt ${reconnectAttempts} failed`,
          );
          this.disconnect();
        }
      }
    };
    attemptReconnect();
  }

  async listen() {
    const [err] = await catchErrorAsync(
      this.initializeConnection(),
    );
    if (err) {
      throw err;
    }

    this.sender.addEventListener("signal", async (ev) => {
      const pc = this.peerConnection;
      if (!pc) {
        console.warn(
          `peer connection is null, ignore signal`,
        );
        return;
      }
      console.log(
        `client received signal ${ev.detail.type}`,
        ev.detail,
      );

      let err: Error | undefined;

      const signal = ev.detail;
      if (signal.type === "offer") {
        const offerCollision =
          this.makingOffer ||
          pc.signalingState !== "stable";
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) {
          console.warn(
            `Offer ignored due to collision, signalingState: ${pc.signalingState}`,
          );
          return;
        }

        [err] = await catchErrorAsync(
          pc.setRemoteDescription(
            new RTCSessionDescription({
              type: "offer",
              sdp: signal.data.sdp,
            }),
          ),
        );

        if (err) {
          console.error(
            `setRemoteDescription error: `,
            err,
          );
          return;
        }

        [err] = await catchErrorAsync(
          pc.setLocalDescription(),
        );

        if (err) {
          console.error(`setLocalDescription error: `, err);
          return;
        }

        if (!pc.localDescription) {
          console.warn(
            `localDescription is null, signalingState: ${pc.signalingState}`,
          );
          return;
        }

        [err] = await catchErrorAsync(
          this.sender.sendSignal({
            type: pc.localDescription.type,
            data: JSON.stringify({
              sdp: pc.localDescription.sdp,
            }),
          }),
        );

        if (err) {
          console.error(`sendSignal error: `, err);
          return;
        }
      } else if (signal.type === "answer") {
        if (pc.signalingState !== "have-local-offer") {
          console.warn(
            `answer ignored due to signalingState is ${pc.signalingState}`,
          );
          return;
        }

        [err] = await catchErrorAsync(
          pc.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp: signal.data.sdp,
            }),
          ),
        );

        if (err) {
          console.error(
            `setRemoteDescription error: `,
            err,
          );
          return;
        }
      } else if (signal.type === "candidate") {
        const candidate = new RTCIceCandidate(
          signal.data.candidate,
        );
        [err] = await catchErrorAsync(
          pc.addIceCandidate(candidate),
        );

        if (err) {
          if (!this.ignoreOffer) {
            console.error(`addIceCandidate error: `, err);
          }
        }
      }
    });
  }

  async createChannel(label: string, protocol: string) {
    if (!this.peerConnection) {
      console.error(
        `failed to create channel, peer connection is null`,
      );
      return;
    }
    const channel = this.peerConnection.createDataChannel(
      label,
      {
        ordered: appOptions.ordered,
        protocol,
      },
    );

    this.channels.push(channel);

    channel.addEventListener(
      "close",
      () => {
        const index = this.channels.findIndex(
          (channel) => channel.id === channel.id,
        );
        if (index !== -1) {
          this.channels.splice(index, 1);
        }

        if (channel.protocol === "message") {
          this.messageChannel = null;
          this.dispatchEvent(
            "messageChannelChange",
            "closed",
          );
        }
      },
      { once: true },
    );

    if (channel.protocol === "message") {
      channel.addEventListener(
        "message",
        (ev) => {
          const [error, message] = catchErrorSync(
            () => JSON.parse(ev.data) as SessionMessage,
          );
          if (error) {
            console.error(error);
            return;
          }
          this.dispatchEvent("message", message);
        },
        { signal: this.controller?.signal },
      );

      this.messageChannel = channel;
      channel.addEventListener(
        "open",
        () => {
          this.dispatchEvent(
            "messageChannelChange",
            "ready",
          );
        },
        { signal: this.controller?.signal },
      );
      channel.addEventListener(
        "error",
        (ev) => {
          console.error(ev.error);
        },
        { signal: this.controller?.signal },
      );
      channel.addEventListener(
        "close",
        () => {
          this.dispatchEvent(
            "messageChannelChange",
            "closed",
          );
        },
        { signal: this.controller?.signal },
      );
    }

    await waitChannel(channel);
    return channel;
  }

  sendMessage(message: SessionMessage) {
    if (!this.messageChannel) {
      console.error(
        `failed to send message, message channel is null`,
      );
      return;
    }

    this.messageChannel.send(JSON.stringify(message));
  }

  async renegotiate() {
    if (!this.peerConnection) {
      console.warn(
        `renegotiate failed, peer connection is not created`,
      );
      return;
    }

    if (this.peerConnection.signalingState === "closed") {
      console.warn(
        `renegotiate error peerConnection connectionState is "closed"`,
      );
      return;
    }
    if (!this.makingOffer) {
      this.makingOffer = true;
      const [err] = await catchErrorAsync(
        handleOffer(this.peerConnection, this.sender),
      );
      if (err) {
        console.error("Error during ICE restart:", err);
        return;
      }
      this.makingOffer = false;
    } else {
      console.warn(
        `session ${this.clientId} already making offer`,
      );
    }
  }

  async reconnect() {
    if (!this.peerConnection) {
      console.log(
        `peer connection ${this.targetClientId} is null, new connection`,
      );
      const [err] = await catchErrorAsync(
        this.initializeConnection(),
      );
      if (err) throw err;
      this.dispatchEvent("reconnect", undefined);
      return await this.connect();
    }
    const pc = this.peerConnection;

    if (pc.connectionState === "connected") return;

    this.dispatchEvent("reconnect", undefined);

    return new Promise<void>(async (resolve, reject) => {
      const onConnectionStateChange = () => {
        switch (pc.connectionState) {
          case "connected":
            pc.removeEventListener(
              "connectionstatechange",
              onConnectionStateChange,
            );
            this.connectable = true;
            resolve();
            break;
          case "failed":
          case "closed":
          case "disconnected":
            pc.removeEventListener(
              "connectionstatechange",
              onConnectionStateChange,
            );
            this.dispatchEvent(
              "error",
              Error("reconnect error"),
            );
            this.disconnect();
            reject(
              new Error(
                `Connection failed with state: ${pc.connectionState}`,
              ),
            );
            break;
          default:
            console.log(
              `connectionstatechange state: ${pc.connectionState}`,
            );
            break;
        }
      };

      pc.addEventListener(
        "connectionstatechange",
        onConnectionStateChange,
      );

      pc.restartIce();

      if (!this.makingOffer) {
        this.makingOffer = true;
        const [err] = await catchErrorAsync(
          handleOffer(pc, this.sender),
        );
        if (err) {
          console.error("Error during ICE restart:", err);
          return;
        }
        this.makingOffer = false;
      } else {
        console.warn(
          `session ${this.clientId} already making offer`,
        );
      }
    });
  }

  async connect() {
    const pc = this.peerConnection;
    if (!pc) {
      console.warn(
        `connect failed, peer connection is null`,
      );
      return;
    }

    if (pc.connectionState === "connected") {
      console.warn(
        `session ${this.clientId} already connected`,
      );
      return;
    }

    if (pc.connectionState === "connecting") {
      console.warn(
        `session ${this.clientId} already connecting, skip connect`,
      );
      return;
    }

    const connectAbortController = new AbortController();

    return new Promise<void>(async (resolve, reject) => {
      this.createChannel("message", "message");
      const timer = window.setTimeout(() => {
        connectAbortController.abort();
        this.disconnect();
        reject(new Error("connect timeout"));
      }, 10000);

      pc.addEventListener(
        "connectionstatechange",
        () => {
          switch (pc.connectionState) {
            case "connected":
              console.log(
                `connection established, session ${this.clientId}, connectable: ${this.connectable}`,
              );
              window.clearTimeout(timer);
              connectAbortController.abort();
              resolve();
              break;
            case "failed":
            case "closed":
            case "disconnected":
              window.clearTimeout(timer);
              connectAbortController.abort();
              this.disconnect();
              reject(
                new Error(
                  `Connection failed with state: ${pc.connectionState}`,
                ),
              );
              break;
            default:
              break;
          }
        },
        { signal: connectAbortController.signal },
      );

      // const onIceStateChange = () => {
      //   switch (pc.iceConnectionState) {
      //     case "connected":
      //       pc.removeEventListener(
      //         "icestatechange",
      //         onIceStateChange,
      //       );
      //       break;
      //     case "closed":
      //     case "disconnected":
      //       reject(
      //         new Error(
      //           `ICE connection failed with state: ${pc.iceConnectionState}`,
      //         ),
      //       );
      //       this.disconnect();
      //       connectAbortController.abort();
      //       break;
      //     default:
      //       break;
      //   }
      // };

      // pc.addEventListener(
      //   "icestatechange",
      //   onIceStateChange,
      //   { signal: connectAbortController.signal },
      // );

      // const onSignalingStateChange = () => {
      //   if (pc.signalingState === "closed") {
      //     this.disconnect();
      //     connectAbortController.abort();
      //     reject(
      //       new Error(
      //         `Signaling connection failed with state: ${pc.signalingState}`,
      //       ),
      //     );
      //   }
      // };

      // pc.addEventListener(
      //   "signalingstatechange",
      //   onSignalingStateChange,
      //   { signal: connectAbortController.signal },
      // );

      if (!this.makingOffer && !this.polite) {
        this.makingOffer = true;
        const [err] = await catchErrorAsync(
          handleOffer(pc, this.sender),
        );
        if (err) {
          reject(
            new Error(
              `Failed to create and send offer: ${err.message}`,
            ),
          );
        }
        this.makingOffer = false;
      } else {
        console.warn(
          `session ${this.clientId} already making offer`,
        );
      }
    });
  }

  disconnect() {
    this.controller?.abort();
    this.controller = null;
    this.makingOffer = false;
    this.channels.length = 0;
    if (this.messageChannel) {
      this.messageChannel.close();
      this.messageChannel = null;
      this.dispatchEvent("messageChannelChange", "closed");
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      this.dispatchEvent("disconnect", undefined);
    }
  }

  close() {
    this.disconnect();
    this.closed = true;
    this.dispatchEvent("close", undefined);
  }
}

// this function is used to modify the offer
export async function handleOffer(
  pc: RTCPeerConnection,
  sender: SignalingService,
  options?: RTCOfferOptions,
) {
  const offer = await pc.createOffer(options);

  await pc.setLocalDescription(offer);
  await sender.sendSignal({
    type: offer.type,
    data: JSON.stringify({
      sdp: offer.sdp,
    }),
  });
}
