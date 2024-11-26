import { t } from "@/i18n";
import { createDialog } from "../dialogs/dialog";
import {
  Accessor,
  createEffect,
  createSignal,
  For,
} from "solid-js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { toast } from "solid-sonner";
import { SendClipboardMessage } from "@/libs/core/messge";
import { createTimeAgo } from "@/libs/utils/timeago";
export const createClipboardHistoryDialog = () => {
  const { open: openDialog, Component } = createDialog({
    title: () => t("common.clipboard_history.title"),
    content: () => (
      <div class="max-h-[60vh] overflow-y-auto p-2">
        <ul class="flex flex-col-reverse gap-2">
          <For each={clipboardCacheData()}>
            {(item) => (
              <Tooltip>
                <TooltipTrigger
                  as="li"
                  class="flex cursor-pointer flex-col rounded-md border border-border
                    p-2 text-sm hover:bg-muted"
                  onClick={() => {
                    navigator.clipboard &&
                      navigator.clipboard
                        .writeText(item.data)
                        .then(() => {
                          toast.success(
                            t(
                              "common.notification.copy_success",
                            ),
                          );
                        });
                  }}
                >
                  <p class="line-clamp-2 overflow-hidden whitespace-pre-wrap text-wrap">
                    {item.data}
                  </p>
                  <p class="self-end text-xs text-muted-foreground">
                    {createTimeAgo(item.createdAt)}
                  </p>
                </TooltipTrigger>
                <TooltipContent class="whitespace-pre-wrap">
                  {item.data}
                </TooltipContent>
              </Tooltip>
            )}
          </For>
        </ul>
      </div>
    ),
  });

  const [clipboardCacheData, setClipboardCacheData] =
    createSignal<SendClipboardMessage[]>([]);

  const open = (
    clipboardCacheData: Accessor<SendClipboardMessage[]>,
  ) => {
    createEffect(() => {
      setClipboardCacheData(clipboardCacheData());
    });
    openDialog();
  };

  return { open, Component };
};
