import { createSignal } from "solid-js";
import { For } from "solid-js";
import { createDialog } from "./dialogs/dialog";
import { t } from "@/i18n";
import { Button } from "./ui/button";

export const createComfirmDeleteItemsDialog = () => {
  const [names, setNames] = createSignal<string[]>([]);
  const {
    open: openDeleteDialog,
    close,
    submit,
    Component,
  } = createDialog<boolean>({
    title: () =>
      t("common.confirm_delete_files_dialog.title"),
    description: () =>
      t("common.confirm_delete_files_dialog.description", {
        count: names().length,
      }),
    content: () => (
      <div class="overflow-y-auto">
        <ul class="text-ellipsis text-nowrap">
          <For each={names()}>
            {(name) => <li class="text-sm">{name}</li>}
          </For>
        </ul>
      </div>
    ),

    cancel: (
      <Button onClick={() => close()}>
        {t("common.action.cancel")}
      </Button>
    ),
    confirm: (
      <Button
        variant="destructive"
        onClick={() => submit(true)}
      >
        {t("common.action.confirm")}
      </Button>
    ),
  });

  const open = async (names: string[]) => {
    setNames(names);
    return await openDeleteDialog();
  };

  return { open, Component };
};
