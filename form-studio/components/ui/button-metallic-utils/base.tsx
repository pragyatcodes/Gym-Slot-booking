"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ButtonSize = "sm" | "md" | "icon";
export type ButtonVariant = "ghost" | "default";

export interface ButtonProps extends HTMLMotionProps<"button"> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  ripple?: boolean;
}

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 min-w-[2.25rem] px-3 text-sm",
  md: "h-11 min-w-[2.75rem] px-5 text-sm",
  icon: "h-11 w-11 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { size = "md", variant = "default", className, type = "button", children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold tracking-tight",
        "disabled:pointer-events-none disabled:opacity-60",
        sizes[size],
        variant === "ghost" && "bg-transparent",
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
