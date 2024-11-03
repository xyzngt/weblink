import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onMount,
  Show,
  splitProps,
  Switch,
} from "solid-js";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Client } from "@/libs/core/type";
import { textareaAutoResize } from "@/libs/hooks/input-resize";
import { cn } from "@/libs/cn";
import {
  Progress,
  ProgressLabel,
  ProgressValueLabel,
} from "@/components/ui/progress";
import { clientProfile } from "@/libs/core/store";
import { ChunkCache } from "@/libs/cache/chunk-cache";
import {
  FileTransferer,
  TransferMode,
} from "@/libs/core/file-transferer";
import createTransferSpeed from "@/libs/hooks/transfer-speed";
import { formatBtyeSize } from "@/libs/utils/format-filesize";
import { ContextMenuItem } from "@/components/ui/context-menu";

import { convertImageToPNG } from "@/libs/utils/conver-to-png";

import "photoswipe/style.css";
import {
  FileTransferMessage,
  messageStores,
  SendClipboardMessage,
  SendFileMessage,
  SendTextMessage,
  SessionMessage,
  StoreMessage,
} from "@/libs/core/messge";
import { cacheManager } from "@/libs/services/cache-serivce";
import { transferManager } from "@/libs/services/transfer-service";
import { PortableContextMenu } from "@/components/portable-contextmenu";
import {
  IconAttachFile,
  IconAudioFileFilled,
  IconCheck,
  IconClose,
  IconContentCopy,
  IconDelete,
  IconDownload,
  IconDownloading,
  IconFileCopy,
  IconFileUpload,
  IconInsertDriveFile,
  IconPhotoFilled,
  IconRestore,
  IconSchedule,
  IconSend,
  IconVideoFileFilled,
} from "@/components/icons";
import { sessionService } from "@/libs/services/session-service";
import { t } from "@/i18n";
import { Dynamic } from "solid-js/web";

import { createTimeAgo } from "@/libs/utils/timeago";
import { FileMetaData } from "@/libs/cache";
export interface MessageCardProps
  extends ComponentProps<"li"> {
  message: StoreMessage;
  onLoad?: () => void;
}

export interface FileMessageCardProps {
  message: FileTransferMessage;
  onLoad?: () => void;
}

const FileTitle = {
  image: (props: { name: string }) => (
    <p class="relative">
      {" "}
      <span
        class="absolute left-0 right-0 overflow-hidden text-ellipsis
          whitespace-nowrap"
      >
        <IconPhotoFilled class="inline size-4 align-middle" />{" "}
        {props.name}
      </span>
    </p>
  ),
  video: (props: { name: string }) => (
    <p class="relative">
      {" "}
      <span
        class="absolute left-0 right-0 overflow-hidden text-ellipsis
          whitespace-nowrap"
      >
        <IconVideoFileFilled class="inline size-4 align-middle" />{" "}
        {props.name}
      </span>
    </p>
  ),
  audio: (props: { name: string }) => (
    <p class="relative">
      {" "}
      <span
        class="absolute left-0 right-0 overflow-hidden text-ellipsis
          whitespace-nowrap"
      >
        <IconAudioFileFilled class="inline size-4 align-middle" />{" "}
        {props.name}
      </span>
    </p>
  ),
  default: (props: { name: string }) => (
    <div class="flex items-center gap-1">
      <div>
        <IconInsertDriveFile class="size-8" />
      </div>

      <p> {props.name}</p>
    </div>
  ),
};

