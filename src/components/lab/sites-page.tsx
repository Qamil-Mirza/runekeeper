"use client";

import { NetworkHosts } from "./network-hosts";

/** The host-wide list of internet sites that agents' commands have reached. */
export function SitesPage({ now, disabled, firstUse }: { now: number; disabled: boolean; firstUse: boolean }) {
  return (
    <section className="flex flex-col gap-4 w-full max-w-[1000px]" aria-label="Sites reached by commands">
      <header className="lab-panel p-4">
        <h3 className="text-[25px] font-semibold leading-tight tracking-tight">Sites reached by commands</h3>
        <p className="lab-eyebrow mt-2">{firstUse ? "new sites allowed on first use" : "listed sites only"} · every lab</p>
      </header>
      <div className="lab-panel p-4 flex flex-col gap-3">
        <NetworkHosts now={now} disabled={disabled} />
      </div>
    </section>
  );
}
