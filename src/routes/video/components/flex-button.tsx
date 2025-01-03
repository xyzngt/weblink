import {
  Button,
  ButtonProps,
} from "@/components/ui/button";
import { JSX, ParentProps, Show } from "solid-js";

export const FlexButton = (
  props: {
    icon: JSX.Element;
    onClick: () => void;
  } & ButtonProps &
    ParentProps,
) => {
  return (
    <Button
      {...props}
      class="h-8 text-nowrap rounded-full p-2 hover:gap-1
        [&:hover>.grid]:grid-cols-[1fr]"
    >
      {props.icon}
      <Show when={props.children}>
        <p class="grid grid-cols-[0fr] overflow-hidden transition-all">
          <span class="min-w-0">{props.children}</span>
        </p>
      </Show>
    </Button>
  );
};
