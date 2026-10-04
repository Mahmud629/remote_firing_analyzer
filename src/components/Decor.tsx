/** Banner artwork: cartridges and a rifle outline. Pure SVG, no image files. */
function Cartridge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 64" className={className} aria-hidden>
      <path d="M10 0C14 6 16 12 16 20v4H4v-4C4 12 6 6 10 0Z" fill="#c07a2c" />
      <rect x="3" y="24" width="14" height="36" rx="1" fill="#d9a62b" />
      <rect x="2" y="58" width="16" height="5" rx="1" fill="#a9791a" />
      <rect x="4.5" y="26" width="2.5" height="31" fill="#fff" opacity=".28" />
    </svg>
  );
}

export function BannerArt() {
  return (
    <div className="pointer-events-none hidden items-end gap-1 xl:flex" aria-hidden>
      <Cartridge className="h-12 w-auto -rotate-6 drop-shadow-[0_2px_3px_rgba(0,0,0,.6)] tall:h-16" />
      <Cartridge className="h-14 w-auto drop-shadow-[0_2px_3px_rgba(0,0,0,.6)] tall:h-[72px]" />
      <Cartridge className="h-12 w-auto rotate-6 drop-shadow-[0_2px_3px_rgba(0,0,0,.6)] tall:h-16" />
    </div>
  );
}
