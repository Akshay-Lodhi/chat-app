import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, ...props }, ref) => {
    return (
      <div className="w-full relative flex flex-col gap-1">
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-text-secondary pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full bg-surface border border-surface-border rounded-xl px-4 py-3 text-text-primary text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all",
              "placeholder:text-text-tertiary",
              icon && "pl-10",
              error && "border-danger focus:ring-danger/50 focus:border-danger",
              className
            )}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-danger ml-1">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
