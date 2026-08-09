'use client';

import Link from 'next/link';
import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import DotMatrix404 from '@/components/DotMatrix404';

export default function NotFound() {
  const [subtextTop, setSubtextTop] = useState<number | null>(null);

  return (
    <div 
      className="relative w-full h-screen bg-black overflow-hidden flex flex-col"
      style={{
        '--dm404-fg': '#10b981', // Emerald green
        '--dm404-bg': '#000000',
        '--dm404-accent': '#ffffff', // For text inside chips
      } as React.CSSProperties}
    >
      <Navbar />

      <div className="flex-1 relative w-full h-full">
        <DotMatrix404 
          className="absolute inset-0 w-full h-full z-0" 
          onBoundsCalculated={(bounds) => setSubtextTop(bounds.bottom + 32)}
        />

        {/* Subtext overlay, dynamically positioned below the center art */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center transition-all duration-300"
          style={{ top: subtextTop !== null ? `${subtextTop}px` : '70%', opacity: subtextTop !== null ? 1 : 0 }}
        >
          <p className="text-white/60 font-medium tracking-widest text-sm uppercase">
            (Might as well play)
          </p>
        </div>
      </div>

      {/* Back home link - moved to absolute bottom to stay out of paddle's way */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <Link 
          href="/" 
          className="rounded-xl px-6 py-3 bg-white/10 hover:bg-emerald-500 hover:text-black text-white/80 font-medium transition-colors shadow-lg backdrop-blur-md border border-white/20"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
