// ─── Input ────────────────────────────────────────────────────────────
// Dark-themed text input with label and error message.
// Used in forms (login, signup, document upload, etc.).
//
// Combines the <label>, <input>, and error <p> into one component
// so forms stay DRY and visually consistent.

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Error message string — if provided, input border turns red and error is shown */
  error?: string;
}

// forwardRef lets parent components pass a ref to the underlying <input>.
// This is needed by react-hook-form's register() function.
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="mb-4">
        {/* Label */}
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          {label}
        </label>

        {/* Input element */}
        <input
          ref={ref}
          className={`w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors
            ${error
              ? "border-red-500/50 focus:border-red-400 focus:ring-1 focus:ring-red-400/50"
              : "border-white/10 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
            }
            ${className}
          `}
          {...props}
        />

        {/* Error message — only shown when error prop is provided */}
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;