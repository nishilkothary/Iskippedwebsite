"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    copy: "Log a skip and add that saved money to your Skip Bucks.",
    body: "Coffee, takeout, impulse buy — anything you can do without. Log it in iSkipped and your active jar grows with every skip.",
    color: "var(--gold-cta)",
    bgColor: "rgba(255,183,0,0.10)",
  },
  {
    number: "03",
    title: "Use It",
    copy: "Give your Skip Bucks a purpose by moving them into a savings jar for a personal reward or group fundraiser.",
    body: "Pick something you are saving toward, like a dinner out, concert tickets, or a small treat. Your skips fill the reward or fundraiser jar you choose, and you can change or park it anytime.",
    color: "#8B5CF6",
    bgColor: "rgba(139,92,246,0.10)",
  },
];

const FAQ_ITEMS = [
  {
    q: "What are Skipping Jars?",
    a: "A Skipping Jar is a savings goal for the money you save by skipping everyday purchases. It can be for something personal you want to buy or for a donation you hope to make. Your active jar is the one shown on your Home page and the default destination for new skips — think of it as your digital piggy bank. Each time you log a skip, it goes into your active jar unless you choose a different destination first.",
  },
  {
    q: "What are Skip Bucks?",
    a: "Skip Bucks are saved money that isn’t in a jar yet. You can move them into a reward or fundraiser whenever you’re ready, or leave them available until you choose a purpose for them.",
  },
  {
    q: "How do I spend or donate what’s in my jar?",
    a: "iSkipped is a tracking tool for the savings you’ve worked hard to build — it does not process payments or donations directly, and it never holds your money. To use your savings, tap the Spend or Donate button below the relevant jar on your Home page. iSkipped will guide you through the next steps with the retailer or fundraiser. Once you complete the purchase or donation, return to iSkipped and log it so your jar balance and savings history update correctly.",
  },
  {
    q: "Does money move when I log a skip?",
    a: "No. iSkipped helps you track the amount you chose not to spend. No money moves automatically into or through iSkipped.",
  },
  {
    q: "Can I skip for more than one reason?",
    a: "Yes. You can direct skipped savings to a paused jar by changing the destination for any given skip.",
  },
  {
    q: "Where can I see or change where my skipped money is?",
    a: "Open Manage Jars to see where your skipped money is. From there, you can move balances between jars or delete a jar and move its savings back to your Skip Bucks.",
  },
  {
    q: "Can I increase a jar goal amount?",
    a: "Yes. Open Manage Jars, tap the pencil on your current jar, and enter a new goal amount. Your saved balance stays in the jar, and future skips keep filling it toward the updated goal.",
  },
  {
    q: "What happens if I change or deactivate a jar?",
    a: "You can keep the balance parked in that jar, move it to a new jar, or return it to Skip Bucks. Deactivating a jar does not delete saved money unless you choose to move or release it.",
  },
  {
    q: "What does ‘Skip for this’ mean?",
    a: "‘Skip for this’ makes that cause or reward your active jar. Future skips will go there by default until you choose a different jar. It does not move or delete money already saved in another jar.",
  },
  {
    q: "Can I join or create a fundraiser?",
    a: "Yes. You can join an existing fundraiser or create one for a cause, group, or shared goal. Fundraiser skips can appear in the group activity and count toward the shared progress.",
  },
  {
    q: "What does sharing a fundraiser skip do?",
    a: "When sharing is on, your first name and skip can appear in that fundraiser's group activity to motivate the group. Personal reward skips stay private. You can change the default in Profile.",
  },
  {
    q: "How do weekly reminders work?",
    a: "If you allow them, iSkipped sends one weekly reminder to log anything you skipped. Push reminders are managed on your device and in Profile; weekly email check-ins can be turned off from the email.",
  },
  {
    q: "Is iSkipped a mobile app?",
    a: "iSkipped is currently a web app. Add it to your phone's home screen for quick access, then allow notifications if you want weekly push reminders.",
  },
  {
    q: "My balance or jar progress looks wrong. What should I do?",
    a: "Open Jar Activity to compare total unspent savings, money in jars, and Skip Bucks. If something still looks wrong after checking your purchase and donation history, contact us at iskippedfor@gmail.com.",
  },
];

const INITIAL_FAQ_COUNT = 7;

