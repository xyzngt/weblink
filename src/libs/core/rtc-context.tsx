import {
  Component,
  createContext,
  createEffect,
  onCleanup,
  onMount,
  ParentProps,
  useContext,
} from "solid-js";
import { ClientID, FileID, RoomStatus } from "./type";
import { createStore, reconcile } from "solid-js/store";
import { FirebaseClientService } from "./services/client/firebase-client-service";

import { PeerSession } from "./session";
import {
  TRANSFER_CHANNEL_PREFIX,
  TransferMode,
} from "./file-transferer";
import { v4 } from "uuid";
import { clientProfile } from "./store";
import { cacheManager } from "../services/cache-serivce";
import { transferManager } from "../services/transfer-service";
import { getRangesLength } from "../utils/range";
import {
  ClientService,
  ClientServiceInitOptions,
} from "./services/type";

import {
  CheckMessage,
  ErrorMessage,
  messageStores,
  RequestFileMessage,
  SendClipboardMessage,
  SendFileMessage,
  SendTextMessage,
  SessionMessage,
  StorageMessage,
} from "./messge";
import { sessionService } from "../services/session-service";
import { WebSocketClientService } from "./services/client/ws-client-service";
import { appOptions } from "@/options";
import { toast } from "solid-sonner";
import { ChunkMetaData, FileMetaData } from "../cache";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClientService(
  options: ClientServiceInitOptions,
): ClientService {
  switch (import.meta.env.VITE_BACKEND) {
    case "FIREBASE":
      return new FirebaseClientService(options);
    case "WEBSOCKET":
      options.websocketUrl =
        appOptions.websocketUrl ??
        import.meta.env.VITE_WEBSOCKET_URL;
      return new WebSocketClientService(options);
    default:
      throw Error("invalid backend type");
  }
}

export function getRandomUnsignedShort() {
  return Math.floor(Math.random() * 6553);
}

const WebRTCContext = createContext<
  WebRTCContextProps | undefined
>(undefined);

export const useWebRTC = (): WebRTCContextProps => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error(
      "useWebRTC must be used within a WebRTCProvider",
    );
  }
  return context;
};

export interface SendOptions {
  target?: string;
}

export interface WebRTCContextProps {
  joinRoom: () => Promise<void>;
  leaveRoom: () => void;
  requestFile(
    target: ClientID,
    info: ChunkMetaData,
    resume?: boolean,
  ): Promise<void>;
  send: (
    text: string | File,
    options: SendOptions,
  ) => Promise<boolean>;
  shareFile: (fileId: FileID, target: ClientID) => void;
  roomStatus: RoomStatus;
  remoteStreams: Record<string, MediaStream>;
}

export interface WebRTCProviderProps extends ParentProps {
  onTrackChanged?: (
    target: string,
    pc: RTCPeerConnection,
  ) => void;

  localStream: MediaStream | null;
}

export const WebRTCProvider: Component<
  WebRTCProviderProps
