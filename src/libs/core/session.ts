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
};

export class PeerSession {
  private eventEmitter: MultiEventEmitter<PeerSessionEventMap> =
    new MultiEventEmitter();
  peerConnection: RTCPeerConnection | null = null;
  private makingOffer: boolean = false;
  private ignoreOffer: boolean = false;
  readonly polite: boolean;
  private sender: SignalingService;
  private controller: AbortController | null = null;

  private channels: RTCDataChannel[] = [];
  private messageChannel: RTCDataChannel | null = null;
  private iceServers: RTCIceServer[] = [];
  private relayOnly: boolean;
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

  private async createConnection() {
    if (this.peerConnection) {
      if (
        this.peerConnection.connectionState === "connected"
      ) {
        console.warn(
          `session ${this.clientId} already connected`,
        );
        return;
      }

      this.disconnect();
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
            console.log(
              `client ${this.clientId} ICE Connection State: ${state}`,
            );
            break;
          case "disconnected":
          case "failed":
            console.warn(
              `client ${this.clientId} ICE Connection State: ${state}`,
            );
            this.disconnect();
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
        console.log(
          `${this.clientId} current signalingstatechange state is ${pc.signalingState}`,
        );
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
            console.log(`${this.clientId} is connecting`);
            this.dispatchEvent("connecting", undefined);
            break;
          case "connected":
            console.log(
              `${this.clientId} connection established`,
            );
            this.dispatchEvent("connected", undefined);
            this.createChannel("message", "message");
            break;
          case "failed":
          case "closed":
          case "disconnected":
            console.warn(
              `${this.clientId} connection error state: ${pc.connectionState}`,
            );
            this.disconnect();
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

  async listen() {
    const pc = await this.createConnection();
    if (pc === undefined) {
      console.warn(`session connection is created`);
      return;
    }

    this.sender.addEventListener(
      "signal",
      async (ev) => {
        if (this.peerConnection !== pc) {
          console.warn(
            `peer connection is changed, ignore signal`,
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
            console.error(
              `setLocalDescription error: `,
              err,
            );
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
      },
      { signal: this.controller?.signal },
    );
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
    // if (this.polite) {
    //   console.log(
    //     `session ${this.clientId} is polite, skip renegotiate`,
    //   );
    //   return;
    // }
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
    this.dispatchEvent("connecting", undefined);
    if (this.peerConnection) {
      const pc = this.peerConnection;
      if (pc.connectionState === "connected") return;

      return new Promise<void>(async (resolve, reject) => {
        const onConnectionStateChange = () => {
          switch (pc.connectionState) {
            case "connected":
              pc.removeEventListener(
                "connectionstatechange",
                onConnectionStateChange,
              );
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
    } else {
      return await this.connect();
    }
  }

  async connect() {
    if (this.polite) {
      console.log(
        `session ${this.clientId} is polite, skip connect`,
      );
      return;
    }
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
    const connectAbortController = new AbortController();

    return new Promise<void>(async (resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("connect timeout"));
        connectAbortController.abort();
        this.disconnect();
      }, 10000);

      const onConnectionStateChange = () => {
        switch (pc.connectionState) {
          case "connected":
            resolve();
            connectAbortController.abort();
            break;
          case "failed":
          case "closed":
          case "disconnected":
            reject(
              new Error(
                `Connection failed with state: ${pc.connectionState}`,
              ),
            );
            this.disconnect();
            connectAbortController.abort();
            break;
          default:
            break;
        }
      };

      pc.addEventListener(
        "connectionstatechange",
        onConnectionStateChange,
        { signal: connectAbortController.signal },
      );

      const onIceStateChange = () => {
        switch (pc.iceConnectionState) {
          case "connected":
            pc.removeEventListener(
              "icestatechange",
              onIceStateChange,
            );
            break;
          case "closed":
          case "disconnected":
            reject(
              new Error(
                `ICE connection failed with state: ${pc.iceConnectionState}`,
              ),
            );
            this.disconnect();
            connectAbortController.abort();
            break;
          default:
            break;
        }
      };

      pc.addEventListener(
        "icestatechange",
        onIceStateChange,
        { signal: connectAbortController.signal },
      );

      const onSignalingStateChange = () => {
        if (pc.signalingState === "closed") {
          reject(
            new Error(
              `Signaling connection failed with state: ${pc.signalingState}`,
            ),
          );
          this.disconnect();
          connectAbortController.abort();
        }
      };

      pc.addEventListener(
        "signalingstatechange",
        onSignalingStateChange,
        { signal: connectAbortController.signal },
      );

      connectAbortController.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("connect aborted"));
        },
        { once: true },
      );

      if (!this.makingOffer) {
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