const FileMessageCard: Component<FileMessageCardProps> = (
  props,
) => {
  const { requestFile } = useWebRTC();
  const fileCache = createMemo<ChunkCache | null>(
    () => cacheManager.caches[props.message.fid] ?? null,
  );

  const transferer = createMemo<FileTransferer | null>(
    () =>
      transferManager.transferers[props.message.fid] ??
      null,
  );

  const clientInfo = createMemo(
    () => sessionService.clientInfo[props.message.client],
  );

  const cacheData = createMemo<FileMetaData | undefined>(
    () => cacheManager.cacheInfo[props.message.fid],
  );

  // createEffect(async () => {
  //   const cacheData = cache();
  //   if (cacheData) {
  //     const info = await cacheData.getInfo();
  //     const done = await cacheData.isDone();
  //     if (done && !info?.file) {
  //       messageStores.addCache(cacheData);
  //       cacheData.getFile();
  //     }
  //   }
  // });

  createEffect(() => {
    if (props.message.type === "file") {
      props.onLoad?.();
    }
  });

  return (
    <div class="flex flex-col gap-2">
      <Show
        when={cacheData()}
        fallback={
          <Dynamic
            component={FileTitle["default"]}
            name={props.message.fileName}
          />
        }
      >
        {(info) => (
          <>
            <Show
              when={info().file}
              fallback={
                <div class="flex items-center gap-1">
                  <div>
                    <Switch
                      fallback={
                        <IconSchedule class="size-8" />
                      }
                    >
                      <Match
                        when={
                          transferer()?.mode ===
                          TransferMode.Receive
                        }
                      >
                        <IconDownloading class="size-8" />
                      </Match>
                      <Match
                        when={
                          transferer()?.mode ===
                          TransferMode.Send
                        }
                      >
                        <IconFileUpload class="size-8" />
                      </Match>
                    </Switch>
                  </div>
                  <p>{info().fileName}</p>
                </div>
              }
            >
              {(file) => {
                const url = URL.createObjectURL(file());

                return (
                  <Switch
                    fallback={
                      <div class="flex items-center gap-1">
                        <div>
                          <IconInsertDriveFile class="size-8" />
                        </div>

                        <p>{info().fileName}</p>
                      </div>
                    }
                  >
                    <Match
                      when={info().mimetype?.startsWith(
                        "image/",
                      )}
                    >
                      <Dynamic
                        component={FileTitle["image"]}
                        name={props.message.fileName}
                      />

                      <a
                        id="image"
                        href={url}
                        target="_blank"
                      >
                        <img
                          class="flex max-h-48 rounded-sm bg-muted hover:cursor-pointer
                            lg:max-h-72 xl:max-h-96"
                          src={url}
                          alt={info().fileName}
                          onload={(ev) => {
                            const parent =
                              ev.currentTarget
                                .parentElement!;
                            parent.dataset.pswpWidth =
                              ev.currentTarget.naturalWidth.toString();
                            parent.dataset.pswpHeight =
                              ev.currentTarget.naturalHeight.toString();
                            parent.dataset.download =
                              info().fileName;

                            props.onLoad?.();
                          }}
                        />
                      </a>
                    </Match>
                    <Match
                      when={info().mimetype?.startsWith(
                        "video/",
                      )}
                    >
                      <Dynamic
                        component={FileTitle["video"]}
                        name={props.message.fileName}
                      />
                      <video
                        class="max-h-60 lg:max-h-72 xl:max-h-96"
                        controls
                        src={url}
                        onCanPlay={() => props.onLoad?.()}
                      />
                    </Match>
                    <Match
                      when={info().mimetype?.startsWith(
                        "audio/",
                      )}
                    >
                      <Dynamic
                        component={FileTitle["audio"]}
                        name={props.message.fileName}
                      />
                      <audio
                        class="max-h-60 lg:max-h-72 xl:max-h-96"
                        controls
                        src={url}
                        onCanPlay={() => props.onLoad?.()}
                      />
                    </Match>
                  </Switch>
                );
              }}
            </Show>

            <Switch fallback={<></>}>
              <Match
                when={
                  props.message.transferStatus ===
                  "processing"
                }
              >
                <Show when={props.message.progress}>
                  {(progress) => {
                    const speed = createTransferSpeed(
                      () => progress().received,
                    );

                    return (
                      <Progress
                        value={progress().received}
                        maxValue={progress().total}
                        getValueLabel={({ value, max }) =>
                          `${((value / max) * 100).toFixed(
                            2,
                          )}% ${formatBtyeSize(value)}/${formatBtyeSize(max)}`
                        }
                      >
                        <div
                          class="mb-1 flex justify-between gap-2 font-mono text-xs
                            text-muted-foreground"
                        >
                          <ProgressLabel>
                            {progress().received !==
                            progress().total
                              ? speed()
                                ? `${formatBtyeSize(speed()!, 2)}/s`
                                : `waiting...`
                              : progress().received === 0
                                ? `starting...`
                                : `loading...`}
                          </ProgressLabel>
                          <ProgressValueLabel />
                        </div>
                      </Progress>
                    );
                  }}
                </Show>
              </Match>
              <Match
                when={
                  props.message.transferStatus === "merging"
                }
              >
                <p class="font-mono text-sm text-muted-foreground">
                  merging...
                </p>
              </Match>
            </Switch>

            <div class="flex items-center justify-end gap-1">
              <Show when={info().file}>
                {(file) => (
                  <>
                    <p class="muted mr-auto">
                      {formatBtyeSize(file().size, 1)}
                    </p>
                    <Button
                      as="a"
                      variant="ghost"
                      size="icon"
                      href={URL.createObjectURL(file())}
                      download={info().fileName}
                    >
                      <IconDownload class="size-6" />
                    </Button>
                  </>
                )}
              </Show>
              <Show
                when={
                  !transferer() &&
                  !["merging", "complete"].includes(
                    props.message.transferStatus ?? "",
                  ) &&
                  !info().file &&
                  clientInfo()?.onlineStatus === "online"
                }
              >
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    requestFile(
                      props.message.client,
                      info().id,
                    );
                  }}
                >
                  <IconRestore class="size-6" />
                </Button>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export const MessageContent: Component<MessageCardProps> = (
  props,
) => {
  const [local, other] = splitProps(props, [
    "class",
    "message",
    "onLoad",
  ]);
  const targetClientInfo = createMemo(
    () => sessionService.clientInfo[local.message.target],
  );
  const session = createMemo(
    () => sessionService.sessions[local.message.target],
  );
  const contentOptions = {
    text: (props: {
      message: StoreMessage;
      close: () => void;
    }) => (
      <ContextMenuItem
        class="gap-2"
        onSelect={() => {
          if (local.message.type === "text")
            navigator.clipboard.writeText(
              local.message.data,
            );

          props.close();
        }}
      >
        <IconContentCopy class="size-4" />
        {t("common.action.copy")}
      </ContextMenuItem>
    ),
    file: (props: {
      message: FileTransferMessage;
      close: () => void;
    }) => (
      <>
        <ContextMenuItem
          class="gap-2"
          onSelect={() => {
            if (local.message.type === "file")
              navigator.clipboard.writeText(
                local.message.fileName,
              );

            props.close();
          }}
        >
          <IconContentCopy class="size-4" />
          {t("common.action.copy_file_name")}
        </ContextMenuItem>
        <Show
          when={(
            props.message as FileTransferMessage
          ).mimeType?.startsWith("image")}
        >
          <ContextMenuItem
            class="gap-2"
            onSelect={async () => {
              if (local.message.type === "file") {
                const cache = cacheManager.getCache(
                  local.message.fid,
                );
                if (!cache) return;
                const file = await cache.getFile();
                if (!file) return;
                const blob = await convertImageToPNG(file);
                const item = new ClipboardItem({
                  [blob.type]: blob,
                });
                navigator.clipboard.write([item]);
              }

              props.close();
            }}
          >
            <IconFileCopy class="size-4" />
            {t("common.action.copy_image")}
          </ContextMenuItem>
        </Show>
      </>
    ),
  } as const;

  const Menu = (props: {
    message: StoreMessage;
    close: () => void;
  }) => {
    return (
      <>
        <Dynamic
          component={contentOptions[props.message.type]}
          message={props.message}
          close={props.close}
        />

        <ContextMenuItem
          class="gap-2"
          onSelect={() => {
            messageStores.deleteMessage(props.message.id);
            props.close();
          }}
        >
          <IconDelete class="size-4" />
          {t("common.action.delete")}
        </ContextMenuItem>
      </>
    );
  };

  return (
    <PortableContextMenu
      menu={(close) => (
        <Menu message={props.message} close={close} />
      )}
      content={(p) => (
        <li
          class={cn(
            `flex select-none flex-col gap-1 rounded-md p-2 shadow
            backdrop-blur`,
            clientProfile.clientId === props.message.client
              ? "self-end bg-lime-200/80 dark:bg-indigo-900/80"
              : "self-start border border-border bg-background/80",
            local.class,
          )}
          {...p}
          {...other}
        >
          <article class="w-fit select-text whitespace-pre-wrap break-all text-sm">
            <Switch>
              <Match
                when={
                  props.message.type === "text" &&
                  props.message
                }
              >
                {(message) => (
                  <>
                    <p>{message().data}</p>
                  </>
                )}
              </Match>
              <Match
                when={
                  props.message.type === "file" &&
                  props.message
                }
              >
                {(message) => (
                  <FileMessageCard
                    message={message()}
                    onLoad={() => local.onLoad?.()}
                  />
                )}
              </Match>
            </Switch>
          </article>
          <div class="flex items-center justify-end gap-2">
            <p class="text-xs text-destructive">
              {props.message.error}
            </p>
            <Show when={props.message.status === "error"}>
              <Show
                when={
                  targetClientInfo()?.onlineStatus ===
                  "online"
                }
              >
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    let sessionMessage:
                      | SessionMessage
                      | undefined;

                    if (props.message.type === "text") {
                      sessionMessage = {
                        id: props.message.id,
                        type: "send-text",
                        client: props.message.client,
                        target: props.message.target,
                        data: props.message.data,
                        createdAt: props.message.createdAt,
                      } satisfies SendTextMessage;
                    } else if (
                      props.message.type === "file"
                    ) {
                      sessionMessage = {
                        id: props.message.id,
                        type: "send-file",
                        client: props.message.client,
                        target: props.message.target,
                        fid: props.message.fid,
                        fileName: props.message.fileName,
                        mimeType: props.message.mimeType,
                        chunkSize: props.message.chunkSize,
                        createdAt: props.message.createdAt,
                        fileSize: props.message.fileSize,
                      } satisfies SendFileMessage;
                    }
                    if (!sessionMessage) return;

                    messageStores.handleReceiveMessage(
                      sessionMessage,
                    );
                    session().sendMessage(sessionMessage);
                  }}
                >
                  <IconRestore class="size-6" />
                </Button>
              </Show>
            </Show>
          </div>

          <div
            class="flex justify-end gap-1 self-end text-xs
              text-muted-foreground"
          >
            <p>{createTimeAgo(props.message.createdAt)}</p>
            <p>
              <Switch>
                <Match
                  when={props.message.status === "sending"}
                >
                  <IconSchedule class="size-4" />
                </Match>
                <Match
                  when={props.message.status === "received"}
                >
                  <IconCheck class="size-4" />
                </Match>
                <Match
                  when={props.message.status === "error"}
                >
                  <IconClose class="size-4 text-destructive" />
                </Match>
              </Switch>
            </p>
          </div>
        </li>
      )}
    />
  );
};

export interface MessageChatProps
  extends ComponentProps<"div"> {
  target: string;
}
