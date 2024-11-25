import { cn } from "@/libs/cn";
import type { ButtonRootProps } from "@kobalte/core/button";
import { Button as ButtonPrimitive } from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { Component, ComponentProps } from "solid-js";
import { createMemo, splitProps } from "solid-js";

const spinnerVariants = cva(
  "relative block opacity-[0.65]",
  {
    variants: {
      size: {
        sm: "w-4 h-4",
        md: "w-6 h-6",
        lg: "w-8 h-8",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

export interface SpinnerProps
  extends ComponentProps<"span">,
    VariantProps<typeof spinnerVariants> {}

const Spinner: Component<SpinnerProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "class",
    "size",
  ]);
  const bgClass = createMemo(
    () => local.class?.match(/(?:dark:bg-|bg-)\S+/g) || [],
  );
  const filteredClass = createMemo(() => {
    const filteredClasses = local.class
      ?.replace(/(?:dark:bg-|bg-)\S+/g, "")
      .trim();
    return filteredClasses;
  });

  return (
    <span
      class={cn(
        spinnerVariants({
          size: local.size,
          class: filteredClass(),
        }),
      )}
      {...rest}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          class="animate-spinner-leaf-fade absolute left-1/2 top-0 h-full
            w-[12.5%]"
          style={{
            transform: `rotate(${i * 45}deg)`,
            "animation-delay": `${-(7 - i) * 100}ms`,
          }}
        >
          <span
            class={cn(
              "block h-[30%] w-full rounded-full",
              bgClass(),
            )}
          ></span>
        </span>
      ))}
    </span>
  );
};

export { Spinner };
