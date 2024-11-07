import { ChunkMetaData } from "../cache";
import { SendClipboardMessage } from "./messge";
import { TransferClient } from "./services/type";

export type RoomStatus = {
  roomId: RoomID | null;
  profile: ClientInfo | null;
};

export interface UpdateProfile {
  name?: string;
  roomId?: RoomID;
  clientId?: ClientID;
}

export interface Client {
  clientId: ClientID;
  name: string;
  avatar: string | null;
}

export interface CreateClient extends Client {
  password?: string;
}

export interface ClientInfo extends TransferClient {
  statsReports?: any[];
  candidateType?: string;
  onlineStatus: "offline" | "online" | "connecting";
  clipboard?: SendClipboardMessage[];
  storage?: ChunkMetaData[];
  messageChannel: boolean;
}
export type RoomID = string;
export type ClientID = string;
export type SessionID = string;

export type FileID = string;
