import { Dynamic } from "solid-js/web";
import {
  IconAudioFileFilled,
  IconPhotoFilled,
  IconVideoFileFilled,
  IconInsertDriveFile,
} from "./icons";
import { createMemo } from "solid-js";

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

export const FileMessageTitle = (props: {
  type: string;
  name: string;
}) => {
  const key = createMemo<
    "image" | "video" | "audio" | "default"
  >(
    () =>
      (Object.keys(FileTitle).find(
        (key) => key === props.type,
      ) as "image" | "video" | "audio" | undefined) ??
      "default",
  );
  return (
    <Dynamic
      component={FileTitle[key()]}
      name={props.name}
    />
  );
};
