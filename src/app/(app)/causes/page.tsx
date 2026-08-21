import { redirect } from "next/navigation";

// Keep old bookmarks working without retaining the retired donation page.
export default function CausesPage() {
  redirect("/jars?tab=cause");
}