> = (props) => {
  // createEffect(() => {
  //   const info: Record<string, ClientInfo> = {};
  //   messageStores.clients.forEach((client) => {
  //     info[client.clientId] = {
  //       ...client,
  //       onlineStatus: "offline",
  //     };
  //   });

  //   setClientSessionInfo(info);

  //   if (!clientService()) {
  //     setClientSessionInfo(
  //       produce((state) =>
  //         Object.values(state).forEach(
  //           (info) => (info.onlineStatus = "offline"),
  //         ),
  //       ),
  //     );
  //   }
  // });

  let clipboardCacheData: SendClipboardMessage[] = [];

  onMount(() => {
    const onFocus = () => {
      if (clipboardCacheData.length === 0) return;
      const data = clipboardCacheData
        .map((msg) => msg.data)
        .join("\n");
      navigator.clipboard
        .writeText(data)
        .then(() => {
          toast.success(data);
        })
        .catch((err) => {
          toast.error(err.message);
        })
        .finally(() => {
          clipboardCacheData.length = 0;
        });
    };
    window.addEventListener("focus", onFocus);

    onCleanup(() => {
      window.removeEventListener("focus", onFocus);
    });
  });

  const [remoteStreams, setRemoteStreams] = createStore<
    Record<string, MediaStream>
  >({});

  const [roomStatus, setRoomStatus] =
    createStore<RoomStatus>({
      roomId: null,
      profile: null,
    });

  // targetClientId, connection

  async function handleReceiveMessage(
    session: PeerSession,
    message: SessionMessage,
  ) {
    try {
      console.log(`handle receive message`, message);

      if (message.type === "send-text") {
        messageStores.setReceiveMessage(message);
        const replyMessage = {
          type: "check-message",
          id: message.id,
          createdAt: Date.now(),
          client: message.target,
          target: message.client,
          mode: "receive",
        } satisfies CheckMessage;
        session.sendMessage(replyMessage);
      } else if (message.type === "send-clipboard") {
        sessionService.setClipboard(message);
        window.focus();
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(message.data)
            .then(() => {
              toast.success(message.data);
            })
            .catch((err) => {
              clipboardCacheData.push(message);
              if (err instanceof Error) {
                console.warn(
                  `can not write ${message.data} to clipboard, ${err.message}`,
                );
              }
            });
        }
      } else if (message.type === "send-file") {
        if (cacheManager.getCache(message.fid)) {
          throw new Error(
            `cache ${message.fid} already exists`,
          );
        }
        messageStores.setReceiveMessage(message);

        const cache = await cacheManager.createCache(
          message.fid,
        );

        const receiveInfo = {
          fileName: message.fileName,
          fileSize: message.fileSize,
          mimetype: message.mimeType,
          lastModified: message.lastModified,
          chunkSize: message.chunkSize,
          createdAt: message.createdAt,
          id: message.fid,
        } satisfies FileMetaData;

        const transferer = transferManager.createTransfer(
          cache,
          TransferMode.Receive,
          receiveInfo,
        );

        messageStores.addTransfer(transferer);
        await transferer.initialize();

        const replyMessage = {
          type: "check-message",
          id: message.id,
          createdAt: Date.now(),
          client: message.target,
          target: message.client,
          mode: "receive",
        } satisfies CheckMessage;

        session.sendMessage(replyMessage);
      } else if (message.type === "request-file") {
        const cache = cacheManager.getCache(message.fid);
        if (!cache) {
          throw new Error(`cache ${message.fid} not found`);
        }

        if (!(await cache.isComplete())) {
          throw new Error(
            `cache ${message.fid} is not complete`,
          );
        }
        messageStores.setReceiveMessage(message);
        const transferer = transferManager.createTransfer(
          cache,
          TransferMode.Send,
        );
        messageStores.addTransfer(transferer);

        transferer.addEventListener("ready", () => {
          transferer.sendFile(message.ranges);
        });

        await transferer.initialize();
        transferer.setSendStatus(message);

        const replyMessage = {
          type: "check-message",
          id: message.id,
          createdAt: Date.now(),
          client: message.target,
          target: message.client,
          mode: "send",
        } satisfies CheckMessage;

        session.sendMessage(replyMessage);
      } else if (message.type === "check-message") {
        messageStores.setReceiveMessage(message);
        const index = messageStores.messages.findLastIndex(
          (msg) => msg.id === message.id,
        );
        if (index === -1) {
          console.warn(
            `check message ${message.id} not found`,
          );
          throw new Error(
            `check message ${message.id} not found`,
          );
        }
        const storeMessage = messageStores.messages[index];
        if (storeMessage.type === "file") {
          if (!storeMessage.fid) {
            throw new Error(
              `file transfer message ${message.id} fid is undefined`,
            );
          }
          const cache = cacheManager.getCache(
            storeMessage.fid,
          );
          if (!cache) {
            console.warn(
              `cache ${storeMessage.fid} not found`,
            );
            throw new Error(
              `cache ${storeMessage.fid} not found`,
            );
          }
          if (message.mode === "send") {
            const transferer =
              transferManager.createTransfer(
                cache,
                TransferMode.Receive,
              );
            messageStores.addTransfer(transferer);
            await transferer.initialize();
            for (
              let i = 0;
              i < appOptions.channelsNumber;
              i++
            ) {
              const channel = await session.createChannel(
                `${transferer.id}-${i}`,
                "transfer",
              );

              if (channel) {
                transferManager.addChannel(
                  cache.id,
                  channel,
                );
              }
            }
          } else if (message.mode === "receive") {
            const transferer =
              transferManager.createTransfer(
                cache,
                TransferMode.Send,
              );

            messageStores.addTransfer(transferer);
            transferer.addEventListener("ready", () => {
              transferer.sendFile();
            });
            await transferer.initialize();

            for (
              let i = 0;
              i < appOptions.channelsNumber;
              i++
            ) {
              const channel = await session.createChannel(
                `${transferer.id}-${i}`,
                "transfer",
              );

              if (!channel) continue;

              transferManager.addChannel(
                storeMessage.fid,
                channel,
              );
            }
          }
        }
      } else if (message.type === "storage") {
        sessionService.setStorage(message);
      } else if (message.type === "request-storage") {
        const replyMessage = {
          type: "storage",
          data: (await cacheManager.getStorages()) ?? [],
          createdAt: Date.now(),
          client: message.target,
          target: message.client,
          id: message.id,
        } satisfies StorageMessage;

        session.sendMessage(replyMessage);
      } else if (message.type === "error") {
        messageStores.setReceiveMessage(message);
        console.warn(message.error);
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        const errorMessage = {
          type: "error",
          id: message.id,
          client: message.target,
          target: message.client,
          createdAt: Date.now(),
          error: err.message,
        } satisfies ErrorMessage;
        session.sendMessage(errorMessage);
      }
    }
  }

  const joinRoom = async (): Promise<void> => {
    console.log(`join room`, clientProfile);

    let cs: ClientService;
    if (sessionService.clientService) {
      cs = sessionService.clientService;
    } else {
      cs = getClientService({
        roomId: clientProfile.roomId,
        password: clientProfile.password,
        client: {
          clientId: clientProfile.clientId,
          name: clientProfile.name,
          avatar: clientProfile.avatar,
        },
      });

      sessionService.setClientService(cs);
    }

    await cs.createClient().catch((err) => {
      sessionService.destoryService();
      throw err;
    });

    setRoomStatus("profile", cs.info);

    cs.listenForJoin(async (targetClient) => {
      console.log(`new client join in `, targetClient);

      const session =
        sessionService.addClient(targetClient);
      if (!session) {
        console.error(`no client service setted`);
        return;
      }
      // const updateStats = async (pc: RTCPeerConnection) => {
      //   const reports: any[] = [];
      //   const stats = await pc.getStats();

      //   let candidateType: string | undefined;
      //   stats.forEach((report) => {
      //     reports.push(report);
      //     if (report.type === "transport") {
      //       let activeCandidatePair = stats.get(
      //         report.selectedCandidatePairId,
      //       ) as RTCIceCandidatePairStats;
      //       if (!activeCandidatePair) return;
      //       let remoteCandidate = stats.get(
      //         activeCandidatePair.remoteCandidateId,
      //       );
      //       let localCandidate = stats.get(
      //         activeCandidatePair.localCandidateId,
      //       );
      //       if (
      //         localCandidate?.candidateType ||
      //         remoteCandidate?.candidateType
      //       ) {
      //         candidateType =
      //           localCandidate?.candidateType ??
      //           remoteCandidate?.candidateType;
      //       }
      //     }
      //   });
      //   if (clientSessionInfo[targetClient.clientId]) {
      //     setClientSessionInfo(
      //       targetClient.clientId,
      //       "statsReports",
      //       reports,
      //     );
      //     setClientSessionInfo(
      //       targetClient.clientId,
      //       "candidateType",
      //       candidateType,
      //     );
      //   }
      // };

      // setClientSessionInfo(targetClient.clientId, {
      //   ...targetClient,
      //   onlineStatus: "offline",
      // } satisfies ClientInfo);

      const localStream = props.localStream;

      session.addEventListener("message", async (ev) => {
        const message = ev.detail;
        handleReceiveMessage(session, message);
      });

      session.addEventListener("channel", (ev) => {
        const channel = ev.detail;

        if (channel.protocol === "transfer") {
          console.log(`datachannel event`, channel);

          const fileIdWithChannelId = channel.label.replace(
            TRANSFER_CHANNEL_PREFIX,
            "",
          );

          const index =
            fileIdWithChannelId.lastIndexOf("-");
          const fileId = fileIdWithChannelId.slice(
            0,
            index,
          );

          console.log(`receive channel for file ${fileId}`);

          transferManager.addChannel(fileId, channel);
        }
      });

      session.addEventListener("created", () => {
        const pc = session.peerConnection!;

        if (localStream) {
          const tracks = localStream.getTracks();

          pc.getTransceivers().forEach((transceiver) => {
            const track = tracks.find(
              (t) =>
                t.kind === transceiver.receiver.track.kind,
            );
            if (track) {
              transceiver.direction = "sendrecv";
              transceiver.sender.replaceTrack(track);
              transceiver.sender.setStreams(localStream);
            }
          });
        }
        props.onTrackChanged?.(targetClient.clientId, pc);

        const onTrack = ({
          track,
          streams,
        }: RTCTrackEvent) => {
          console.log(`on track event:`, streams, track);
          const stream = streams[0];
          if (!stream) return;
          if (
            remoteStreams[targetClient.clientId] &&
            remoteStreams[targetClient.clientId].id ===
              stream.id
          )
            return;

          stream.addEventListener("removetrack", (ev) => {
            console.log(
              `client ${targetClient.clientId} removetrack`,
              ev.track.id,
            );
            if (stream.getTracks().length === 0) {
              setRemoteStreams(
                targetClient.clientId,
                undefined!,
              );
            }
          });

          console.log(
            `new remote stream from client ${targetClient.clientId}`,
            stream.getTracks(),
          );

          setRemoteStreams(targetClient.clientId, stream);
          props.onTrackChanged?.(targetClient.clientId, pc);
        };
        pc.addEventListener("track", onTrack);
      });

      await session.listen();
      messageStores.setClient(targetClient);

      if (!session.polite) {
        try {
          await session.connect();
        } catch (err) {
          console.error(err);
          if (
            Object.values(sessionService.sessions)
              .length === 0
          ) {
            leaveRoom();
            throw err;
          }
        }
      }
    });

    cs.listenForLeave((client) => {
      console.log(`client ${client.clientId} leave`);
      sessionService.destorySession(client.clientId);

      setRemoteStreams(client.clientId, undefined!);
    });

    setRoomStatus("roomId", clientProfile.roomId);
  };

  const leaveRoom = async () => {
    const room = roomStatus.roomId;
    if (room) {
      console.log(`on leave room ${room}`);
    }

    updateRemoteStreams(null);

    sessionService.destoryAllSession();
    setRoomStatus("roomId", null);
    setRoomStatus("profile", null);

    setRemoteStreams(reconcile({}));
  };

  onCleanup(() => {
    leaveRoom();
  });

  async function updateRemoteStreams(
    stream: MediaStream | null,
  ) {
    for (const session of Object.values(
      sessionService.sessions,
    )) {
      let renegotiate: boolean = false;
      const pc = session.peerConnection;
      if (!pc) return;

      const tracks = stream?.getTracks() || [];
      console.log(`get tracks`, tracks);

      const transceivers = pc.getTransceivers();
      console.log(`get transceivers`, transceivers);
      transceivers.forEach((transceiver) => {
        const track = tracks.find(
          (t) => t.kind === transceiver.receiver.track.kind,
        );
        if (track) {
          if (transceiver.sender.track !== track) {
            transceiver.direction = "sendrecv";
            transceiver.sender.replaceTrack(track);
            stream && transceiver.sender.setStreams(stream);
            renegotiate = true;
          }
        } else {
          if (transceiver.sender.track) {
            transceiver.direction = "recvonly";
            transceiver.sender.replaceTrack(null);
            transceiver.sender.setStreams();
            renegotiate = true;
          }
        }
      });

      if (renegotiate) {
        await session.renegotiate();
        props.onTrackChanged?.(session.targetClientId, pc);
      }
    }
  }

  createEffect(() => {
    updateRemoteStreams(props.localStream);
  });

  const sendText = async (
    text: string,
    session: PeerSession,
  ) => {
    const message = {
      id: v4(),
      type: "send-text",
      client: session.clientId,
      target: session.targetClientId,
      data: text,
      createdAt: Date.now(),
    } as SendTextMessage;
    session.sendMessage(message);
    messageStores.setSendMessage(message);
    console.log(`send text message`, message);
  };

  const sendFile = async (
    file: File,
    session: PeerSession,
  ) => {
    const fid = v4();
    const target = session.targetClientId;
    const client = session.clientId;
    const message = {
      id: v4(),
      type: "send-file",
      client: client,
      target: target,
      fid: fid,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
      createdAt: Date.now(),
      chunkSize: appOptions.chunkSize,
    } satisfies SendFileMessage;

    const cache = await cacheManager.createCache(
      message.fid,
    );
    cache.setInfo({
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimetype: message.mimeType,
      lastModified: message.lastModified,
      chunkSize: message.chunkSize,
      createdAt: message.createdAt,
      file: file,
    });

    console.log(`send file message`, message);
    messageStores.setSendMessage(message);
    session.sendMessage(message);
  };

  const send = async (
    data: string | File,
    { target }: SendOptions,
  ): Promise<boolean> => {
    const sessions = target
      ? sessionService.sessions[target]
        ? [sessionService.sessions[target]]
        : []
      : Object.values(sessionService.sessions);

    if (sessions.length === 0) return false;

    for (const session of sessions) {
      if (typeof data === "string") {
        sendText(data, session);
      } else if (data instanceof File) {
        sendFile(data, session);
      }
    }

    return true;
  };

  const shareFile = async (
    fileId: FileID,
    target: ClientID,
  ) => {
    const cache = cacheManager.getCache(fileId);
    if (!cache) {
      console.warn(`cache ${fileId} not exist`);
      return;
    }
    const session = sessionService.sessions[target];
    if (!session) {
      console.warn(`session ${target} not exist`);
      return;
    }
    const info = await cache.getInfo();
    if (!info) {
      console.warn(`cache ${fileId} info not exist`);
      return;
    }

    if (!info.file) {
      console.warn(`cache ${fileId} file not exist`);
      return;
    }

    const message = {
      id: v4(),
      type: "send-file",
      client: session.clientId,
      target: session.targetClientId,
      fid: fileId,
      fileName: info.fileName,
      fileSize: info.fileSize,
      mimeType: info.mimetype,
      lastModified: info.lastModified,
      createdAt: Date.now(),
      chunkSize: appOptions.chunkSize,
    } satisfies SendFileMessage;
    messageStores.setSendMessage(message);
    session.sendMessage(message);
  };

  const requestFile = async (
    target: ClientID,
    info: ChunkMetaData,
    resume: boolean = false,
  ) => {
    const session = sessionService.sessions[target];
    if (!session) {
      console.warn(
        `can not request file from target: ${target}, target not exist`,
      );
      return;
    }
    const client = sessionService.clientInfo[target];
    if (client.onlineStatus !== "online") {
      console.warn(
        `can not request file from target: ${target}, client status is ${client.onlineStatus}`,
      );
      return;
    }

    let cache = cacheManager.getCache(info.id);
    console.log(`get local cache`, cache);
    if (!cache) {
      cache = await cacheManager.createCache(info.id);
      await cache.setInfo({
        ...info,
        file: undefined,
      });
      console.log(`create cache`, await cache.getInfo());
    } else {
      console.log(`get local cache`, cache);
    }

    const ranges = await cache.getReqRanges();

    if (ranges && getRangesLength(ranges) === 0) {
      messageStores.addCache(cache);
      await cache.getFile();
      return;
    }

    let index = messageStores.messages.findIndex(
      (msg) => msg.type === "file" && msg.fid === info.id,
    );

    let id;
    if (resume && index !== -1) {
      id = messageStores.messages[index].id;
    } else {
      id = v4();
    }

    const message = {
      id,
      type: "request-file",
      fid: info.id,
      client: session.clientId,
      target: session.targetClientId,
      ranges: ranges ?? undefined,
      fileName: info.fileName,
      fileSize: info.fileSize,
      mimeType: info.mimetype,
      lastModified: info.lastModified,
      chunkSize: info.chunkSize ?? appOptions.chunkSize,
      createdAt: Date.now(),
      resume,
    } satisfies RequestFileMessage;

    messageStores.setSendMessage(message);
    session.sendMessage(message);
  };

  return (
    <WebRTCContext.Provider
      value={{
        joinRoom,
        leaveRoom,
        shareFile,
        send,
        requestFile,
        roomStatus,
        remoteStreams: remoteStreams,
      }}
    >
      {props.children}
    </WebRTCContext.Provider>
  );
};
