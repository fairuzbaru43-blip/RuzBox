import { Cloud, Folder } from "lucide-react";

export function RuzBoxMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3">
    <div className={`brand-glow relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white ${compact ? "h-9 w-9 rounded-xl" : "h-12 w-12"}`}>
      <Folder className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={2.1} />
      <Cloud className="absolute bottom-1 right-1 h-3 w-3 fill-white/85 text-white/85" strokeWidth={2.8} />
    </div>
    <div className="leading-tight"><div className={`font-bold tracking-tight ${compact ? "text-lg" : "text-xl"}`}>Ruz<span className="text-cyan-400">Box</span></div>{!compact && <div className="mt-1 text-[10px] tracking-[.17em] text-[var(--muted)]">YOUR FILES, YOUR CLOUD.</div>}</div>
  </div>;
}
