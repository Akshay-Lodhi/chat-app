import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { motion, HTMLMotionProps } from "framer-motion";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref" | "children"> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  children?: React.ReactNode;
}

const variantStyles = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-[0_4px_12px_rgba(10,132,255,0.3)]",
  secondary: "bg-surface text-text-primary hover:bg-surface-hover border border-surface-border",
  ghost: "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover",
  danger: "bg-danger text-white hover:opacity-90 shadow-[0_4px_12px_rgba(255,69,58,0.3)]",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-2xl font-medium",
  icon: "p-2 rounded-full",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
