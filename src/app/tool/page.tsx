import type { Metadata } from "next";
import { ToolPrototype } from "@/components/tool-prototype";

export const metadata: Metadata = {
  title: "Restock queue — Nextinstock",
  description: "Explore the Nextinstock restock queue prototype.",
};

export default function ToolPage() {
  return <ToolPrototype />;
}
