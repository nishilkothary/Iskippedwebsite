"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    number: "01",
    title: "Skip It",
    copy: "Say no to an expense you do not need, from coffee and takeout to an impulse purchase.",
    body: "Pick a partner cause or start a group challenge with friends, family, or colleagues. Everyone skips toward the same goal.",
    color: "var(--green-primary)",
    bgColor: "rgba(46,204,113,0.10)",
  },
  {
    number: "02",
    title: "Log It",
    copy: "Log a skip and turn that saved money into Skip Bucks.",
    body: "Coffee, takeout, impulse buy — anything you can do without. Log it in iSkipped and your Giving Jar grows with every skip.",
    color: "var(--gold-cta)",
    bgColor: "rgba(255,183,0,0.10)",
  },
  {
    number: "03",
    title: "Use It",
    copy: "Turn your Skip Bucks into purpose by picking a savings jar for a personal reward or a group fundraiser working toward a shared goal.",
    body: "Pick something you're saving toward — dinner out, a splurge, a small treat. A share of every skip fills your Reward Jar alongside your giving. All good deeds deserve a reward.",
    color: "#8B5CF6",
    bgColor: "rgba(139,92,246,0.10)",
  },
  {
    number: "04",
    title: "Donate",
    body: "When you're ready, donate your donation jar directly to the cause. No money moves through iSkipped — it goes straight to the organization.",
    color: "var(--coral-primary)",
    bgColor: "rgba(239,68,68,0.10)",
  },
];

const LEGACY_FAQ_ITEMS = [
  {
    q: "How do I empty my jar once I've donated or made a purchase?",
    a: "Head to the Jars page and choose Donate my skips or Spend my skips. iSkipped will point you to the outside donation or purchase page first, then let you log the amount so your jar balance stays accurate.",
  },
  {
    q: "Does any money actually transfer when I log a skip?",
    a: "No — iSkipped is a tracking and motivation tool, not a payment platform. We encourage all users to donate what they've pledged in their jar, but no funds move automatically.",
  },
  {
    q: "My balance doesn't look right. What should I do?",
    a: "Check Jar Activity to see where your skipped savings are parked. If something still looks off, send us a note and we can help trace it.",
  },
  {
    q: "Will more causes be added?",
    a: "Yes! We're currently in beta and actively growing our list of causes. Stay tuned — more options are on the way.",
  },
  {
    q: "Do I have to select a donation jar?",
    a: "While we strongly encourage everyone to pick a cause, it's not required. Your Giving Jar will keep filling up until you choose one.",
  },
  {
    q: "Can I fund multiple save or give jars at once?",
    a: "No — at this time you can save for one thing at a time. You can transfer funds to a new cause or goal by activating a new jar, or mark as donated/purchased to close out that jar and start a new one.",
  },
  {
    q: "Is there an iSkipped app?",
    a: "We are still in the testing phase so there is no current app. For now we recommend pinning the URL to your phone's home screen for easy access. Based on your feedback, we hope to bring an app to all our users shortly!",
  },
  {
    q: "Does iSkipped process the donations?",
    a: "No. iSkipped connects you with charitable organizations. Donations are processed directly by each organization. iSkipped does not handle or hold any donation funds.",
  },
  {
    q: "What does the 'Share name and skip with community' toggle do?",
    a: "This shares your first name and what you skipped. Keeping it off will hide your name and only show the category of the skip.",
  },
  {
    q: "I have feedback — where can I share it?",
    a: "We'd love to hear from you! Send us an email at iskippedfor@gmail.com and we'll get back to you.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What are Skip Bucks?",
    a: "Skip Bucks are dollars available from your skipped expenses. They are your lifetime skipped savings minus purchases and donations you have logged.",
  },
  {
    q: "Does money move when I log a skip?",
    a: "No. iSkipped helps you track the amount you chose not to spend. No money moves automatically into or through iSkipped.",
  },
  {
    q: "How do I use my Skip Bucks?",
    a: "Choose a goal when you want to spend on something meaningful, or choose a fundraiser when you want to contribute to a cause. You decide how much to use at that moment.",
  },
  {
    q: "Do I need to join a fundraiser?",
    a: "No. You can use your Skip Bucks only for personal goals, only for fundraisers, or a mix of both whenever you are ready.",
  },
  {
    q: "What happens when I contribute to a fundraiser?",
    a: "Choose an amount from your Skip Bucks, then iSkipped takes you to the fundraiser's external donation page. When you return, you can confirm the donation so your balance and the fundraiser progress stay up to date.",
  },
  {
    q: "What happens when I spend on a goal?",
    a: "Choose how much to spend. If you saved a shopping link, we can take you there; otherwise, confirm the purchase after you make it outside iSkipped.",
  },
  {
    q: "Can I create a fundraiser with friends or an organization?",
    a: "Yes. Create a fundraiser, set the impact and its goal, then invite people to skip together for the same cause.",
  },
  {
    q: "Does iSkipped process donations or purchases?",
    a: "No. Donations are processed by the external organization and purchases happen with the retailer you choose. iSkipped tracks the choices you confirm.",
  },
  {
    q: "What does sharing with the community do?",
    a: "It shares your first name and what you skipped with a group feed to help motivate others. Turn it off to keep your skip private.",
  },
];

