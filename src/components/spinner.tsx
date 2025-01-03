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

  const leafNumber = 8;

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
      {Array.from({ length: leafNumber }).map((_, i) => (
        <span
          class="absolute left-1/2 top-0 h-full animate-spinner-leaf-fade"
          style={{
            transform: `rotate(${i * (360 / leafNumber)}deg)`,
            "animation-delay": `${-(leafNumber - 1 - i) * 100}ms`,
            width: `${100 / leafNumber}%`,
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
