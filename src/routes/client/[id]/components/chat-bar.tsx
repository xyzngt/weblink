import { useWebRTC } from "@/libs/core/rtc-context";
import {
  Component,
  ComponentProps,
  createEffect,
  createSignal,
  Show,
  splitProps,
} from "solid-js";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Client } from "@/libs/core/type";
import { textareaAutoResize } from "@/libs/hooks/input-resize";
import { cn } from "@/libs/cn";

import "photoswipe/style.css";
import { zip } from "fflate";
import {
  IconAttachFile,
  IconFolder,
  IconSend,
  IconVideoFileFilled,
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

export const ChatBar: Component<
  ComponentProps<"div"> & { client: Client }
> = (props) => {
  const [local, other] = splitProps(props, [
    "client",
    "class",
  ]);
  const { send } = useWebRTC();
  const [text, setText] = createSignal("");

  const { open: openPreview, Component: PreviewDialog } =
    createSendItemPreviewDialog();
  const isMobile = createIsMobile();
  const onSend = async () => {
    if (text().trim().length === 0) return;
    try {
      if (
        await send(text(), {
          target: props.client.clientId,
        })
      ) {
        setText("");
      }
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
      send(file, {
        target: local.client.clientId,
      });
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
        onSubmit={async (ev) => {
          ev.preventDefault();
          onSend();
        }}
      >
        <Textarea
          ref={(ref) => {
            createEffect(() => {
              textareaAutoResize(ref, text);
            });
          }}
          rows="1"
          class="max-h-48 resize-none"
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              if (e.ctrlKey || e.shiftKey) {
                e.preventDefault();
                await onSend();
              }
            }
          }}
          placeholder={t("client.message_editor.placeholder")}
          value={text()}
          onInput={(ev) => setText(ev.currentTarget.value)}
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
            const items = clipboardData?.items;
            if (!items) return;

            const files = await handleDropItems(items);

            for (const file of files) {
              const { result } = await openPreview(
                file,
                props.client.name,
              );
              if (result) {
                send(file, {
                  target: local.client.clientId,
                });
              }
            }
          }}
        />
      </form>
      <div class="flex gap-1">
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
        <div class="ml-auto"></div>

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
              const file = await handleSelectFolder(
                ev.currentTarget.files,
              );
              send(file, {
                target: local.client.clientId,
              });
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

        <Button
          form="send"
          type="submit"
          variant="ghost"
          size="icon"
        >
          <IconSend class="size-6" />
        </Button>
      </div>
    </div>
  );
};
