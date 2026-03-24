import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/planner");

  return (
    <main className="wood-grain min-h-dvh flex flex-col items-center justify-center bg-surface px-6 relative overflow-hidden">
      {/* Firelight radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(200, 120, 40, 0.12) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(200, 100, 20, 0.06) 0%, transparent 40%)",
        }}
      />

      <div className="max-w-lg text-center relative z-10">
        {/* Campfire flame */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative">
            <div className="campfire-flame" />
            <div className="campfire-glow -bottom-4 left-1/2 -translate-x-1/2" />
          </div>
        </div>

        <h1 className="font-display text-display-lg font-light tracking-tight text-on-surface leading-[1.05]">
          Runekeeper
        </h1>

        <p className="mt-5 font-body text-body-lg text-on-surface-variant leading-[1.7] max-w-md mx-auto">
          Plan your week through conversation. Your intentions become time
          blocks, your calendar becomes a living manuscript.
        </p>

        <div className="mt-12">
          <GoogleSignInButton />
        </div>

        {/* Tagline */}
        <p className="mt-16 font-label text-label-sm text-[rgba(212,168,96,0.4)] uppercase tracking-[0.2em]">
          The Hearthside Keeper
        </p>
      </div>

      {/* Bottom decorative line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(212,168,96,0.2)] to-transparent" />
    </main>
  );
}
