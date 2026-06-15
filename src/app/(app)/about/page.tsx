"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  {
    number: "01",
    title: "Join or start a challenge",
    body: "Pick a partner cause or start a group challenge with friends, family, or colleagues. Everyone skips toward the same goal.",
    color: "var(--green-primary)",
    bgColor: "rgba(46,204,113,0.10)",
  },
  {
    number: "02",
    title: "Skip anything small",
    body: "Coffee, takeout, impulse buy — anything you can do without. Log it in iSkipped and your Giving Jar grows with every skip.",
    color: "var(--gold-cta)",
    bgColor: "rgba(255,183,0,0.10)",
  },
  {
    number: "03",
    title: "Treat yourself too",
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

const FAQ_ITEMS = [
  {
    q: "How do I empty my jar once I've donated or made a purchase?",
    a: "Head to the Jars page and open the relevant tab. For your Giving Jar, log a donation using the 'Log Donation' button — enter the amount you donated and confirm. For your Reward Jar, tap 'Log a Purchase' on your active reward, enter what you spent, and confirm. Both actions record your real-world action and clear that amount from your jar balance so you can start fresh toward your next goal.",
  },
  {
    q: "Does any money actually transfer when I log a skip?",
    a: "No — iSkipped is a tracking and motivation tool, not a payment platform. We encourage all users to donate what they've pledged in their jar, but no funds move automatically.",
  },
  {
    q: "My balance doesn't look right. What should I do?",
    a: "Use the Recalculate button on your Profile page. It rebuilds all your totals directly from your logged skip history and should bring everything back in sync.",
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
          <span style={{ color: "var(--green-primary)" }}>iSkipped.</span>
        </p>
        <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          To make a difference in the world we just have to skip a few expenses.
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-10 pt-8">

        {/* How it works */}
        <section>
          <p className="text-base font-black uppercase tracking-widest mb-4" style={{ color: "var(--text-primary)" }}>
            How it works
          </p>
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl p-4 flex gap-4 items-start"
                style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black"
                  style={{ background: step.bgColor, color: step.color }}
                >
                  {step.number}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black mb-0.5" style={{ color: "var(--text-primary)" }}>{step.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push("/challenges")}
            className="mt-6 w-full py-3 rounded-2xl text-sm font-black"
            style={{
              background: "linear-gradient(135deg, var(--gold-cta), var(--gold-light))",
              color: "var(--bg-base)",
              boxShadow: "0 4px 18px var(--gold-glow)",
            }}
          >
            Browse challenges →
          </button>
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
            When you&apos;re ready to donate, your Giving Jar links you directly to each charitable organization. <span className="font-semibold" style={{ color: "var(--text-primary)" }}>All donations are processed by the cause itself</span> — iSkipped never holds or handles your funds.
          </p>
        </div>

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
