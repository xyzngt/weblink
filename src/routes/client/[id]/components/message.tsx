import "photoswipe/style.css";
import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  splitProps,
  Switch,
} from "solid-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/libs/cn";
import {
  Progress,
  ProgressLabel,
  ProgressValueLabel,
} from "@/components/ui/progress";
import { clientProfile } from "@/libs/core/store";
import {
  FileTransferer,
  TransferMode,
} from "@/libs/core/file-transferer";
import createTransferSpeed from "@/libs/hooks/transfer-speed";
import { formatBtyeSize } from "@/libs/utils/format-filesize";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { convertImageToPNG } from "@/libs/utils/conver-to-png";
import {
  FileTransferMessage,
  messageStores,
  SendFileMessage,
  SendTextMessage,
  SessionMessage,
  StoreMessage,
  TextMessage,
} from "@/libs/core/messge";
import { cacheManager } from "@/libs/services/cache-serivce";
import { transferManager } from "@/libs/services/transfer-service";
import { PortableContextMenu } from "@/components/portable-contextmenu";
import {
  IconCheck,
  IconClose,
  IconContentCopy,
  IconDelete,
  IconDownload,
  IconDownloading,
  IconFileCopy,
  IconFileUpload,
  IconInsertDriveFile,
  IconPreview,
  IconRestore,
  IconResume,
  IconSchedule,
} from "@/components/icons";
import { sessionService } from "@/libs/services/session-service";
import { t } from "@/i18n";
import { Dynamic } from "solid-js/web";
import { createTimeAgo } from "@/libs/utils/timeago";
import { FileMetaData } from "@/libs/cache";
import { FileMessageTitle } from "@/components/message-title";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { catchErrorAsync } from "@/libs/catch";
import { toast } from "solid-sonner";
import { Spinner } from "@/components/spinner";
import { createPreviewDialog } from "@/components/preview-dialog";
import { downloadFile } from "@/libs/utils/download-file";

export interface MessageCardProps
  extends ComponentProps<"li"> {
  message: StoreMessage;
  onLoad?: () => void;
  onDelete?: () => void;
}

export interface FileMessageCardProps {
  message: FileTransferMessage;
  onLoad?: () => void;
}

