import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlannerClientLayout from "./planner-shell";

export default async function PlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return <PlannerClientLayout />;
}
