import type { Metadata } from "next";
import { ToolPrototype } from "@/components/tool-prototype";

export const metadata: Metadata = {
  title: "Restock queue — Nextinstock",
  description: "Set up and manage copy-specific restock tasks for synced eBay listings.",
};

export default function ToolPage() {
  return <ToolPrototype />;
}
