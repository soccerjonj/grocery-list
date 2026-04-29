"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={cn(
            "w-full px-3.5 py-2.5 rounded-xl border text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-zinc-500",
            "bg-white dark:bg-zinc-800 transition-colors duration-150 outline-none",
            "focus:ring-2 focus:ring-gray-900 dark:focus:ring-zinc-400 focus:border-transparent",
            error
              ? "border-red-400 focus:ring-red-500"
              : "border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
