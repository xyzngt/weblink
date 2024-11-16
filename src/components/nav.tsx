import { cn } from "@/libs/cn";
import { A, useLocation } from "@solidjs/router";
import { ComponentProps, splitProps } from "solid-js";
import {
  IconFolder,
  IconForum,
  IconMeetingRoom,
  IconSettings,
} from "./icons";
import { t } from "@/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

export const linkClasses = cn(
  "text-foreground/60 hover:text-foreground/80 aria-[current]:text-foreground transition-colors font-semibold",
);

export default function Nav(props: ComponentProps<"nav">) {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname
      ? "border-sky-600"
      : "border-transparent hover:border-sky-600";
  const [local, other] = splitProps(props, ["class"]);
  return (
    <nav class={cn("flex gap-2", local.class)} {...other}>
      <Tooltip>
        <TooltipTrigger
          as={A}
          href="/"
          aria-label={t("nav.chat")}
          class={cn(linkClasses, active("/"))}
        >
          <IconForum class="size-8" />
        </TooltipTrigger>
        <TooltipContent>
          {t("common.nav.chat")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          as={A}
          href="/video"
          aria-label={t("nav.video_conference")}
          class={cn(linkClasses, active("/video"))}
        >
          <IconMeetingRoom class="size-8" />
        </TooltipTrigger>
        <TooltipContent>
          {t("common.nav.video_conference")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          as={A}
          href="/file"
          aria-label={t("nav.file_cache")}
          class={cn(linkClasses, active("/file"))}
        >
          <IconFolder class="size-8" />
        </TooltipTrigger>
        <TooltipContent>
          {t("common.nav.file_cache")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          as={A}
          href="/setting"
          aria-label={t("nav.settings")}
          class={cn(linkClasses, active("/setting"))}
        >
          <IconSettings class="size-8" />
        </TooltipTrigger>
        <TooltipContent>
          {t("common.nav.settings")}
        </TooltipContent>
      </Tooltip>
    </nav>
  );
}
