'use client';

import Link from 'next/link';
import { useState } from 'react';
import { JetBrains_Mono, Space_Mono, VT323 } from 'next/font/google';
import DotMatrix404 from '@/components/DotMatrix404';
import SdgNavbar from '@/components/sdg/SdgNavbar';
import CrtOverlay from '@/components/sdg/CrtOverlay';

// Re-declare fonts here — Next.js not-found pages do NOT inherit the segment layout,
// so we must re-apply them ourselves.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
});
const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
  display: 'swap',
});

export default function SdgNotFound() {
  const [subtextTop, setSubtextTop] = useState<number | null>(null);

  return (
    <div
      className={`
        ${jetbrainsMono.variable} ${spaceMono.variable} ${vt323.variable}
        relative w-full h-screen overflow-hidden flex flex-col
        font-jetbrains
      `}
      style={{
        // ── SDG palette — direct hex values so getComputedStyle on the canvas
        // element resolves them correctly (chained var() refs don't resolve).
        // To re-theme, swap only these three values.
        '--dm404-bg':     '#060a06',
        '--dm404-fg':     '#33ff66',
        '--dm404-accent': '#ffb000',

        background: '#060a06',
        color:      '#d6ffe0',
      } as React.CSSProperties}
    >
      {/* ── CRT scanlines + vignette layer (behind canvas) ── */}
      <CrtOverlay />

      {/* ── SDG Navbar ── */}
      <SdgNavbar />

      {/* ── Game canvas ── */}
      <div className="flex-1 relative w-full min-h-0 mt-16">
        <DotMatrix404
          className="w-full h-full z-10"
          onBoundsCalculated={(b) => setSubtextTop(b.bottom + 40)}
        />

        {/* ── Subtext — positioned just below the art grid ── */}
        <div
          aria-label="page subtext"
          className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center transition-all duration-500"
          style={{
            top:     subtextTop !== null ? `${subtextTop}px` : '68%',
            opacity: subtextTop !== null ? 1 : 0,
          }}
        >
          <p
            className="tracking-widest text-xs uppercase whitespace-nowrap"
            style={{ color: 'var(--color-phosphor-green, #33ff66)', opacity: 0.55 }}
          >
            [ CONNECTION LOST — MIGHT AS WELL PLAY ]
          </p>
        </div>
      </div>

      {/* ── Back link — pinned to bottom, above paddle zone ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
        <Link
          href="/verticals/sdg"
          className="
            inline-flex items-center gap-2
            font-jetbrains text-[11px] tracking-widest uppercase
            px-5 py-2 rounded-sm
            border transition-all duration-200
            active:scale-95
          "
          style={{
            color:       'var(--color-phosphor-green, #33ff66)',
            borderColor: 'var(--color-phosphor-green, #33ff66)',
            background:  'rgba(6, 10, 6, 0.7)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background  = 'var(--color-phosphor-green, #33ff66)';
            e.currentTarget.style.color       = '#060a06';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background  = 'rgba(6, 10, 6, 0.7)';
            e.currentTarget.style.color       = 'var(--color-phosphor-green, #33ff66)';
          }}
        >
          <span aria-hidden>{'>'}</span> return /sdg
        </Link>
      </div>
    </div>
  );
}
