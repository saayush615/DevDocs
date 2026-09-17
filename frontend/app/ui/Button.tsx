//   "primary"  — emerald background, dark text (main actions: send, submit)
//   "ghost"    — transparent, hover reveals zinc-800 (sidebar items, nav)
//   "danger"   — red text, red hover background (delete, sign out)
//
// Supports optional loading state (disables button + shows spinner).

import Spinner from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
}

export default function Button({
  variant = "primary",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  // Base classes shared by all variants
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  // Variant-specific classes
  const variants = {
    // Emerald button for primary actions (send, submit, create)
    primary:
      "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
    // Transparent button for sidebar items, navigation
    ghost:
      "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
    // Red button for destructive actions (delete, sign out)
    danger:
      "text-red-400 hover:bg-red-500/10",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {/* Show a small spinner while loading, then the button text */}
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}