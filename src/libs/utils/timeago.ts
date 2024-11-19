import {
  createTimeAgo as createTimeAgoPrimitive,
  DateInit,
} from "@solid-primitives/date";
import { Accessor } from "solid-js";
import {
  formatRelative,
  formatDistance,
} from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { appOptions } from "@/options";
import { t } from "@/i18n";
type MaybeAccessor<T> = T | Accessor<T>;

const locale = {
  en: enUS,
  zh: zhCN,
};

export const createTimeAgo = (
  date: MaybeAccessor<DateInit>,
): string => {
  return createTimeAgoPrimitive(date, {
    min: 30000, // 30 seconds
    max: 1000 * 60 * 60 * 24, // 1 day
    relativeFormatter: (now, target) => {
      if (
        now.getTime() - target.getTime() <
        1000 * 60 * 60 // 1 hour
      ) {
        return formatDistance(target, now, {
          locale: locale[appOptions.locale] ?? enUS,
          addSuffix: true,
        });
      } else {
        return formatRelative(target, now, {
          locale: locale[appOptions.locale] ?? enUS,
        });
      }
    },
    dateFormatter: (date) => {
      return new Date(date).toLocaleString();
    },
    messages: {
      justNow: t("common.timeago.just_now"),
    },
  })[0]();
};