export default function AboutPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main className="min-h-screen pb-24" style={{ background: "var(--bg-base)" }}>

      {/* Hero */}
      <div
        className="px-5 pt-12 pb-10 text-center"
        style={{
          background: "linear-gradient(180deg, #0D1F17 0%, var(--bg-base) 100%)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <p
          className="text-4xl font-black leading-tight mb-3"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.5px" }}
        >
          All it takes is saying<br />
          <span style={{ color: "var(--green-primary)" }}>iSkipped</span>
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-10 pt-8">

        {/* Origin story */}
        <section
          className="rounded-2xl p-5"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--green-primary)" }}>
            Our story
          </p>
          <h2 className="mt-2 text-2xl font-black leading-tight" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>
            How iSkipped began
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <p>
              iSkipped began during a backpacking trip through Asia, when I met a local student sleeping on a hotel bench. He told me he was staying there to save money for college. When I asked what tuition would cost, he said $170.
            </p>
            <p>
              That number stayed with me. Back home, $170 could disappear into a few dinners out or a few drinks with friends. For him, it meant a year of education and a lifetime of opportunity.
            </p>
            <p>
              When I returned home, I decided to skip those very expenses and use the savings to fund his tuition. That decision forever changed how I saw my own money. I realized that spending I was fortunate enough to rarely think about could become something intentional. A skipped dinner, drink, ride, or impulse purchase could be redirected into something with real weight, something that truly mattered.
            </p>
            <p>
              &quot;I skipped&quot; became more than a phrase. It became a way to turn everyday restraint into opportunity, for myself and, even better, for someone else.
            </p>
            <p className="font-black" style={{ color: "var(--text-primary)" }}>
              That idea became iSkipped.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section>
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--green-primary)" }}>
              How it works
            </p>
            <h2 className="mt-1 text-3xl font-black leading-tight" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>
              3 easy steps
            </h2>
          </div>
          <div className="space-y-6">
            {STEPS.slice(0, 3).map((step) => (
              <div
                key={step.number}
                className="flex gap-4 items-start"
              >
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-base font-black"
                  style={{ background: step.bgColor, color: step.color, border: "1px solid var(--border-default)" }}
                >
                  {step.number}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{step.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push("/jars")}
            className="mt-6 w-full py-3 rounded-2xl text-sm font-black"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
              fontSize: 0,
            }}
          >
            <span style={{ fontSize: 14 }}>Choose a Skip Jar</span>
            Create a Skipped Reward →
          </button>
          <button
            onClick={() => router.push("/jars?tab=cause")}
            className="mt-3 w-full py-3 rounded-2xl text-sm font-semibold"
            style={{ display: "none" }}
          >
            Browse iSkipped Fundraisers →
          </button>
        </section>

        {/* FAQ */}
        <section>
          <p className="text-base font-black uppercase tracking-widest mb-4" style={{ color: "var(--text-primary)" }}>
            FAQ
          </p>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
          >
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-default)" }}>
                <button
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.q}</span>
                  <span className="text-lg leading-none flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <p className="px-5 pb-4 text-sm" style={{ color: "var(--text-secondary)" }}>{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* How iSkipped works note */}
        <div
          className="rounded-2xl p-4"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Good to know</p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
            iSkipped is a <span className="font-semibold" style={{ color: "var(--text-primary)" }}>motivation and tracking tool</span> — it helps you log, visualize, and stay accountable to the money you save by skipping. No funds move automatically.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            When you&apos;re ready to donate, iSkipped links you directly to each charitable organization. <span className="font-semibold" style={{ color: "var(--text-primary)" }}>All donations are processed by the cause itself</span> — iSkipped never holds or handles your funds.
          </p>
        </div>

        {/* Contact */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>Have feedback or questions?</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Reach us at{" "}
            <a href="mailto:iskippedfor@gmail.com" className="underline" style={{ color: "var(--green-primary)" }}>
              iskippedfor@gmail.com
            </a>
          </p>
        </div>

      </div>
    </main>
  );
}
