import { redirect } from "next/navigation";

export default function RootPage() {
  // The home screen is protected and substantially larger than the auth page.
  // Start new browser/PWA sessions at the login screen so mobile clients do not
  // have to load the authenticated app before Firebase can establish a session.
  redirect("/sign-in");
}
