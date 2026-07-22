import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "outline";
}

const variantStyles = {
  default: "bg-surface-border text-text-primary",
  success: "bg-success/20 text-success border border-success/30",
  warning: "bg-warning/20 text-warning border border-warning/30",
  danger: "bg-danger/20 text-danger border border-danger/30",
  outline: "border border-surface-border text-text-secondary",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
