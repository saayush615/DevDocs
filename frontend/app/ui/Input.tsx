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
  /** Optional control rendered inside the right edge of the field, such as show/hide */
  endAdornment?: React.ReactNode;
}

// forwardRef lets parent components pass a ref to the underlying <input>.
// This is needed by react-hook-form's register() function.
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, endAdornment, className = "", ...props }, ref) => {
    return (
      <div className="mb-4">
        {/* Label */}
        <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>

        <div className="relative">
          {/* Input element */}
          <input
            ref={ref}
            className={`w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors outline-none ${
              endAdornment ? "pr-14" : ""
            } ${
              error
                ? "border-red-500/50 focus:border-red-400 focus:ring-1 focus:ring-red-400/50"
                : "border-white/10 focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400/50"
            } ${className} `}
            {...props}
          />
          {endAdornment && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">{endAdornment}</div>
          )}
        </div>

        {/* Error message — only shown when error prop is provided */}
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
