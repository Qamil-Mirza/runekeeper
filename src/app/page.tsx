import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/planner");

  return (
    <main className="paper-grain min-h-dvh flex flex-col items-center justify-center bg-surface px-6 relative overflow-hidden">
      {/* Ink-wash gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(116, 91, 41, 0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(155, 67, 66, 0.04) 0%, transparent 50%)",
        }}
      />

      <div className="max-w-lg text-center relative z-10">
        {/* Decorative mark */}
        <div className="mb-8 flex justify-center">
          <svg className="w-12 h-12 text-tertiary/40" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="24" cy="24" r="20" />
            <path d="M24 8v32M12 16l24 16M12 32l24-16" />
          </svg>
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
        <p className="mt-16 font-label text-label-sm text-outline-variant uppercase tracking-[0.2em]">
          The Enchanted Archivist
        </p>
      </div>

      {/* Bottom decorative line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-outline-variant/30 to-transparent" />
    </main>
  );
}
