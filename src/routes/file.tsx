import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBtyeSize } from "@/libs/utils/format-filesize";
import { reset } from "@/libs/utils/syncscroll";
import {
  Progress,
  ProgressValueLabel,
} from "@/components/ui/progress";

import {
  ColumnFiltersState,
  ColumnPinningState,
  createColumnHelper,
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  VisibilityState,
  Table as SolidTable,
} from "@tanstack/solid-table";
import { getCommonPinningStyles } from "@/components/data-table/data-table-pin-style";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuItemLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/libs/cn";
import { cacheManager } from "@/libs/services/cache-serivce";
import {
  Checkbox,
  CheckboxControl,
} from "@/components/ui/checkbox";
import {
  IconAdd,
  IconClose,
  IconClose700,
  IconDelete,
  IconDownload,
  IconFolder,
  IconForward,
  IconMenu,
  IconMoreHoriz,
  IconPageInfo,
  IconPlaceItem,
  IconPreview,
  IconSearch700,
  IconWallpaper,
} from "@/components/icons";
import { createDialog } from "@/components/dialogs/dialog";
import { t } from "@/i18n";
import { createPreviewDialog } from "@/components/preview-dialog";
import {
  createElementSize,
  Size,
} from "@solid-primitives/resize-observer";
import { createStore } from "solid-js/store";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { appOptions, setAppOptions } from "@/options";
import { createForwardDialog } from "@/components/forward-dialog";
import { FileMetaData } from "@/libs/cache";
import { downloadFile } from "@/libs/utils/download-file";
import DataTableColumnVisibility from "@/components/data-table/data-table-column-visibility";
import { makePersisted } from "@solid-primitives/storage";
import { PortableContextMenu } from "@/components/portable-contextmenu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import {
  handleDropItems,
  handleSelectFolder,
} from "@/libs/utils/process-file";
import DropArea from "@/components/drop-area";
import { createComfirmDeleteDialog } from "@/components/confirm-delete-dialog";

const columnHelper = createColumnHelper<FileMetaData>();

const StorageStatus = () => {
  if (!navigator.storage) {
    return <></>;
  }

  const [storage, setStorage] =
    createSignal<StorageEstimate | null>(null);

  createEffect(async () => {
    if (Object.values(cacheManager.caches).length >= 0) {
      const estimate = await navigator.storage.estimate();
      setStorage(estimate);
    }
  });

  return (
    <Show when={storage()}>
      {(storage) => (
        <Progress
          value={storage().usage}
          maxValue={storage().quota}
          getValueLabel={({ value, max }) =>
            t("cache.usage", {
              value: formatBtyeSize(value),
              max: formatBtyeSize(max),
              remaining: formatBtyeSize(max - value),
            })
          }
        >
          <div class="muted mb-1 flex justify-end text-sm">
            <ProgressValueLabel />
          </div>
        </Progress>
      )}
    </Show>
  );
};

