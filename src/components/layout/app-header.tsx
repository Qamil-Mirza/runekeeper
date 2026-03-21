"use client";

interface AppHeaderProps {
  title: string;
  onToggleDrawer: () => void;
}

export function AppHeader({ title, onToggleDrawer }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
      <h2 className="font-display text-headline-md text-on-surface">
        {title}
      </h2>
      <button
        onClick={onToggleDrawer}
        className="xl:hidden p-2 text-on-surface-variant hover:text-on-surface transition-colors duration-200"
        aria-label="Toggle schedule"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
    </header>
  );
}
