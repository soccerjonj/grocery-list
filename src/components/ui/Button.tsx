"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "primary" &&
            "bg-gray-900 text-white hover:bg-gray-700 active:scale-[0.98]",
          variant === "ghost" &&
            "bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.98]",
          variant === "danger" &&
            "bg-red-50 text-red-600 hover:bg-red-100 active:scale-[0.98]",
          size === "sm" && "text-sm px-3 py-1.5 gap-1.5",
          size === "md" && "text-sm px-4 py-2.5 gap-2",
          size === "lg" && "text-base px-5 py-3 gap-2",
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
