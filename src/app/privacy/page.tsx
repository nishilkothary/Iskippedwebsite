import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — iSkipped",
};

export default function PrivacyPage() {
  return (
    <div
      style={{ background: "var(--bg-base, #0a0a0a)", minHeight: "100vh", color: "var(--text-primary, #f1f5f9)" }}
      className="px-6 py-12"
    >
      <div className="max-w-2xl mx-auto">
        <Link
          href="/sign-in"
          style={{ color: "var(--text-secondary, #9CA3AF)" }}
          className="text-sm hover:opacity-80 transition-opacity mb-8 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-black mb-1">Privacy Policy</h1>
        <p style={{ color: "var(--text-secondary, #9CA3AF)" }} className="text-sm mb-10">
          Last updated: June 1, 2026
        </p>

        <Section title="1. Overview">
          iSkipped (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your personal
          information. This Privacy Policy explains what data we collect, how we use it, and the choices
          you have. By using the Service you agree to the practices described here.
        </Section>

        <Section title="2. Information We Collect">
          <strong>Account information:</strong> When you sign up we collect your email address and display
          name (and, if you sign in with Google, your Google profile photo).
          <br /><br />
          <strong>Usage data you enter:</strong> Skips you log (amount, category, date), jar split
          preferences, personal spending goals, and cause selections.
          <br /><br />
          <strong>Technical data:</strong> Browser or device type, IP address, pages visited, and error
          logs — collected automatically to keep the Service running reliably.
        </Section>

        <Section title="3. How We Use Your Information">
          We use your data to: (a) operate and improve the Service; (b) display your personalised
          savings history and progress; (c) power the community feed using aggregate, anonymised
          statistics; and (d) send you transactional emails (e.g. password reset). We do <strong>not</strong>{" "}
          sell your personal data to third parties or use it for targeted advertising.
        </Section>

        <Section title="4. Firebase and Google Services">
          iSkipped uses Firebase (a Google product) for authentication, data storage (Firestore and
          Realtime Database), and hosting. Your data is stored on Google&apos;s infrastructure and is
          subject to{" "}
          <a
            href="https://firebase.google.com/support/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--green-primary, #34A87A)" }}
            className="underline hover:opacity-80 transition-opacity"
          >
            Google&apos;s privacy and security practices
          </a>
          . We do not store your password — authentication is handled entirely by Firebase Auth.
        </Section>

        <Section title="5. Data Sharing">
          We share your data only in the following limited circumstances: (a) with Firebase/Google as
          described above; (b) if required by law, court order, or to protect the rights and safety of
          iSkipped or others; (c) in connection with a merger or acquisition, with notice to you. We do
          not share individually identifiable data with any other third parties.
        </Section>

        <Section title="6. Community Feed">
          The community feed displays recent skips to other users. By default, your username and skip
          activity may appear in this feed. You can manage your visibility in your profile settings.
          Skip amounts shown in the community feed are your own entries and are not verified by iSkipped.
        </Section>

        <Section title="7. Data Retention">
          We retain your account and activity data for as long as your account is active. If you delete
          your account, we will delete or anonymise your personal data within 30 days, except where
          retention is required by law.
        </Section>

        <Section title="8. Your Rights">
          Depending on your location you may have the right to access, correct, or delete the personal
          data we hold about you, or to object to certain processing. To exercise any of these rights,
          contact us at the email below. We will respond within 30 days.
        </Section>

        <Section title="9. Children's Privacy">
          The Service is not directed to children under the age of 13. We do not knowingly collect
          personal information from children under 13. If you believe a child has provided us with
          personal data, please contact us and we will delete it promptly.
        </Section>

        <Section title="10. Security">
          We implement industry-standard security measures, including HTTPS encryption in transit and
          Firebase security rules for data at rest. However, no method of transmission over the internet
          is 100% secure, and we cannot guarantee absolute security.
        </Section>

        <Section title="11. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will notify you of material changes by
          updating the &quot;Last updated&quot; date above or through a notice in the Service. Your
          continued use of the Service after changes are posted constitutes acceptance of the updated
          policy.
        </Section>

        <Section title="12. Contact">
          If you have questions or concerns about this Privacy Policy, contact us at{" "}
          <a
            href="mailto:nkothary2@gmail.com"
            style={{ color: "var(--green-primary, #34A87A)" }}
            className="underline hover:opacity-80 transition-opacity"
          >
            nkothary2@gmail.com
          </a>
          .
        </Section>

        <p style={{ color: "var(--text-secondary, #9CA3AF)" }} className="text-xs mt-12 pb-8">
          © 2026 iSkipped. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold mb-2">{title}</h2>
      <p style={{ color: "var(--text-secondary, #9CA3AF)" }} className="text-sm leading-relaxed">
        {children}
      </p>
    </section>
  );
}
