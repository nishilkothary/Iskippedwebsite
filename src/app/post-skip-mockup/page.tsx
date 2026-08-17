const streakWeeks = [
  { label: "W1", checked: true, current: false },
  { label: "W2", checked: true, current: false },
  { label: "W3", checked: true, current: false },
  { label: "W4", checked: true, current: true },
  { label: "W5", checked: false, current: false },
];

export default function PostSkipMockupPage() {
  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <section className="w-full">
          <div
            className="iskip-pop-in relative overflow-hidden rounded-2xl text-center shadow-2xl"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-default)" }}
          >
            <button
              aria-label="Close"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none"
              style={{ background: "rgba(0,0,0,0.28)", color: "var(--text-secondary)" }}
            >
              x
            </button>

            <div className="relative h-28 overflow-hidden" style={{ background: "linear-gradient(135deg, #163526, #0f241b)" }}>
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "var(--border-default)" }} />
              <div className="absolute left-6 top-6 h-16 w-16 rounded-full" style={{ background: "rgba(46,204,113,0.12)" }} />
              <div className="absolute right-10 top-8 h-10 w-24 rounded-full" style={{ background: "rgba(245,197,66,0.14)" }} />
              <div className="absolute bottom-5 left-28 h-8 w-28 rounded-full" style={{ background: "rgba(43,186,164,0.14)" }} />
            </div>

            <div className="px-6 pb-6">
              <h1 className="mt-5 text-2xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                Nice skip.
              </h1>
              <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                You skipped takeout and saved <strong style={{ color: "var(--text-primary)" }}>$12.00</strong>.
              </p>

              <div className="mx-auto my-6 max-w-[300px]">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  That can help fund:
                </p>
                <p className="mt-2 text-[2.4rem] font-black leading-none" style={{ color: "var(--green-primary)" }}>
                  14 meals
                </p>
              </div>

              <p className="mt-5 text-sm font-bold" style={{ color: "#2BBAA4" }}>
                Plus $6.00 moved toward your Weekend Trip.
              </p>

              <div className="mt-5">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Weekly skip streak
                </p>
                <div className="iskip-streak-row mt-2" aria-label="4 week skip streak">
                  {streakWeeks.map((week) => (
                    <div key={week.label} className="iskip-streak-slot">
                      <span className={`iskip-week-dot ${week.checked ? "is-checked" : ""} ${week.current ? "is-current" : ""}`}>
                        {week.checked ? "\u2713" : ""}
                      </span>
                      <span className="iskip-week-label">{week.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mx-auto mt-5 max-w-[280px] rounded-xl px-4 py-3 text-sm font-bold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}>
                3 people skipped for this cause today.
              </p>

              <button
                className="mt-5 w-full rounded-xl py-3 text-sm font-black transition-transform hover:scale-[1.01]"
                style={{ background: "var(--gold-cta)", color: "var(--bg-base)", boxShadow: "0 4px 18px var(--gold-glow)" }}
              >
                Invite someone to skip with you
              </button>

              <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                Tracked as a pledge. Donate from your jar when you are ready.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
