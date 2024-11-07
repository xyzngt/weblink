import { cn } from "@/libs/cn";
import {
  ComponentProps,
  createSignal,
  JSX,
  ParentProps,
  splitProps,
} from "solid-js";

interface DropAreaProps
  extends ParentProps,
    Omit<ComponentProps<"div">, "onDrop"> {
  overlay?: (event: DragEvent | null) => JSX.Element;
  onDrop?: (event: DragEvent) => void;
}

export default function DropArea(props: DropAreaProps) {
  const [local, other] = splitProps(props, [
    "class",
    "children",
    "overlay",
    "onDrop",
  ]);

  const [eventInfo, setEventInfo] =
    createSignal<DragEvent | null>(null);

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    setEventInfo(event);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setEventInfo(event);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setEventInfo(null);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    local.onDrop?.(event);
    setEventInfo(null);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      class={cn(local.class)}
      {...other}
    >
      {local.children}
      {local.overlay?.(eventInfo())}
    </div>
  );
}
