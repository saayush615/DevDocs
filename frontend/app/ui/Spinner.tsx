interface SpinnerProps {
  /** Size in Tailwind classes. Default is "h-5 w-5" (small). */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Spinner({ size = "sm", className = "" }: SpinnerProps) {
  // Map size prop to Tailwind classes
  const sizeClasses = {
    sm: "h-4 w-4",   // Inline use — buttons, badges
    md: "h-5 w-5",   // Default — card loading states
    lg: "h-8 w-8",   // Page-level loading
  };

  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-emerald-400 border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}