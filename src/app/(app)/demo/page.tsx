import { redirect } from "next/navigation";

/** Built-in demo entry point: opens the analyzer with Example Logistics preselected. */
export default function DemoPage() {
  redirect("/leads/new?demo=example-logistics");
}