export default function File() {
  const {
    open: openPreviewDialog,
    Component: PreviewDialogComponent,
  } = createPreviewDialog();

  onMount(() => {
    reset();
  });

  const {
    forwardCache: shareCache,
    Component: ForwardDialogComponent,
  } = createForwardDialog();

  const columns = [
    columnHelper.display({
      id: "select",
      size: 0,
      header: ({ table }) => (
        <Checkbox
          role="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        >
          <CheckboxControl />
        </Checkbox>
      ),

      cell: ({ row }) => (
        <Checkbox
          role="checkbox"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        >
          <CheckboxControl />
        </Checkbox>
      ),
      enableSorting: false,
      enableHiding: false,
      enablePinning: true,

      enableColumnFilter: false,
      enableGlobalFilter: false,
    }),
    columnHelper.accessor("fileName", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("common.file_table.columns.name")}
        />
      ),
      cell: (info) => (
        <p class="max-w-xs overflow-hidden text-ellipsis">
          {info.getValue()}
        </p>
      ),
      enableGlobalFilter: true,
    }),
    columnHelper.accessor("fileSize", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("common.file_table.columns.size")}
        />
      ),
      cell: (info) => formatBtyeSize(info.getValue(), 1),
    }),
    columnHelper.accessor("createdAt", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("common.file_table.columns.created_at")}
        />
      ),
      cell: (info) => {
        const value = info.getValue();
        return value ? (
          new Date(value).toLocaleString()
        ) : (
          <></>
        );
      },
      sortingFn: (rowA, rowB) => {
        return (
          (rowA.original.createdAt ?? 0) -
          (rowB.original.createdAt ?? 0)
        );
      },
    }),
    columnHelper.accessor("lastModified", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t(
            "common.file_table.columns.last_modified",
          )}
        />
      ),
      cell: (info) => {
        const value = info.getValue();
        return value ? (
          new Date(value).toLocaleString()
        ) : (
          <></>
        );
      },
      sortingFn: (rowA, rowB) => {
        return (
          (rowA.original.lastModified ?? 0) -
          (rowB.original.lastModified ?? 0)
        );
      },
    }),
    columnHelper.accessor("mimetype", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("common.file_table.columns.mime_type")}
        />
      ),
      cell: (info) => (
        <p class="max-w-xs overflow-hidden text-ellipsis">
          {info.getValue() ?? "-"}
        </p>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div class="w-9" />,
      cell: ({ row }) => (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon">
                <IconMoreHoriz class="size-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuGroupLabel>
                  {t("common.action.actions")}
                </DropdownMenuGroupLabel>
                <Show when={row.original.file}>
                  {(file) => (
                    <>
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={() => {
                          downloadFile(file());
                        }}
                      >
                        <IconDownload class="size-4" />
                        {t("common.action.download")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={() => {
                          openPreviewDialog(file());
                        }}
                      >
                        <IconPreview class="size-4" />
                        {t("common.action.preview")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={() => {
                          shareCache([row.original]);
                        }}
                      >
                        <IconForward class="size-4" />
                        {t("common.action.forward")}
                      </DropdownMenuItem>
                      <Show
                        when={file().type.startsWith(
                          "image/",
                        )}
                      >
                        <DropdownMenuItem
                          class="gap-2"
                          onSelect={() => {
                            setAppOptions({
                              backgroundImage:
                                row.original.id,
                            });
                          }}
                        >
                          <IconWallpaper class="size-4" />
                          {t(
                            "common.action.set_as_background",
                          )}
                        </DropdownMenuItem>
                      </Show>
                    </>
                  )}
                </Show>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="gap-2"
                  onSelect={async () => {
                    if (
                      (
                        await openDeleteDialog([
                          row.original.fileName,
                        ])
                      ).result
                    ) {
                      cacheManager.remove(row.original.id);
                    }
                  }}
                >
                  <IconDelete class="size-4" />
                  {t("common.action.delete")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ),
      size: 0,
      enableSorting: false,
      enableHiding: false,
    }),
  ];

  const [columnFilters, setColumnFilters] = makePersisted(
    createSignal<ColumnFiltersState>([]),
    {
      name: "file-column-filters",
      storage: sessionStorage,
    },
  );
  const [columnVisibility, setColumnVisibility] =
    makePersisted(createSignal<VisibilityState>({}), {
      name: "file-column-visibility",
      storage: sessionStorage,
    });

  const [sorting, setSorting] = makePersisted(
    createSignal<SortingState>([]),
    {
      name: "file-sorting",
      storage: sessionStorage,
    },
  );
  const [globalFilter, setGlobalFilter] = createSignal("");
  const [rowSelection, setRowSelection] =
    createSignal<RowSelectionState>({});
  const [columnPinning, setColumnPinning] =
    createSignal<ColumnPinningState>({
      left: ["select"],
      right: ["actions"],
    });

  const data = createMemo(() =>
    cacheManager.status() === "ready"
      ? Object.values(cacheManager.cacheInfo)
      : [],
  );

  // createEffect(() => {
  //   console.debug("get file data", data());
  // });

  const table: SolidTable<FileMetaData> = createSolidTable({
    get data() {
      return data();
    },
    columns,
    state: {
      get columnFilters() {
        return columnFilters();
      },
      get globalFilter() {
        return globalFilter();
      },
      get columnPinning() {
        return columnPinning();
      },
      get rowSelection() {
        return rowSelection();
      },
      get sorting() {
        return sorting();
      },
      get columnVisibility() {
        return columnVisibility();
      },
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnPinningChange: setColumnPinning,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    // getFacetedUniqueValues: getFacetedUniqueValues(),
    // getFacetedMinMaxValues: getFacetedMinMaxValues(),

    getRowId: (row) => row.id,

    // debugAll: true,
  });

  const [tableBody, setTableBody] = createSignal<
    HTMLElement | undefined
  >();
  const size = createElementSize(tableBody);

  const [tableCellSizes, setTableCellSizes] = createStore<
    Size[]
  >([]);

  const {
    open: openDeleteDialog,
    Component: DeleteDialogComponent,
  } = createComfirmDeleteDialog();
  return (
    <>
      <DeleteDialogComponent />
      <PreviewDialogComponent />
      <ForwardDialogComponent />
      <PortableContextMenu
        menu={(close) => (
          <>
            <ContextMenuItem
              as="label"
              class="gap-2"
              onSelect={() => {
                close();
              }}
            >
              <input
                class="hidden"
                type="file"
                // @ts-expect-error
                webkitdirectory
                mozdirectory
                directory
                onChange={async (ev) => {
                  if (!ev.currentTarget.files) return;
                  const file = await handleSelectFolder(
                    ev.currentTarget.files,
                  );

                  const cache =
                    await cacheManager.createCache();
                  cache.setInfo({
                    fileName: file.name,
                    fileSize: file.size,
                    mimetype: file.type,
                    lastModified: file.lastModified,
                    chunkSize: appOptions.chunkSize,
                    createdAt: Date.now(),
                    file,
                  });
                }}
              />
              <IconFolder class="size-4" />
              {t("common.action.add_folder")}
            </ContextMenuItem>
          </>
        )}
      >
        {(p) => (
          <label
            class="fixed bottom-4 right-4 z-50 flex size-12 items-center
              justify-center rounded-full bg-muted/80 shadow-md
              backdrop-blur"
            style={{
              right:
                "calc(1rem + var(--scrollbar-width, 0px))",
            }}
            {...p}
          >
            <input
              type="file"
              class="hidden"
              multiple
              onChange={async (ev) => {
                const files = ev.currentTarget.files;
                for (const file of files ?? []) {
                  const cache =
                    await cacheManager.createCache();
                  cache.setInfo({
                    fileName: file.name,
                    fileSize: file.size,
                    mimetype: file.type,
                    lastModified: file.lastModified,
                    chunkSize: appOptions.chunkSize,
                    createdAt: Date.now(),
                    file,
                  });
                }
              }}
            />
            <IconAdd class="size-8" />
          </label>
        )}
      </PortableContextMenu>
      <div
        class="container pointer-events-none fixed inset-0 z-[-1]
          backdrop-blur"
      />
      <div
        class="container z-[10] flex min-h-[calc(100%-3rem)] flex-col gap-4
          bg-background/80 py-4"
      >
        <h2 class="h2">{t("cache.title")}</h2>
        <StorageStatus />
        <div class="sticky top-12 z-10 flex gap-2 py-2 backdrop-blur">
          <Show
            when={Object.keys(rowSelection()).length !== 0}
          >
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  class="text-nowrap"
                >
                  <IconMenu class="mr-2 size-4" />
                  {t("common.action.actions")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuGroupLabel>
                    {t("common.action.actions")}
                  </DropdownMenuGroupLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    class="gap-2"
                    onSelect={() => {
                      table
                        ?.getSelectedRowModel()
                        .rows.forEach((row) => {
                          if (!row.original.file) return;
                          downloadFile(row.original.file);
                        });
                      table.resetRowSelection();
                    }}
                  >
                    <IconDownload class="size-4" />
                    {t("common.action.download")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="gap-2"
                    onSelect={() =>
                      table.resetRowSelection()
                    }
                  >
                    <IconClose700 class="size-4" />
                    {t("common.action.cancel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="gap-2"
                    onSelect={() => {
                      shareCache(
                        table
                          .getSelectedRowModel()
                          .rows.map((row) => row.original),
                      );
                      table.resetRowSelection();
                    }}
                  >
                    <IconForward class="size-4" />
                    {t("common.action.forward")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="gap-2"
                    onSelect={() => {
                      openDeleteDialog(
                        table
                          .getSelectedRowModel()
                          .rows.map(
                            (row) => row.original.fileName,
                          ),
                      ).then(({ result }) => {
                        if (result === true) {
                          table
                            .getSelectedRowModel()
                            .rows.forEach((row) => {
                              cacheManager.remove(
                                row.original.id,
                              );
                            });
                          table.resetRowSelection();
                        }
                      });
                    }}
                  >
                    <IconDelete class="size-4" />
                    {t("common.action.delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
          <label
            tabIndex="0"
            class={cn(
              inputClass,
              `flex h-8 w-full max-w-md items-center gap-2 bg-background/80
              px-2 focus-within:ring-1 focus-within:ring-ring`,
            )}
          >
            <IconSearch700 class="size-5 text-muted-foreground" />

            <input
              type="search"
              placeholder={t("cache.search_input")}
              class="h-full w-full bg-transparent outline-none"
              value={globalFilter()}
              onInput={(ev) =>
                setGlobalFilter(ev.currentTarget.value)
              }
            />
          </label>
          <DataTableColumnVisibility
            table={table}
            class="ml-auto"
          />
        </div>

        <DropArea
          class="relative flex flex-1 flex-col-reverse"
          overlay={(ev) => {
            if (!ev) return;
            if (ev.dataTransfer) {
              const hasFiles =
                ev.dataTransfer?.types.includes("Files");

              if (hasFiles) {
                ev.dataTransfer.dropEffect = "move";
              } else {
                ev.dataTransfer.dropEffect = "none";
              }
            }
            return (
              <div class="pointer-events-none absolute inset-0 bg-muted/50">
                <span
                  class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    text-muted-foreground/20"
                >
                  <Show
                    when={
                      ev.dataTransfer?.dropEffect === "move"
                    }
                    fallback={<IconClose class="size-32" />}
                  >
                    <IconPlaceItem class="size-32" />
                  </Show>
                </span>
              </div>
            );
          }}
          onDrop={async (ev) => {
            if (!ev.dataTransfer) return;
            const files = await handleDropItems(
              ev.dataTransfer.items,
            );
            for (const file of files) {
              const cache =
                await cacheManager.createCache();
              cache.setInfo({
                fileName: file.name,
                fileSize: file.size,
                mimetype: file.type,
                lastModified: file.lastModified,
                chunkSize: appOptions.chunkSize,
                createdAt: Date.now(),
                file,
              });
            }
          }}
        >
          <div
            data-sync-scroll="file-table"
            class="h-full w-full flex-1 overflow-x-auto scrollbar-none"
          >
            <Table
              class="h-full w-full text-nowrap"
              ref={setTableBody}
            >
              <TableBody>
                <For
                  each={table.getRowModel().rows}
                  fallback={
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        class="h-24 text-center text-lg font-bold text-muted-foreground/50"
                      >
                        {t("common.file_table.no_data")}
                      </TableCell>
                    </TableRow>
                  }
                >
                  {(row, rowIndex) => (
                    <TableRow>
                      <For each={row.getVisibleCells()}>
                        {(cell, index) => (
                          <TableCell
                            ref={(ref) => {
                              if (rowIndex() === 0) {
                                batch(() => {
                                  setTableCellSizes(
                                    index(),
                                    undefined!,
                                  );
                                  setTableCellSizes(
                                    index(),
                                    createElementSize(ref),
                                  );
                                });
                              }
                            }}
                            class={cn(
                              cell.column.getIsPinned() &&
                                `bg-background/50 backdrop-blur transition-colors
                                [tr:hover_&]:bg-muted`,
                            )}
                            style={{
                              ...getCommonPinningStyles(
                                cell.column,
                              ),
                              width: `${cell.column.getSize()}px`,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        )}
                      </For>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
          <div
            data-sync-scroll="file-table"
            class="sticky top-24 z-10 overflow-x-auto bg-background/50
              backdrop-blur"
          >
            <Table
              style={{
                width: `${size?.width}px`,
              }}
            >
              <TableHeader>
                <For each={table.getHeaderGroups()}>
                  {(headerGroup) => (
                    <TableRow>
                      <For each={headerGroup.headers}>
                        {(header, index) => (
                          <TableHead
                            class={cn(
                              header.column.getIsPinned() &&
                                "bg-background/50 transition-colors [tr:hover_&]:bg-muted",
                            )}
                            style={{
                              ...getCommonPinningStyles(
                                header.column,
                              ),
                              width: `${
                                tableCellSizes[index()]
                                  ?.width ??
                                header.column.getSize()
                              }px`,
                            }}
                          >
                            <Show
                              when={!header.isPlaceholder}
                            >
                              {flexRender(
                                header.column.columnDef
                                  .header,
                                header.getContext(),
                              )}
                            </Show>
                          </TableHead>
                        )}
                      </For>
                    </TableRow>
                  )}
                </For>
              </TableHeader>
            </Table>
          </div>
        </DropArea>
      </div>
    </>
  );
}
