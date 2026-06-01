import Link from "next/link";

export const metadata = {
  title: "Terms of Service — iSkipped",
};

export default function TermsPage() {
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

        <h1 className="text-3xl font-black mb-1">Terms of Service</h1>
        <p style={{ color: "var(--text-secondary, #9CA3AF)" }} className="text-sm mb-10">
          Last updated: June 1, 2026
        </p>

        <Section title="1. Acceptance of Terms">
          By accessing or using iSkipped (the &quot;Service&quot;), you agree to be bound by these Terms of
          Service (&quot;Terms&quot;). If you do not agree, do not use the Service. These Terms apply to all
          visitors, users, and others who access the Service.
        </Section>

        <Section title="2. Description of Service">
          iSkipped is a personal savings-tracking and motivation tool that helps users log purchases they
          chose not to make (&quot;skips&quot;), visualise accumulated savings, and optionally earmark
          portions of those savings toward charitable causes or personal spending goals. iSkipped is a
          record-keeping and goal-setting application only.
        </Section>

        <Section title="3. User Accounts">
          You must create an account to use most features of the Service. You are responsible for
          maintaining the confidentiality of your login credentials and for all activity that occurs under
          your account. You agree to provide accurate, current, and complete information during
          registration and to keep that information up to date. You must be at least 13 years old to create
          an account.
        </Section>

        <Section title="4. Savings Tracking — Not Financial Services">
          iSkipped records <em>estimated intended savings</em> that you enter manually. It does not connect
          to any bank account, payment processor, or financial institution. The amounts shown in the app
          are user-entered estimates and do not represent actual funds held, transferred, or guaranteed.
          Nothing in the Service constitutes financial, investment, tax, or legal advice. iSkipped is not a
          bank, broker-dealer, investment adviser, or money-services business.
        </Section>

        <Section title="5. Charitable Giving Disclaimer">
          iSkipped allows you to designate a portion of your tracked savings toward a charitable cause. This
          designation is a personal goal-tracking feature only. iSkipped does <strong>not</strong> collect,
          hold, transmit, process, or guarantee any charitable donation on your behalf. To make an actual
          donation you must visit the charity&apos;s own platform directly. iSkipped is not responsible for
          the operations, financial practices, tax status, or actions of any third-party charitable
          organization listed in or linked from the Service. The inclusion of a cause in iSkipped does not
          constitute an endorsement.
        </Section>

        <Section title="6. No Tax Advice">
          iSkipped cannot confirm whether any donation you make independently to a third-party charity is
          tax-deductible in your jurisdiction. Please consult a qualified tax professional regarding the
          deductibility of charitable contributions.
        </Section>

        <Section title="7. Acceptable Use">
          You agree not to: (a) use the Service for any unlawful purpose; (b) enter false or misleading
          data with the intent to deceive others; (c) attempt to gain unauthorised access to any part of
          the Service or its infrastructure; (d) transmit any malicious code or interfere with the Service;
          or (e) scrape, reproduce, or resell any part of the Service without written permission.
        </Section>

        <Section title="8. Intellectual Property">
          The iSkipped name, logo, application code, design, and content are owned by or licensed to
          iSkipped and are protected by applicable intellectual property laws. You are granted a limited,
          non-exclusive, non-transferable licence to use the Service for your personal, non-commercial
          purposes. You may not copy, modify, distribute, sell, or lease any part of the Service or its
          content.
        </Section>

        <Section title="9. Disclaimer of Warranties">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
          FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. iSkipped DOES NOT WARRANT THAT THE SERVICE WILL
          BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. YOUR USE OF THE
          SERVICE IS AT YOUR SOLE RISK.
        </Section>

        <Section title="10. Limitation of Liability">
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, iSkipped AND ITS OWNERS, EMPLOYEES,
          CONTRACTORS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER
          INTANGIBLE LOSSES — ARISING OUT OF OR RELATING TO YOUR USE OF OR INABILITY TO USE THE SERVICE,
          EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL iSkipped&apos;S TOTAL
          AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO iSkipped IN THE
          TWELVE MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS ($100).
        </Section>

        <Section title="11. Indemnification">
          You agree to indemnify and hold harmless iSkipped and its owners, officers, employees, and
          agents from and against any claims, liabilities, damages, losses, and expenses (including
          reasonable attorneys&apos; fees) arising out of or in any way connected with your access to or
          use of the Service, your violation of these Terms, or your violation of any rights of another
          person or entity.
        </Section>

        <Section title="12. Changes to Terms">
          We may update these Terms from time to time. We will provide notice of material changes by
          updating the &quot;Last updated&quot; date above or by sending a notification through the Service.
          Your continued use of the Service after any such change constitutes your acceptance of the new
          Terms.
        </Section>

        <Section title="13. Governing Law">
          These Terms are governed by the laws of the State of Delaware, United States, without regard to
          its conflict-of-law provisions. Any dispute arising under these Terms shall be resolved
          exclusively in the state or federal courts located in Delaware.
        </Section>

        <Section title="14. Contact">
          Questions about these Terms? Contact us at{" "}
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
