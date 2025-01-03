import {
  IconChatBubble,
  IconChevronLeft,
  IconCloudDownload,
  IconDelete,
  IconDownload,
  IconMoreHoriz,
  IconPreview,
  IconResume,
  IconSearch700,
  IconShare,
  IconSync,
} from "@/components/icons";
import { createPreviewDialog } from "@/components/preview-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
} from "@/components/ui/dropdown-menu";
import { inputClass } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import {
  ChunkCacheInfo,
  ChunkMetaData,
  getTotalChunkCount,
} from "@/libs/cache";
import { cn } from "@/libs/cn";
import { messageStores } from "@/libs/core/messge";
import { useWebRTC } from "@/libs/core/rtc-context";
import { ClientInfo, Client } from "@/libs/core/type";
import { cacheManager } from "@/libs/services/cache-serivce";
import { sessionService } from "@/libs/services/session-service";
import { transferManager } from "@/libs/services/transfer-service";
import { downloadFile } from "@/libs/utils/download-file";
import { formatBtyeSize } from "@/libs/utils/format-filesize";
import { getInitials } from "@/libs/utils/name";
import { ConnectionBadge } from "@/components/connection-badge";
import { makePersisted } from "@solid-primitives/storage";
import { A, RouteSectionProps } from "@solidjs/router";
import {
  createColumnHelper,
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  ColumnPinningState,
  type Table as SolidTable,
  VisibilityState,
} from "@tanstack/solid-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import DataTableColumnVisibility from "@/components/data-table/data-table-column-visibility";
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter";
import { getCommonPinningStyles } from "@/components/data-table/data-table-pin-style";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import { v4 } from "uuid";
import { createComfirmDeleteItemsDialog } from "@/components/confirm-delete-dialog";
import { FileTransferer } from "@/libs/core/file-transferer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { catchErrorAsync } from "@/libs/catch";
import { canShareFile } from "@/libs/utils/can-share";
import { IconFile } from "@/components/icon-file";

type ChunkStatus =
  | "not_started"
  | "stopped"
  | "transferring"
  | "merging"
  | "complete";

