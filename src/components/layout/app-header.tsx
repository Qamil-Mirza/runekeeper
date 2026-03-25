"use client";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onOpenMenu?: () => void;
}

export function AppHeader({ title, subtitle, onOpenMenu }: AppHeaderProps) {

  return (
    <header className="flex items-center justify-between px-5 py-4 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
      {/* Mobile: hamburger | Desktop: hidden (sidebar handles nav) */}
      <button
        onClick={onOpenMenu}
        className="lg:hidden p-1.5 text-on-surface-variant hover:text-on-surface transition-colors duration-200"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile: centered "Runekeeper" | Desktop: view title */}
      <h2 className="font-display text-headline-md text-on-surface lg:hidden absolute left-1/2 -translate-x-1/2">
        Runekeeper
      </h2>
      <div className="hidden lg:block">
        <h2 className="font-display text-headline-md text-on-surface">
          {title}
        </h2>
        {subtitle && (
          <p className="font-label text-label-md text-on-surface-variant mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {/* Spacer to keep header layout balanced */}
      <div className="w-8 lg:hidden" />
    </header>
  );
}
