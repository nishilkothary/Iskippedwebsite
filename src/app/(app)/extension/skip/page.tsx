import { Suspense } from "react";
import { ExtensionSkipClient } from "./ExtensionSkipClient";

export default function ExtensionSkipPage() {
  return (
    <Suspense fallback={<ExtensionSkipShell title="Preparing your skip..." />}>
      <ExtensionSkipClient />
    </Suspense>
  );
}

function ExtensionSkipShell({ title }: { title: string }) {
  return (
    <div className="min-h-full px-4 py-10 flex items-center justify-center">
      <section
        className="w-full max-w-md rounded-lg p-6"
        style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--green-primary)" }}>
          Chrome extension
        </p>
        <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </section>
    </div>
  );
}
