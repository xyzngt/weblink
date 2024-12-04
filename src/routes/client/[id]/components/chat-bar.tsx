import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Component,
  ComponentProps,
  createEffect,
  createSignal,
  Show,
  splitProps,
} from "solid-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Client } from "@/libs/core/type";
import { textareaAutoResize } from "@/libs/hooks/input-resize";
import { cn } from "@/libs/cn";

import {
  IconAttachFile,
  IconFolder,
  IconSend,
} from "@/components/icons";
import { t } from "@/i18n";
import { createSendItemPreviewDialog } from "@/components/preview-dialog";
import { toast } from "solid-sonner";
import { appOptions } from "@/options";

import { createIsMobile } from "@/libs/hooks/create-mobile";
import {
  handleDropItems,
  handleSelectFolder,
} from "@/libs/utils/process-file";
import { catchErrorAsync } from "@/libs/catch";

export const ChatBar: Component<
  ComponentProps<"div"> & { client: Client }
> = (props) => {
  const [local, other] = splitProps(props, [
    "client",
    "class",
  ]);
  const { sendText, sendFile } = useWebRTC();
  const [text, setText] = createSignal("");

  const { open: openPreview, Component: PreviewDialog } =
    createSendItemPreviewDialog();
  const isMobile = createIsMobile();
  const onSend = async () => {
    if (text().trim().length === 0) return;
    try {
      await sendText(text().trim(), props.client.clientId);
      setText("");
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error(t("common.notification.unknown_error"));
      }
    }
  };

  const handleSendFiles = (files: File[] | FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file =
        files instanceof FileList
          ? files.item(i)!
          : files[i];

      if (file.webkitRelativePath) {
        return;
      }
      sendFile(file, local.client.clientId);
    }
  };

  return (
    <div
      class={cn(
        `sticky bottom-0 z-10 flex flex-col gap-1 border-t
        border-border bg-background/80 backdrop-blur`,
        local.class,
      )}
      {...other}
    >
      <PreviewDialog />
      <form
        id="send"
        class="flex flex-col gap-1"
        onSubmit={async (ev) => {
          ev.preventDefault();
          onSend();
        }}
      >
        <div class="flex gap-1">
          <Button as="label" variant="ghost" size="icon">
            <IconFolder class="size-6" />
            <Input
              // @ts-expect-error
              webkitdirectory
              mozdirectory
              directory
              class="hidden"
              type="file"
              onChange={async (ev) => {
                if (!ev.currentTarget.files) return;
                const abortController =
                  new AbortController();
                const toastId = toast.loading(
                  t("common.notification.processing_files"),
                  {
                    duration: Infinity,
                    action: {
                      label: t("common.action.cancel"),
                      onClick: () =>
                        abortController.abort(
                          "User cancelled",
                        ),
                    },
                  },
                );
                const [error, file] = await catchErrorAsync(
                  handleSelectFolder(
                    ev.currentTarget.files,
                    abortController.signal,
                  ),
                );
                toast.dismiss(toastId);
                if (error) {
                  console.warn(error);
                  if (error.message !== "User cancelled") {
                    toast.error(error.message);
                  }
                  return;
                }
                sendFile(file, local.client.clientId);
              }}
            />
          </Button>
          <Button as="label" variant="ghost" size="icon">
            <IconAttachFile class="size-6" />
            <Input
              multiple
              class="hidden"
              type="file"
              onChange={(ev) => {
                ev.currentTarget.files &&
                  handleSendFiles(ev.currentTarget.files);
              }}
            />
          </Button>
        </div>
        <label
          class={cn(
            `relative rounded-md border border-input bg-transparent pl-3
            text-sm shadow-sm placeholder:text-muted-foreground
            focus-within:outline-none focus-within:ring-1
            focus-within:ring-ring disabled:cursor-not-allowed
            disabled:opacity-50`,
            "flex items-center",
          )}
        >
          <textarea
            class="my-1 max-h-36 flex-1 resize-none overflow-y-auto
              bg-transparent outline-none scrollbar-none"
            ref={(ref) => {
              createEffect(() => {
                textareaAutoResize(ref, text);
              });
            }}
            rows="1"
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                if (e.ctrlKey || e.shiftKey) {
                  e.preventDefault();
                  await onSend();
                }
              }
            }}
            placeholder={
              isMobile()
                ? t(
                    "client.message_editor.mobile_placeholder",
                  )
                : t("client.message_editor.placeholder")
            }
            value={text()}
            onInput={(ev) =>
              setText(ev.currentTarget.value)
            }
            onPaste={async (ev) => {
              if (
                navigator.clipboard &&
                appOptions.enableClipboard
              ) {
                if (!isMobile()) {
                  ev.stopPropagation();
                } else {
                  setTimeout(() => {
                    setText("");
                  }, 0);
                }
              }
              const clipboardData = ev.clipboardData;

              if (!clipboardData?.items) return;

              console.log(clipboardData.items);

              const abortController = new AbortController();
              const toastId = toast.loading(
                t("common.notification.processing_files"),
                {
                  duration: Infinity,
                  action: {
                    label: t("common.action.cancel"),
                    onClick: () =>
                      abortController.abort(
                        "User cancelled",
                      ),
                  },
                },
              );

              const [error, files] = await catchErrorAsync(
                handleDropItems(
                  clipboardData.items,
                  abortController.signal,
                ),
              );
              toast.dismiss(toastId);
              if (error) {
                console.warn(error);
                if (error.message !== "User cancelled") {
                  toast.error(error.message);
                }
                return;
              }
              for (const file of files) {
                const { result } = await openPreview(
                  file,
                  props.client.name,
                );
                if (result) {
                  sendFile(file, local.client.clientId);
                }
              }
            }}
          />

          <Button
            form="send"
            type="submit"
            variant="ghost"
            size="icon"
            class="self-end"
            disabled={text().trim().length === 0}
          >
            <IconSend class="size-6" />
          </Button>
        </label>
      </form>
      <div class="flex gap-1">
        <div class="ml-auto"></div>
        <Show
          when={
            isMobile() &&
            navigator.clipboard &&
            appOptions.enableClipboard
          }
        >
          <p class="text-xs text-muted-foreground">
            {t("client.message_editor.paste_tip")}
          </p>
        </Show>
      </div>
    </div>
  );
};
