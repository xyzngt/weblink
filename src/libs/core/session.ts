import {
  ClientSignal,
  SignalingService,
} from "./services/type";
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
  channel: RTCDataChannel;
  message: SessionMessage;
  error: Error;
  messagechannelchange: "ready" | "closed";
  remotestreamchange: MediaStream | null;
  statuschange: PeerSessionStatus;
};

type PeerSessionStatus =
  | "init"
  | "created"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "closed";

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
  private relayOnly: boolean;
  private signalCache: Array<ClientSignal> = [];
  readonly polite: boolean;
  private stream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private status: PeerSessionStatus = "init";
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

  private setStatus(status: PeerSessionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent("statuschange", status);
  }

  private initializeConnection() {
    if (this.status === "closed") {
      throw new Error(
        `can not initialize connection, session ${this.clientId} is closed`,
      );
    }
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

    if (this.stream) {
      const stream = this.stream;
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    } else {
      pc.addTransceiver("video", {
        direction: "recvonly",
      });
      pc.addTransceiver("audio", {
        direction: "recvonly",
      });
    }

    this.setStatus("created");

    window.addEventListener(
      "beforeunload",
      () => {
        this.close();
      },
      { signal: this.controller.signal },
    );

    pc.addEventListener(
      "icecandidate",
      async (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) return;

        const [err] = await catchErrorAsync(
          this.sender.sendSignal({
            type: "candidate",
            data: JSON.stringify({
              candidate: ev.candidate.toJSON(),
            }),
          }),
        );
        if (err) {
          console.error(err);
        }
      },
      {
        signal: this.controller.signal,
      },
    );
    pc.addEventListener(
      "track",
      (ev) => {
        console.log(
          `client ${this.targetClientId} add track ${ev.track.id} stream ${ev.streams[0]?.id}`,
        );

        const stream = ev.streams[0];
        if (!stream) return;

        ev.track.addEventListener(
          "ended",
          () => {
            if (this.remoteStream) {
              this.remoteStream.removeTrack(ev.track);
              this.dispatchEvent(
                "remotestreamchange",
                this.remoteStream,
              );
            }
          },
          { once: true },
        );

        if (this.remoteStream) {
          if (stream.id === this.remoteStream.id) {
            const track = ev.track;
            this.remoteStream.addTrack(track);
            this.dispatchEvent(
              "remotestreamchange",
              this.remoteStream,
            );
            return;
          }

          const remoteStream = this.remoteStream;

          remoteStream.getTracks().forEach((track) => {
            remoteStream.removeTrack(track);
            track.stop();
          });

          this.remoteStream = null;
        }
        this.remoteStream = stream;

        stream.addEventListener(
          "removetrack",
          (ev) => {
            console.log(
              `client ${this.targetClientId} removetrack`,
              ev.track.id,
            );
            if (stream.getTracks().length === 0) {
              this.remoteStream = null;
            }
            this.dispatchEvent(
              "remotestreamchange",
              this.remoteStream,
            );
          },
          { signal: this.controller?.signal },
        );

        this.dispatchEvent("remotestreamchange", stream);
      },
      { signal: this.controller.signal },
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
              (c) => c.id === ev.channel.id,
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
            "messagechannelchange",
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
          `signalingstatechange, signalingState: ${pc.signalingState}`,
        );
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
            this.setStatus("connecting");
            break;
          case "connected":
            this.connectable = true;
            this.setStatus("connected");
            break;
          case "closed":
          case "disconnected":
          case "failed":
            this.setStatus("disconnected");
            this.handleDisconnection();
            break;
          default:
            break;
        }
      },
      { signal: this.controller.signal },
    );

    let queue = Promise.resolve();
    function enqueueTask(task: () => Promise<void>) {
      queue = queue.then(() => task());
    }

    for (const signal of this.signalCache) {
      enqueueTask(() => this.handleSignal(signal));
    }
    this.signalCache.length = 0;
    return pc;
  }

  private async handleDisconnection() {
    let reconnectAttempts = 0;
    const attemptReconnect = async () => {
      if (
        ["closed", "reconnecting"].includes(this.status)
      ) {
        console.warn(
          `session ${this.clientId} is ${this.status}, skip handle connection error`,
        );
        return;
      }
      if (
        ["connected", "connecting"].includes(
          this.peerConnection?.connectionState ?? "",
        )
      ) {
        console.warn(
          `connection error, session ${this.clientId} is already ${this.peerConnection?.connectionState}, skip handle connection error`,
        );
        return;
      }
      if (!this.connectable) {
        console.warn(
          `connection error, session ${this.clientId} is not connectable, disconnect`,
        );
        return;
      }
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
        if (reconnectAttempts < 10) {
          window.setTimeout(
            () => attemptReconnect(),
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

  private async handleSignal(signal: ClientSignal) {
    const pc = this.peerConnection;
    if (!pc) {
      console.log(
        `peer connection is null, skip handle signal`,
      );
      return;
    }
    let err: Error | undefined;
    if (signal.type === "offer") {
      const offerCollision =
        this.makingOffer || pc.signalingState !== "stable";
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
        console.error(`setRemoteDescription error: `, err);
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
        console.error(`setRemoteDescription error: `, err);
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
  }

  async listen() {
    if (this.status === "closed") {
      throw new Error(
        `session ${this.clientId} is closed, can not listen`,
      );
    }
    const [err] = catchErrorSync(() =>
      this.initializeConnection(),
    );
    if (err) {
      throw err;
    }

    this.sender.addEventListener("signal", async (ev) => {
      console.log(
        `client received signal ${ev.detail.type}`,
        ev.detail,
      );
      const pc = this.peerConnection;
      if (!pc) {
        console.log(
          `peer connection is null, cache signal`,
        );
        this.signalCache.push(ev.detail);
        if (ev.detail.type === "candidate") {
          this.handleDisconnection();
        }
      } else {
        await this.handleSignal(ev.detail);
      }
    });
  }

  private removeStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        this.stream?.removeTrack(track);
        track.stop();
      });
      this.stream = null;
    }
    this.peerConnection?.getSenders().forEach((sender) => {
      if (sender.track) {
        this.peerConnection?.removeTrack(sender);
      }
    });
  }

  setStream(stream: MediaStream | null) {
    if (!stream) {
      this.removeStream();
      return;
    }

    if (this.stream) {
      if (this.stream.id === stream.id) return;

      this.removeStream();
    }

    this.stream = stream;

    let senders: RTCRtpSender[] = [];

    stream.addEventListener("addtrack", (ev) => {
      const sender = this.peerConnection?.addTrack(
        ev.track,
        stream,
      );
      if (sender) {
        senders.push(sender);
      }
    });

    stream.addEventListener("removetrack", (ev) => {
      const index = senders.findIndex(
        (sender) => sender.track?.id === ev.track.id,
      );
      if (index !== -1) {
        this.peerConnection?.removeTrack(senders[index]);
        senders.splice(index, 1);
      }
    });

    senders.push(
      ...stream
        .getTracks()
        .map((track) => {
          track.addEventListener("ended", () => {
            console.log(
              `track ended, remove track from peer connection`,
              track.id,
            );
            const index = senders.findIndex(
              (sender) => sender.track?.id === track.id,
            );
            if (index !== -1) {
              this.peerConnection?.removeTrack(
                senders[index],
              );
              senders.splice(index, 1);
            }
          });
          return this.peerConnection?.addTrack(
            track,
            stream,
          );
        })
        .filter((sender) => sender !== undefined),
    );
  }

  async createChannel(label: string, protocol: string) {
    if (!this.peerConnection) {
      throw new Error(
        `failed to create channel, peer connection is null`,
      );
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
            "messagechannelchange",
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
            "messagechannelchange",
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
          this.messageChannel = null;
          this.dispatchEvent(
            "messagechannelchange",
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
    if (this.status === "closed") {
      throw new Error(
        `session ${this.clientId} is closed, can not send message`,
      );
    }
    if (!this.messageChannel) {
      console.error(
        `failed to send message, message channel is null`,
      );
      return;
    }

    this.messageChannel.send(JSON.stringify(message));
  }

  async renegotiate() {
    if (this.status === "closed") {
      throw new Error(
        `session ${this.clientId} is closed, can not renegotiate`,
      );
    }
    if (!this.peerConnection) {
      console.warn(
        `renegotiate failed, peer connection is not created`,
      );
      return;
    }

    if (this.peerConnection.signalingState !== "stable") {
      console.warn(
        `renegotiate failed, signalingState is ${this.peerConnection.signalingState}`,
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
    if (this.status === "closed") {
      throw new Error(
        `session ${this.clientId} is closed, can not reconnect`,
      );
    }
    if (this.peerConnection === null) {
      console.log(
        `peer connection ${this.targetClientId} is null, new connection`,
      );
      let err: Error | undefined;
      [err] = catchErrorSync(() =>
        this.initializeConnection(),
      );
      if (err) throw err;
      this.setStatus("reconnecting");
      [err] = await catchErrorAsync(this.connect());
      if (err) {
        this.setStatus("disconnected");
        throw err;
      }
      return;
    }
    const pc = this.peerConnection;
    if (
      ["connecting", "connected"].includes(
        pc.connectionState,
      )
    ) {
      console.warn(
        `session ${this.clientId} already connected, skip reconnect`,
      );
      return;
    }

    this.setStatus("reconnecting");

    let timer: number;

    const connectAbortController = new AbortController();

    return new Promise<void>(async (resolve, reject) => {
      timer = window.setTimeout(() => {
        connectAbortController.abort();
        this.disconnect();
        reject(new Error("connect timeout"));
      }, 10000);

      const onConnectionStateChange = () => {
        switch (pc.connectionState) {
          case "connected":
            window.clearTimeout(timer);
            this.connectable = true;
            connectAbortController.abort();
            resolve();
            break;
          case "failed":
          case "closed":
          case "disconnected":
            window.clearTimeout(timer);
            this.dispatchEvent(
              "error",
              Error("reconnect error"),
            );
            connectAbortController.abort();
            this.setStatus("disconnected");
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
        { signal: connectAbortController.signal },
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
    if (this.status === "closed") {
      throw new Error(
        `session ${this.clientId} is closed, can not connect`,
      );
    }
    const pc = this.peerConnection;
    if (!pc) {
      console.warn(
        `connect failed, peer connection is null`,
      );
      return;
    }

    if (
      ["connected", "connecting"].includes(
        pc.connectionState,
      )
    ) {
      console.warn(
        `session ${this.clientId} already ${pc.connectionState}`,
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
              window.clearTimeout(timer);
              console.log(
                `connection established, session ${this.clientId}, connectable: ${this.connectable}`,
              );
              connectAbortController.abort();
              this.connectable = true;
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
    this.makingOffer = false;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.channels.forEach((channel) => channel.close());
    this.channels.length = 0;
    if (this.messageChannel) {
      this.messageChannel.close();
      this.messageChannel = null;
      this.dispatchEvent("messagechannelchange", "closed");
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      this.setStatus("disconnected");
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.remoteStream = null;
    }
    this.setStatus("disconnected");
  }

  close() {
    this.disconnect();
    this.setStatus("closed");
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