export default function AboutPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const visibleFaqs = showAllFaqs ? FAQ_ITEMS : FAQ_ITEMS.slice(0, INITIAL_FAQ_COUNT);

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
          <h2 className="text-2xl font-black leading-tight" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>
            How iSkipped Began
          </h2>
          <div
            id="origin-story"
            className="mt-4 space-y-4 text-sm leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            <p>
              The idea for iSkipped began during a backpacking trip through Asia. It was there, in the incredible city of Luang Prabang, that I noticed something interesting. The receptionist at my hotel would sleep on an outdoor bench every night after his shift ended.
            </p>
            <p>
              As I learned more about him over the course of my stay, I found out that he did have a home, but it was many miles away. Rather than spending money on transportation or more local lodging, sleeping on that uncomfortable bench was his way of saving more money for college tuition.
            </p>
            <p>
              Amazed by his sacrifice, I decided to ask him how much his tuition would cost, expecting a relatively large number. His answer, however, shocked me.
            </p>
            <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
              &quot;$170,&quot; he said.
            </p>
            {storyExpanded ? (
              <>
                <p>
                  That number stayed with me. Back home, $170 could disappear into a few dinners out or drinks with friends. For him, it meant a year of education and a lifetime of opportunity.
                </p>
                <p>
                  For the rest of my trip, I started looking at every purchase through his frame of reference: <em>If I did not buy this, how much closer could I get to funding his tuition?</em>
                </p>
                <p>
                  Incredibly, with that new mindset and a few skipped purchases, I saved the $170 he had been working so hard to put together.
                </p>
                <p className="font-black" style={{ color: "var(--text-primary)" }}>
                  The day I sent him the money and saw my spending choices turn into someone else&apos;s hopes and dreams was the day I forever changed how I saw my own money.
                </p>
                <p>
                  From that point on, deciding whether to spend became less about, &quot;Can I afford this?&quot; and more about, &quot;Do I really want this?&quot; If the answer was no, the choice was clear to me: skip it and use that money for something more meaningful.
                </p>
                <p>
                  That way of seeing money is where iSkipped truly began, and it&apos;s the mindset I hope to share with you too.
                </p>
                <p>
                  In a world where we are often encouraged to spend, buy, own, and possess, my hope is that iSkipped helps you feel proud and accomplished anytime you choose not to.
                </p>
                <p>
                  Because whether you&apos;re skipping to help someone else or saving toward something that brings you more happiness, I have found that there is immense power in being able to actively choose to say:
                </p>
                <p className="text-xl font-black" style={{ color: "var(--green-primary)" }}>
                  I skipped.
                </p>
                <p className="pt-2" style={{ color: "var(--text-primary)" }}>
                  <span className="block text-base" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>Nishil Kothary</span>
                  <span className="mt-1 block text-xs font-black uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>Founder of iSkipped</span>
                </p>
                <button
                  type="button"
                  aria-expanded="true"
                  aria-controls="origin-story"
                  onClick={() => setStoryExpanded(false)}
                  className="ml-auto flex w-fit items-center text-sm font-black"
                  style={{ color: "var(--text-muted)" }}
                >
                  Show less <span className="ml-1" aria-hidden="true">↑</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-expanded="false"
                aria-controls="origin-story"
                onClick={() => setStoryExpanded(true)}
                className="inline-flex items-center text-sm font-black"
                style={{ color: "var(--green-primary)" }}
              >
                Read the full story <span className="ml-1" aria-hidden="true">→</span>
              </button>
            )}
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
            {STEPS.map((step) => (
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
            {visibleFaqs.map((item, i) => (
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
                  <p className="px-5 pb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {item.q === "Can I increase a jar goal amount?" ? (
                      <>
                        Yes. Open Manage Jars, tap the pencil on your current jar, and enter a new goal amount. Your saved balance stays in the jar, and future skips keep filling it toward the updated goal.
                        <br />
                        <Link href="/jars" className="mt-3 inline-block font-black underline" style={{ color: "var(--green-primary)" }}>Open Manage Jars -&gt;</Link>
                      </>
                    ) : item.a}
                    {item.q === "What are Skip Bucks?" && (
                      <>
                        <br />
                        <Link href="/jar-activity" className="underline" style={{ color: "var(--green-primary)" }}>View Jar Activity for a breakdown</Link>.
                      </>
                    )}
                    {item.q === "Where can I see or change where my skipped money is?" && (
                      <>
                        <br />
                        <Link href="/jars" className="mt-3 inline-block font-black underline" style={{ color: "var(--green-primary)" }}>Open Manage Jars -&gt;</Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
          {FAQ_ITEMS.length > INITIAL_FAQ_COUNT && (
            <button
              type="button"
              onClick={() => setShowAllFaqs((expanded) => !expanded)}
              className="mt-3 w-full rounded-xl py-3 text-sm font-black"
              style={{ border: "1px solid var(--border-default)", color: "var(--green-primary)", background: "transparent" }}
            >
              {showAllFaqs ? "Show fewer FAQs" : "Show all FAQs"}
            </button>
          )}
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
              When you&apos;re ready to use your savings, iSkipped links you to the retailer for a reward or the organization for a donation. <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Purchases and donations are completed outside iSkipped</span> — we never hold or handle your funds.
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
