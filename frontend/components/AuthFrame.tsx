export default function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/auth-bg.png)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.62)_62%,rgba(0,0,0,0.86)_100%)]"
      />
      <div className="relative w-full max-w-[400px] rounded-2xl border border-fuchsia-400/25 bg-zinc-950/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}
