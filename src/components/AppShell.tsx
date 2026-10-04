'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { CircleHelp, Crosshair, FolderOpen, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '@/state/settings';
import { Toaster } from './Toaster';
import { HelpDialog } from './HelpDialog';
import { BannerArt } from './Decor';

const NAV = [
  { href: '/', label: 'Analyze', icon: Crosshair },
  { href: '/records/', label: 'Records', icon: FolderOpen },
  { href: '/settings/', label: 'Settings', icon: SlidersHorizontal },
];

export const CREDIT = '© BA-9388 Maj Noor Mohammad Nofaer, Sigs & BA-11108 Capt Asif Mahmud, Sigs';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const theme = useSettings((s) => s.theme);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="camo-bg sticky top-0 z-30 h-[var(--header-h)] overflow-hidden border-b-[3px] border-[#e0b03a]">
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/75" />
        <div className="relative mx-auto flex h-full max-w-[2400px] items-center gap-5 px-3 sm:px-5">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bd-army-logo.png" alt="" className="h-9 w-9 shrink-0 object-contain drop-shadow lg:h-12 lg:w-12 tall:lg:h-[62px] tall:lg:w-[62px]" />
            <span className="min-w-0">
              <span className="block truncate font-display text-xl font-bold uppercase leading-none tracking-[0.07em] text-[#f2c14e] lg:text-[26px] tall:lg:text-[34px]">Remote Firing Analyzer</span>
              <span className="mt-1 hidden truncate text-[13px] text-white/85 tall:lg:block">Bangladesh Army | Digital Target Analysis and Rifle Zeroing System</span>
              <span className="marquee mt-0.5 hidden text-[12.5px] italic text-[#f2c14e]/90 tall:lg:block" aria-label="Zero the weapon, zero the target, zero the doubt">
                <span>✦ Zero the weapon, zero the target, zero the doubt ✦</span>
              </span>
            </span>
          </Link>
          <BannerArt />
          <nav className="ml-auto flex items-center gap-1" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? path === '/' : path.startsWith(href.replace(/\/$/, ''));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx('flex h-9 items-center gap-2 rounded-md px-3 text-[15px] font-medium transition-colors', active ? 'bg-[#e0b03a] text-[#1a1305]' : 'text-white/85 hover:bg-white/12 hover:text-white')}
                >
                  <Icon size={17} aria-hidden />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
            <button type="button" onClick={() => setHelp(true)} className="ml-1 flex h-9 items-center gap-2 rounded-md bg-ok/90 px-3 text-[15px] font-medium text-white hover:brightness-110">
              <CircleHelp size={17} aria-hidden />
              <span className="hidden md:inline">How to use</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="flex h-[var(--footer-h)] items-center justify-center border-t border-rule bg-sheet px-3 text-center text-xs text-muted">{CREDIT}</footer>
      <Toaster />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
