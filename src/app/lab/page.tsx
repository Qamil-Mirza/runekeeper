import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { isLabOwner, loadLabSettings } from "@/lib/lab/settings";
import { LabPage } from "@/components/lab/lab-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "The Lab · Runekeeper" };

/** The Lab, for its owners only. Everyone else gets the ordinary 404. */
export default async function Page() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");
  if (!isLabOwner(user.id, loadLabSettings(process.env))) notFound();
  return <LabPage />;
}
