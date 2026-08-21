import { redirect } from "next/navigation";

export default function ChallengesPage() {
  redirect("/jars?tab=cause&create=1");
}
