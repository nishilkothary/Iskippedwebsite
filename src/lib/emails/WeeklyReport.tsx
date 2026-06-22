import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface WeeklyReportProps {
  displayName: string;
  weekLabel: string; // e.g. "Jun 16 – Jun 22"
  totalSaved: number;
  skipCount: number;
  streak: number;
  streakChange: "kept" | "grew" | "new-record" | "none";
  xpEarned: number;
  currentLevel: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  topCategories: { emoji: string; label: string; amount: number }[];
  causeName: string | null;
  causeAmount: number;
  causeImpactText: string | null; // e.g. "≈ 4 meals provided"
  vsLastWeek: number | null; // delta vs prior week, null if no data
  communityTotalSaved: number;
  communitySkipCount: number;
  communityUserCount: number;
  unsubscribeUrl: string;
  appUrl: string;
}

const GREEN = "#2ecc71";
const CORAL = "#e8715a";
const BG = "#f6f8f3";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1a1a1a";
const TEXT_MUTED = "#666666";
const BORDER = "#e5e7eb";

function dollars(n: number) {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

export default function WeeklyReport({
  displayName,
  weekLabel,
  totalSaved,
  skipCount,
  streak,
  streakChange,
  xpEarned,
  currentLevel,
  xpIntoLevel,
  xpForNextLevel,
  topCategories,
  causeName,
  causeAmount,
  causeImpactText,
  vsLastWeek,
  communityTotalSaved,
  communitySkipCount,
  communityUserCount,
  unsubscribeUrl,
  appUrl,
}: WeeklyReportProps) {
  const streakLabel =
    streakChange === "new-record"
      ? `🔥 ${streak}-day streak — new record!`
      : streakChange === "grew"
      ? `🔥 ${streak}-day streak — growing!`
      : streakChange === "kept"
      ? `🔥 ${streak}-day streak — kept alive!`
      : null;

  const progressPct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));

  const vsLabel =
    vsLastWeek !== null
      ? vsLastWeek >= 0
        ? `↑ ${dollars(vsLastWeek)} more saved than last week`
        : `↓ ${dollars(Math.abs(vsLastWeek))} less than last week`
      : null;

  return (
    <Html>
      <Head />
      <Preview>You saved {dollars(totalSaved)} last week — your iSkipped recap</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>

          {/* Header */}
          <Section style={{ textAlign: "center", paddingBottom: 16 }}>
            <Img
              src="https://iskipped.com/logo.png"
              alt="iSkipped"
              width={120}
              style={{ display: "inline-block" }}
            />
            <Text style={{ color: TEXT_MUTED, fontSize: 13, margin: "4px 0 0" }}>
              Your Weekly Savings Report · {weekLabel}
            </Text>
          </Section>

          {/* Hero */}
          <Section style={{ backgroundColor: GREEN, borderRadius: 16, padding: "28px 32px", marginBottom: 12, textAlign: "center" }}>
            <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px" }}>
              Hey {displayName} 👋
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 44, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.1 }}>
              {dollars(totalSaved)}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, margin: "0 0 12px" }}>
              saved across {skipCount} skip{skipCount !== 1 ? "s" : ""}
            </Text>
            {streakLabel && (
              <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: 600, margin: 0 }}>
                {streakLabel}
              </Text>
            )}
          </Section>

          {/* Categories */}
          {topCategories.length > 0 && (
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 24px", marginBottom: 12 }}>
              <Text style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
                Your Week
              </Text>
              {topCategories.map((cat) => (
                <Row key={cat.label} style={{ marginBottom: 8 }}>
                  <Column style={{ width: "36px" }}>
                    <Text style={{ fontSize: 20, margin: 0 }}>{cat.emoji}</Text>
                  </Column>
                  <Column>
                    <Text style={{ color: TEXT_PRIMARY, fontSize: 15, margin: 0 }}>{cat.label}</Text>
                  </Column>
                  <Column style={{ textAlign: "right" }}>
                    <Text style={{ color: TEXT_PRIMARY, fontSize: 15, fontWeight: 600, margin: 0 }}>{dollars(cat.amount)}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {/* XP */}
          <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 24px", marginBottom: 12 }}>
            <Row>
              <Column>
                <Text style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 4px" }}>
                  XP Earned
                </Text>
                <Text style={{ color: TEXT_PRIMARY, fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
                  +{xpEarned} XP → Level {currentLevel}
                </Text>
              </Column>
            </Row>
            {/* Progress bar */}
            <div style={{ backgroundColor: "#e5e7eb", borderRadius: 6, height: 10, overflow: "hidden" }}>
              <div style={{ backgroundColor: CORAL, width: `${progressPct}%`, height: "100%", borderRadius: 6 }} />
            </div>
            <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: "6px 0 0" }}>
              {xpIntoLevel} / {xpForNextLevel} XP to Level {currentLevel + 1}
            </Text>
          </Section>

          {/* Cause */}
          {causeName && causeAmount > 0 && (
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 24px", marginBottom: 12 }}>
              <Text style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
                Cause Impact
              </Text>
              <Text style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>
                {dollars(causeAmount)} → {causeName}
              </Text>
              {causeImpactText && (
                <Text style={{ color: TEXT_MUTED, fontSize: 14, margin: 0 }}>{causeImpactText}</Text>
              )}
            </Section>
          )}

          {/* Community */}
          <Section style={{ backgroundColor: "#1a2e1a", borderRadius: 12, padding: "20px 24px", marginBottom: 12, textAlign: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
              🌍 Community This Week
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>
              {dollars(communityTotalSaved)} saved together
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, margin: 0 }}>
              {communitySkipCount} skips from {communityUserCount} people
            </Text>
          </Section>

          {/* vs last week */}
          {vsLabel && (
            <Section style={{ textAlign: "center", padding: "4px 0 16px" }}>
              <Text style={{ color: vsLastWeek! >= 0 ? GREEN : CORAL, fontSize: 15, fontWeight: 600, margin: 0 }}>
                {vsLabel}
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={{ textAlign: "center", paddingBottom: 24 }}>
            <Button
              href={appUrl}
              style={{
                backgroundColor: GREEN,
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 50,
                padding: "14px 32px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open iSkipped →
            </Button>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: "0 0 16px" }} />

          {/* Footer */}
          <Section style={{ textAlign: "center" }}>
            <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: "0 0 4px" }}>
              You're receiving this because you're an iSkipped member.
            </Text>
            <Link href={unsubscribeUrl} style={{ color: TEXT_MUTED, fontSize: 12 }}>
              Unsubscribe from weekly reports
            </Link>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