const Sync = (props: RouteSectionProps) => {
  const { requestFile } = useWebRTC();

  const columnHelper = createColumnHelper<ChunkMetaData>();

  const columns = [
    // columnHelper.display({
    //   id: "select",
    //   size: 0,
    //   header: ({ table }) => (
    //     <Checkbox
    //       role="checkbox"
    //       checked={table.getIsAllPageRowsSelected()}
    //       indeterminate={table.getIsSomePageRowsSelected()}
    //       onChange={(value) =>
    //         table.toggleAllPageRowsSelected(!!value)
    //       }
    //       aria-label="Select all"
    //     >
    //       <CheckboxControl />
    //     </Checkbox>
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       role="checkbox"
    //       checked={row.getIsSelected()}
    //       disabled={!row.getCanSelect()}
    //       onChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //     >
    //       <CheckboxControl />
    //     </Checkbox>
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    //   enablePinning: true,

    //   enableColumnFilter: false,
    //   enableGlobalFilter: false,
    // }),
    columnHelper.accessor("fileName", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("common.file_table.columns.name")}
        />
      ),
      cell: (info) => (
        <p
          class="max-w-xs space-x-1 overflow-hidden text-ellipsis
            [&>*]:align-middle"
        >
          <IconFile
            mimetype={info.row.original.mimetype}
            class="inline size-4"
          />
          <span>{info.getValue()}</span>
        </p>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: t("common.file_table.columns.status"),
      filterFn: (row, id, filterValue) => {
        const status = statuses()[row.index]();
        return filterValue.length
          ? filterValue.includes(status)
          : true;
      },
      cell: ({ row }) => {
        const status = statuses()[row.index];
        const progress = createMemo(() => {
          const info =
            cacheManager.cacheInfo[row.original.id];
          if (!info?.chunkCount) return 0;
          return (
            (info?.chunkCount / getTotalChunkCount(info)) *
            100
          );
        });
        return (
          <div class="flex items-center gap-1 text-xs">
            <Badge variant="outline">
              {t(`common.file_table.status.${status()}`)}
            </Badge>
            <Show
              when={["transferring", "stopped"].includes(
                status(),
              )}
            >
              <span class="font-mono">
                {`${progress().toFixed(2)}%`}
              </span>
            </Show>
          </div>
        );
      },
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
        return value
          ? new Date(value).toLocaleString()
          : "";
      },
      enableGlobalFilter: true,
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
        return value
          ? new Date(value).toLocaleString()
          : "";
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
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div class="w-9" />,
      cell: ({ row }) => {
        const localCache = createMemo(
          () => cacheManager.caches[row.original.id],
        );

        const status = statuses()[row.index];

        return (
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
                <Show
                  when={localCache()}
                  fallback={
                    <Show
                      when={clientInfo()?.messageChannel}
                    >
                      <DropdownMenuItem
                        class="gap-2"
                        onSelect={() => {
                          console.log(
                            `request download`,
                            row.original,
                          );
                          requestFile(
                            props.params.id,
                            row.original,
                            false,
                          );
                        }}
                      >
                        <IconCloudDownload class="size-4" />
                        {t(
                          "common.action.request_download",
                        )}
                      </DropdownMenuItem>
                    </Show>
                  }
                >
                  {(cache) => {
                    const [file] = createResource(
                      async () =>
                        (await cache()?.getFile()) ?? null,
                    );
                    const shareableData = createMemo(() => {
                      const f = file();
                      if (!f) return null;
                      if (!canShareFile(f)) return null;
                      const shareData: ShareData = {
                        files: [f],
                      };
                      return shareData;
                    });
                    return (
                      <>
                        <Show
                          when={
                            cacheManager.cacheInfo[
                              row.original.id
                            ]?.isComplete
                          }
                        >
                          <Show when={file()}>
                            {(f) => (
                              <>
                                <DropdownMenuItem
                                  class="gap-2"
                                  onSelect={() => {
                                    openPreview(f());
                                  }}
                                >
                                  <IconPreview class="size-4" />
                                  {t(
                                    "common.action.preview",
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  class="gap-2"
                                  onSelect={() => {
                                    downloadFile(f());
                                  }}
                                >
                                  <IconDownload class="size-4" />
                                  {t(
                                    "common.action.download",
                                  )}
                                </DropdownMenuItem>
                              </>
                            )}
                          </Show>
                          <Show when={shareableData()}>
                            {(shareData) => (
                              <DropdownMenuItem
                                class="gap-2"
                                onSelect={async () => {
                                  const [err] =
                                    await catchErrorAsync(
                                      navigator.share(
                                        shareData(),
                                      ),
                                    );
                                  if (err) {
                                    console.error(err);
                                  }
                                }}
                              >
                                <IconShare class="size-4" />
                                {t("common.action.share")}
                              </DropdownMenuItem>
                            )}
                          </Show>
                        </Show>
                        <DropdownMenuItem
                          class="gap-2"
                          onSelect={() => {
                            openDeleteDialog([
                              row.original.fileName,
                            ]).then(({ result }) => {
                              if (result === true) {
                                cache().cleanup();
                              }
                            });
                          }}
                        >
                          <IconDelete class="size-4" />
                          {t("common.action.delete")}
                        </DropdownMenuItem>
                        <Show when={status() === "stopped"}>
                          <DropdownMenuItem
                            class="gap-2"
                            onSelect={() => {
                              requestFile(
                                props.params.id,
                                row.original,
                                true,
                              );
                            }}
                          >
                            <IconResume class="size-4" />
                            {t("common.action.resume")}
                          </DropdownMenuItem>
                        </Show>
                      </>
                    );
                  }}
                </Show>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableHiding: false,
    }),
  ];

  const {
    open: openDeleteDialog,
    Component: DeleteDialog,
  } = createComfirmDeleteItemsDialog();

  const [storage, setStorage] = createSignal<
    ChunkCacheInfo[]
  >([]);

  createEffect(() => {
    const storage = clientInfo()?.storage;
    if (!storage) return;

    setStorage(
      storage?.map((chunk) => {
        return {
          ...chunk,
        };
      }),
    );
  });

  const [columnPinning, setColumnPinning] =
    createSignal<ColumnPinningState>({
      left: ["select"],
      right: ["actions"],
    });
  const [sorting, setSorting] = makePersisted(
    createSignal<SortingState>([]),
    {
      name: "storage-sorting",
      storage: sessionStorage,
    },
  );
  const [columnFilters, setColumnFilters] = makePersisted(
    createSignal<ColumnFiltersState>([]),
    {
      name: "storage-column-filters",
      storage: sessionStorage,
    },
  );

  const [columnVisibility, setColumnVisibility] =
    makePersisted(createSignal<VisibilityState>({}), {
      name: "storage-column-visibility",
      storage: sessionStorage,
    });

  const [globalFilter, setGlobalFilter] = createSignal("");
  const { open: openPreview, Component: PreviewDialog } =
    createPreviewDialog();
  const table: SolidTable<ChunkMetaData> = createSolidTable(
    {
      get data() {
        return storage() ?? [];
      },
      state: {
        get columnPinning() {
          return columnPinning();
        },
        get globalFilter() {
          return globalFilter();
        },
        get sorting() {
          return sorting();
        },
        get columnFilters() {
          return columnFilters();
        },
        get columnVisibility() {
          return columnVisibility();
        },
      },
      columns,
      onColumnPinningChange: setColumnPinning,
      onGlobalFilterChange: setGlobalFilter,
      onColumnFiltersChange: setColumnFilters,
      onColumnVisibilityChange: setColumnVisibility,
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
      onSortingChange: setSorting,
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => row.id,
    },
  );

  const session = createMemo(
    () => sessionService.sessions[props.params.id],
  );

  const client = createMemo<Client | undefined>(() =>
    messageStores.clients.find(
      (c) => c.clientId === props.params.id,
    ),
  );

  const clientInfo = createMemo<ClientInfo | undefined>(
    () => sessionService.clientInfo[props.params.id],
  );

  createEffect(() => {
    const s = session();
    if (clientInfo()?.messageChannel) {
      s.sendMessage({
        id: v4(),
        type: "request-storage",
        createdAt: Date.now(),
        client: s.clientId,
        target: s.targetClientId,
      });
    }
  });

  const createStatus = (chunk: ChunkMetaData) => {
    const cacheInfo = createMemo(
      () => cacheManager.cacheInfo[chunk.id],
    );
    const transfer = createMemo<FileTransferer | undefined>(
      () => transferManager.transferers[chunk.id],
    );

    const [status, setStatus] =
      createSignal<ChunkStatus>("not_started");

    createEffect(() => {
      const info = cacheInfo();
      if (!info) {
        setStatus("not_started");
      } else {
        if (info.isMerging) {
          setStatus("merging");
        } else if (info.isComplete) {
          setStatus("complete");
        } else if (transfer()) {
          setStatus("transferring");
        } else {
          setStatus("stopped");
        }
      }
    });

    return status;
  };

  const statuses = createMemo(() => {
    table.resetColumnFilters();
    const statuses = storage().map((chunk) =>
      createStatus(chunk),
    );
    return statuses;
  });

  return (
    <>
      <PreviewDialog />
      <DeleteDialog />
      <div class="absolute inset-0 z-[-1] bg-background/50 backdrop-blur"></div>
      <div class="flex h-full w-full flex-col gap-2 bg-background/50 p-0">
        <div class="flex items-center gap-2 p-2">
          <Button
            as={A}
            href="/"
            size="icon"
            variant="ghost"
            class="sm:hidden"
          >
            <IconChevronLeft class="size-8" />
          </Button>

          <Avatar>
            <AvatarImage
              src={client()?.avatar ?? undefined}
            />
            <AvatarFallback>
              {getInitials(client()?.name ?? "")}
            </AvatarFallback>
          </Avatar>
          <h4 class={cn("h4")}>{client()?.name}</h4>
          <ConnectionBadge client={clientInfo()} />
          <div class="ml-auto"></div>
          <Tooltip>
            <TooltipTrigger>
              <Button
                as={A}
                href={`../chat`}
                variant="ghost"
                aria-label={t("client.sync.menu.chat")}
                size="icon"
              >
                <IconChatBubble class="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("client.sync.menu.chat")}
            </TooltipContent>
          </Tooltip>
          <Tooltip disabled={!clientInfo()?.messageChannel}>
            <TooltipTrigger>
              <Button
                disabled={!clientInfo()?.messageChannel}
                aria-label={t("client.sync.menu.refresh")}
                onClick={() => {
                  sessionService.requestStorage(
                    props.params.id,
                  );
                }}
                variant="outline"
                size="icon"
              >
                <IconSync class="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("client.sync.menu.refresh")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div class="flex items-center gap-2 p-2">
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
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title={t("common.file_table.columns.status")}
            options={[
              {
                label: t(
                  "common.file_table.status.not_started",
                ),
                value: "not_started",
              },
              {
                label: t(
                  "common.file_table.status.stopped",
                ),
                value: "stopped",
              },
              {
                label: t(
                  "common.file_table.status.transferring",
                ),
                value: "transferring",
              },
              {
                label: t(
                  "common.file_table.status.merging",
                ),
                value: "merging",
              },
              {
                label: t(
                  "common.file_table.status.complete",
                ),
                value: "complete",
              },
            ]}
          />
          <DataTableColumnVisibility
            table={table}
            class="ml-auto"
          />
        </div>

        <div class="relative h-full w-full flex-1 overflow-x-auto">
          <Table class="absolute inset-0 text-nowrap">
            <TableHeader class="sticky top-0 z-10 bg-background/50 backdrop-blur">
              <TableRow>
                <For each={table.getHeaderGroups()}>
                  {(headerGroup) => (
                    <For each={headerGroup.headers}>
                      {(header) => (
                        <TableHead
                          class={cn(
                            header.column.getIsPinned() &&
                              `bg-background/50 backdrop-blur transition-colors
                              [tr:hover_&]:bg-muted`,
                          )}
                          style={{
                            ...getCommonPinningStyles(
                              header.column,
                            ),
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </TableHead>
                      )}
                    </For>
                  )}
                </For>
              </TableRow>
            </TableHeader>
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
                {(row) => (
                  <TableRow
                    onDblClick={() => {
                      const status = statuses()[row.index];
                      if (status() === "complete") {
                        const file =
                          cacheManager.cacheInfo[
                            row.original.id
                          ]?.file;
                        if (file) {
                          openPreview(file);
                        }
                      } else if (
                        ["not_started", "stopped"].includes(
                          status(),
                        )
                      ) {
                        const resume =
                          status() === "stopped";
                        requestFile(
                          props.params.id,
                          row.original,
                          resume,
                        );
                      }
                    }}
                  >
                    <For each={row.getVisibleCells()}>
                      {(cell) => (
                        <TableCell
                          class={cn(
                            cell.column.getIsPinned() &&
                              `bg-background/50 backdrop-blur transition-colors
                              [tr:hover_&]:bg-muted`,
                          )}
                          style={{
                            ...getCommonPinningStyles(
                              cell.column,
                            ),
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
      </div>
    </>
  );
};

export default Sync;