const FileMessageCard: Component<FileMessageCardProps> = (
  props,
) => {
  const { requestFile, resumeFile } = useWebRTC();

  const transferer = createMemo<FileTransferer | null>(
    () => {
      if (!props.message.fid) return null;
      return (
        transferManager.transferers[props.message.fid] ??
        null
      );
    },
  );

  const isSender = createMemo(() => {
    return props.message.client === clientProfile.clientId;
  });

  const targetClientInfo = createMemo(() => {
    if (isSender()) {
      return sessionService.clientInfo[
        props.message.target
      ];
    }
    return sessionService.clientInfo[props.message.client];
  });

  const cacheData = createMemo<FileMetaData | undefined>(
    () =>
      props.message.fid
        ? cacheManager.cacheInfo[props.message.fid]
        : undefined,
  );

  const localStatus = createMemo(() => {
    if (cacheData()?.isComplete) return "complete";
    else if (cacheData()?.isMerging) return "merging";
    else if (transferer()) return "transfering";
    else return "paused";
  });

  const shouldShowResumeButton = createMemo(() => {
    if (!targetClientInfo()?.messageChannel) return false;
    if (props.message.status !== "received") return false;
    if (!props.message.transferStatus) return false;
    if (isSender()) {
      if (
        ["complete", "transfering", "merging"].includes(
          localStatus(),
        ) &&
        ["complete", "transfering"].includes(
          props.message.transferStatus,
        )
      )
        return false;
    } else {
      if (
        ["complete", "transfering", "merging"].includes(
          localStatus(),
        )
      )
        return false;
    }
    return true;
  });

  createEffect(() => {
    if (props.message.type === "file") {
      props.onLoad?.();
    }
  });

  const transferProgress = createMemo(() => {
    if (!props.message.progress) return undefined;
    if (isSender()) {
      if (props.message.transferStatus !== "transfering")
        return undefined;
    } else {
      if (localStatus() !== "transfering") return undefined;
    }
    return props.message.progress;
  });

  return (
    <div class="flex flex-col gap-2">
      <Show
        when={cacheData()}
        fallback={
          <FileMessageTitle
            type="default"
            name={props.message.fileName}
          />
        }
      >
        {(cache) => (
          <>
            <Show
              when={cache().file}
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
                  <p>{cache().fileName}</p>
                </div>
              }
            >
              {(file) => {
                const url = URL.createObjectURL(file());
                const [isLong, setIsLong] =
                  createSignal(false);
                return (
                  <Switch
                    fallback={
                      <div class="flex items-center gap-1">
                        <div>
                          <IconInsertDriveFile class="size-8" />
                        </div>

                        <p>{cache().fileName}</p>
                      </div>
                    }
                  >
                    <Match
                      when={cache().mimetype?.startsWith(
                        "image/",
                      )}
                    >
                      <FileMessageTitle
                        type="image"
                        name={props.message.fileName}
                      />

                      <a
                        id="image"
                        href={url}
                        target="_blank"
                        class={cn(
                          `flex h-full max-h-64 items-center justify-center
                          overflow-hidden rounded-sm hover:cursor-pointer`,
                          isLong()
                            ? "aspect-square"
                            : "aspect-video",
                        )}
                      >
                        <img
                          src={url}
                          alt={cache().fileName}
                          onload={(ev) => {
                            const parent =
                              ev.currentTarget
                                .parentElement!;
                            parent.dataset.pswpWidth =
                              ev.currentTarget.naturalWidth.toString();
                            parent.dataset.pswpHeight =
                              ev.currentTarget.naturalHeight.toString();
                            parent.dataset.download =
                              cache().fileName;

                            const diff =
                              ev.currentTarget
                                .naturalWidth -
                              ev.currentTarget
                                .naturalHeight;
                            if (diff <= 0) {
                              setIsLong(true);
                            }
                            props.onLoad?.();
                          }}
                        />
                      </a>
                    </Match>
                    <Match
                      when={cache().mimetype?.startsWith(
                        "video/",
                      )}
                    >
                      <FileMessageTitle
                        type="video"
                        name={props.message.fileName}
                      />

                      <video
                        class="aspect-video h-full max-h-72 object-contain"
                        controls
                        src={url}
                        onCanPlay={() => props.onLoad?.()}
                      />
                    </Match>
                    <Match
                      when={cache().mimetype?.startsWith(
                        "audio/",
                      )}
                    >
                      <FileMessageTitle
                        type="audio"
                        name={props.message.fileName}
                      />
                      <audio
                        class=""
                        controls
                        src={url}
                        onCanPlay={() => props.onLoad?.()}
                      />
                    </Match>
                  </Switch>
                );
              }}
            </Show>

            <Show
              when={props.message.transferStatus === "init"}
            >
              <Spinner
                size="sm"
                class="bg-black dark:bg-white"
              />
            </Show>
            <Show when={transferProgress()}>
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

            <Show when={localStatus() === "merging"}>
              <div class="flex items-center gap-1">
                <Spinner
                  size="sm"
                  class="bg-black dark:bg-white"
                />
                <p class="font-mono text-sm text-muted-foreground">
                  {t("common.file_table.status.merging")}
                </p>
              </div>
            </Show>

            <div class="flex items-center justify-end gap-1">
              <Show when={cache().file}>
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
                      download={cache().fileName}
                    >
                      <IconDownload class="size-6" />
                    </Button>
                  </>
                )}
              </Show>

              <Show when={shouldShowResumeButton()}>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    if (isSender()) {
                      resumeFile(
                        cache().id,
                        props.message.target,
                      );
                    } else {
                      requestFile(
                        props.message.client,
                        cache(),
                        true,
                      );
                    }
                  }}
                >
                  <IconResume class="size-6" />
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
  const {
    open: openPreviewDialog,
    Component: PreviewDialogComponent,
  } = createPreviewDialog();

  const shouldShowRestoreButton = createMemo(() => {
    if (!targetClientInfo()?.messageChannel) return false;
    if (props.message.status !== "error") return false;
    return true;
  });

  const contentOptions = {
    text: (props: {
      message: TextMessage;
      close: () => void;
    }) => (
      <Show when={navigator.clipboard !== undefined}>
        <ContextMenuItem
          class="gap-2"
          onSelect={async () => {
            const [err] = await catchErrorAsync(
              navigator.clipboard.writeText(
                props.message.data,
              ),
            );
            if (err) {
              toast.error(
                t("common.notification.copy_failed"),
              );
            } else {
              toast.success(
                t("common.notification.copy_success"),
              );
            }
            props.close();
          }}
        >
          <IconContentCopy class="size-4" />
          {t("common.action.copy")}
        </ContextMenuItem>
      </Show>
    ),
    file: (props: {
      message: FileTransferMessage;
      close: () => void;
    }) => (
      <>
        <Show when={navigator.clipboard !== undefined}>
          <ContextMenuItem
            class="gap-2"
            onSelect={async () => {
              const [err] = await catchErrorAsync(
                navigator.clipboard.writeText(
                  props.message.fileName,
                ),
              );

              if (err) {
                toast.error(
                  t("common.notification.copy_failed"),
                );
              } else {
                toast.success(
                  t("common.notification.copy_success"),
                );
              }

              props.close();
            }}
          >
            <IconContentCopy class="size-4" />
            {t("common.action.copy_file_name")}
          </ContextMenuItem>

          <Show
            when={props.message.mimeType?.startsWith(
              "image",
            )}
          >
            <ContextMenuItem
              class="gap-2"
              onSelect={async () => {
                if (!props.message.fid) return;
                const cache = cacheManager.getCache(
                  props.message.fid,
                );
                if (!cache) return;
                const file = await cache.getFile();
                if (!file) return;
                const convertedPng =
                  await convertImageToPNG(file);
                const item = new ClipboardItem({
                  [convertedPng.type]: convertedPng,
                });
                const [err] = await catchErrorAsync(
                  navigator.clipboard.write([item]),
                );

                if (err) {
                  toast.error(
                    t("common.notification.copy_failed"),
                  );
                } else {
                  toast.success(
                    t("common.notification.copy_success"),
                  );
                }

                props.close();
              }}
            >
              <IconFileCopy class="size-4" />
              {t("common.action.copy_as_png")}
            </ContextMenuItem>
            <Show
              when={
                ClipboardItem.supports("image/svg+xml") &&
                props.message.mimeType === "image/svg+xml"
              }
            >
              <ContextMenuItem
                class="gap-2"
                onSelect={async () => {
                  if (!props.message.fid) return;
                  const cache = cacheManager.getCache(
                    props.message.fid,
                  );
                  if (!cache) return;
                  const file = await cache.getFile();
                  if (!file) return;
                  if (file.type !== "image/svg+xml") return;
                  const item = new ClipboardItem({
                    [file.type]: file,
                  });
                  const [err] = await catchErrorAsync(
                    navigator.clipboard.write([item]),
                  );

                  if (err) {
                    toast.error(
                      t("common.notification.copy_failed"),
                    );
                  } else {
                    toast.success(
                      t("common.notification.copy_success"),
                    );
                  }

                  props.close();
                }}
              >
                <IconFileCopy class="size-4" />
                {t("common.action.copy_as_svg")}
              </ContextMenuItem>
            </Show>
          </Show>
        </Show>
        <ContextMenuItem
          class="gap-2"
          onSelect={async () => {
            props.close();
            if (!props.message.fid) return;
            const cache = cacheManager.getCache(
              props.message.fid,
            );
            if (!cache) return;
            const file = await cache.getFile();
            if (!file) return;
            openPreviewDialog(file);
            setTimeout(() => {}, 350);
          }}
        >
          <IconPreview class="size-4" />
          {t("common.action.preview")}
        </ContextMenuItem>
        <ContextMenuItem
          class="gap-2"
          onSelect={async () => {
            if (!props.message.fid) return;
            const cache = cacheManager.getCache(
              props.message.fid,
            );
            if (!cache) return;
            const file = await cache.getFile();
            if (!file) return;
            downloadFile(file);
            props.close();
          }}
        >
          <IconDownload class="size-4" />
          {t("common.action.download")}
        </ContextMenuItem>
      </>
    ),
  } as const;

  const Menu = (props: {
    message: StoreMessage;
    close: () => void;
    onDelete?: () => void;
  }) => {
    return (
      <>
        <Dynamic
          component={contentOptions[props.message.type]}
          message={props.message as any}
          close={props.close}
        />
        <Show when={props.onDelete !== undefined}>
          <ContextMenuItem
            class="gap-2"
            onSelect={() => {
              props.onDelete?.();
              props.close();
            }}
          >
            <IconDelete class="size-4" />
            {t("common.action.delete")}
          </ContextMenuItem>
        </Show>
      </>
    );
  };

  return (
    <PortableContextMenu
      menu={(close) => (
        <Menu
          message={props.message}
          close={close}
          onDelete={props.onDelete}
        />
      )}
    >
      {(p) => (
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
          <PreviewDialogComponent />
          <article class="w-full select-text whitespace-pre-wrap break-all text-sm">
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
            <Show when={props.message.error}>
              {(error) => (
                <Tooltip>
                  <TooltipTrigger class="text-xs text-destructive">
                    {t("client.message_error")}
                  </TooltipTrigger>
                  <TooltipContent>{error()}</TooltipContent>
                </Tooltip>
              )}
            </Show>
            <Show when={shouldShowRestoreButton()}>
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
                    if (!props.message.fid) return;
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

                  messageStores.setReceiveMessage(
                    sessionMessage,
                  );
                  session().sendMessage(sessionMessage);
                }}
              >
                <IconRestore class="size-6" />
              </Button>
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
    </PortableContextMenu>
  );
};

export interface MessageChatProps
  extends ComponentProps<"div"> {
  target: string;
}
