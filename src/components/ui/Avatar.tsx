import React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
};

export function Avatar({
  src,
  alt = "Avatar",
  fallback,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0",
        "bg-surface-border", // Fallback background
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="font-semibold text-text-primary">
          {fallback ? fallback.charAt(0).toUpperCase() : "U"}
        </span>
      )}
    </div>
  );
}
