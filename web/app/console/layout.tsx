import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console/ConsoleShell";

export const metadata: Metadata = {
  title: "FairMod Console",
  description: "Policy-driven moderation with a human review queue, decision log and analytics.",
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
