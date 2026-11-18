import React from 'react';

interface TopBarProps {
  onJumpToWorkbench: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onJumpToWorkbench }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#222226] bg-[#09090B]/95">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#section-hero"
          className="font-display text-lg font-bold tracking-tight text-[#F4F4F0] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF4500]"
        >
          AutoHeal-Agent
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-[#71717A]"
        >
          <a
            href="#section-hero"
            className="hover:text-[#F4F4F0] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:text-[#F4F4F0]"
          >
            Architecture
          </a>
          <a
            href="#section-exploded"
            className="hover:text-[#F4F4F0] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:text-[#F4F4F0]"
          >
            Exploded Layers
          </a>
          <a
            href="#section-workbench"
            className="hover:text-[#F4F4F0] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:text-[#F4F4F0]"
          >
            Workbench
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onJumpToWorkbench}
            className="border border-[#F4F4F0] bg-[#F4F4F0] px-4 py-2 font-mono-tech text-xs font-semibold text-[#09090B] transition-colors hover:bg-[#FF4500] hover:border-[#FF4500] hover:text-[#F4F4F0] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4500]"
          >
            Launch Workbench
          </button>
        </div>
      </div>
    </header>
  );
};
