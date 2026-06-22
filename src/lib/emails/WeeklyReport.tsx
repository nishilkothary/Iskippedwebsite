import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
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
  weekLabel: string;
  totalSaved: number;
  skipCount: number;
  largestSkip: number;
  averageSkip: number;
  topCategories: { emoji: string; label: string; amount: number }[];
  streak: number;
  causeName: string | null;
  causeAmount: number;
  liveAmount: number;
  causeImpactText: string | null;
  causeTotalRaised: number | null;
  causeGoalAmount: number | null;
  communityTotalSaved: number;
  communitySkipCount: number;
  communityTopCategory: { emoji: string; label: string; amount: number } | null;
  groupName: string | null; // null = show full iSkipped community
  unsubscribeUrl: string;
  appUrl: string;
}

const GREEN = "#2ecc71";
const GREEN_DARK = "#0f2a0f";
const CORAL = "#e8715a";
const CORAL_LIGHT = "#fdf0ee";
const GOLD = "#f5a623";
const GOLD_LIGHT = "#fef9ec";
const BG = "#f0f2ef";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#111827";
const TEXT_MUTED = "#6B7280";
const TEXT_LIGHT = "#9CA3AF";
const BORDER = "#E5E7EB";

function dollars(n: number) {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}
function dollarsRound(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function SectionBadge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <Text style={{
      display: "inline-block",
      backgroundColor: bg,
      color,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      padding: "4px 10px",
      borderRadius: 4,
      margin: "0 0 16px",
    }}>
      {children}
    </Text>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Column style={{ textAlign: "center", padding: "0 6px" }}>
      <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>
        {label}
      </Text>
      <Text style={{ color: color ?? TEXT_PRIMARY, fontSize: 18, fontWeight: 800, margin: 0 }}>
        {value}
      </Text>
    </Column>
  );
}

export default function WeeklyReport({
  displayName,
  weekLabel,
  totalSaved,
  skipCount,
  largestSkip,
  averageSkip,
  topCategories,
  streak,
  causeName,
  causeAmount,
  liveAmount,
  causeImpactText,
  causeTotalRaised,
  causeGoalAmount,
  communityTotalSaved,
  communitySkipCount,
  communityTopCategory,
  groupName,
  unsubscribeUrl,
  appUrl,
}: WeeklyReportProps) {
  const causePct =
    causeTotalRaised !== null && causeGoalAmount && causeGoalAmount > 0
      ? Math.min(100, Math.round((causeTotalRaised / causeGoalAmount) * 100))
      : null;

  const communityHeading = groupName
    ? `What's Happening in My Group: ${groupName}`
    : "iSkipped Community This Week";

  return (
    <Html>
      <Head />
      <Preview>Your iSkipped savings report — {weekLabel} · {dollars(totalSaved)} saved</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>

          {/* Top bar */}
          <Section style={{ backgroundColor: GREEN_DARK, padding: "18px 32px", textAlign: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px", margin: "0 0 2px" }}>
              <span style={{ color: "#ffffff" }}>i</span><span style={{ color: GREEN }}>skipped</span>
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
              Weekly Savings Report · {weekLabel}
            </Text>
          </Section>

          {/* Greeting */}
          <Section style={{ backgroundColor: GREEN_DARK, padding: "0 32px 24px", textAlign: "center" }}>
            <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, margin: 0 }}>
              Hey {displayName} — here's your weekly skip report 👋
            </Text>
          </Section>

          {/* Hero — scoreboard */}
          <Section style={{ backgroundColor: GREEN, padding: "32px 32px 28px", textAlign: "center" }}>
            <Text style={{ color: "#ffffff", fontSize: 72, fontWeight: 900, margin: "0 0 4px", lineHeight: 1, letterSpacing: "-2px", fontVariantNumeric: "tabular-nums" }}>
              {dollars(totalSaved)}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, margin: 0 }}>
              saved across <strong>{skipCount}</strong> skip{skipCount !== 1 ? "s" : ""} this week
            </Text>
          </Section>

          <Section style={{ padding: "20px 16px 0" }}>

            {/* ── MY SKIP REPORT ── */}
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "22px 22px", marginBottom: 14, borderLeft: `4px solid ${GREEN}` }}>
              <SectionBadge color={GREEN} bg="#e8faf0">My Skip Report</SectionBadge>

              {/* Biggest category */}
              {topCategories[0] && (
                <Row style={{ marginBottom: 14 }}>
                  <Column style={{ width: "32px" }}>
                    <Text style={{ fontSize: 18, margin: 0 }}>{topCategories[0].emoji}</Text>
                  </Column>
                  <Column>
                    <Text style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, margin: "0 0 2px" }}>Biggest Saving Category</Text>
                    <Text style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 600, margin: 0 }}>{topCategories[0].label}</Text>
                  </Column>
                  <Column style={{ textAlign: "right" }}>
                    <Text style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 700, margin: 0 }}>{dollars(topCategories[0].amount)}</Text>
                  </Column>
                </Row>
              )}

              <Hr style={{ borderColor: BORDER, margin: "0 0 14px" }} />

              {/* Largest + Average */}
              <Row>
                <StatCell label="Largest Skip" value={dollars(largestSkip)} />
                <Column style={{ width: 1, padding: "0" }}>
                  <div style={{ width: 1, backgroundColor: BORDER, height: 36, margin: "0 auto" }} />
                </Column>
                <StatCell label="Average Skip" value={dollars(averageSkip)} />
              </Row>
            </Section>

            {/* ── IMPACT OF MY SKIPS ── */}
            {causeName && (causeAmount > 0 || liveAmount > 0 || causeTotalRaised !== null) && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "22px 22px", marginBottom: 14, borderLeft: `4px solid ${CORAL}` }}>
                <SectionBadge color={CORAL} bg={CORAL_LIGHT}>Impact of My Skips</SectionBadge>

                <Row style={{ marginBottom: 14 }}>
                  {causeAmount > 0 && (
                    <Column style={{ textAlign: "center" }}>
                      <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>To {causeName}</Text>
                      <Text style={{ color: CORAL, fontSize: 22, fontWeight: 900, margin: 0 }}>{dollars(causeAmount)}</Text>
                      {causeImpactText && (
                        <Text style={{ color: TEXT_MUTED, fontSize: 11, margin: "3px 0 0" }}>{causeImpactText}</Text>
                      )}
                    </Column>
                  )}
                  {causeAmount > 0 && liveAmount > 0 && (
                    <Column style={{ width: 1 }}>
                      <div style={{ width: 1, backgroundColor: BORDER, height: 46, margin: "0 auto" }} />
                    </Column>
                  )}
                  {liveAmount > 0 && (
                    <Column style={{ textAlign: "center" }}>
                      <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>To My Reward</Text>
                      <Text style={{ color: GOLD, fontSize: 22, fontWeight: 900, margin: 0 }}>{dollars(liveAmount)}</Text>
                    </Column>
                  )}
                </Row>

                {causeTotalRaised !== null && causeGoalAmount && (
                  <>
                    <Hr style={{ borderColor: BORDER, margin: "0 0 14px" }} />
                    <Row style={{ marginBottom: 8 }}>
                      <Column>
                        <Text style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 600, margin: 0 }}>
                          {causeName} — total funded
                        </Text>
                      </Column>
                      <Column style={{ textAlign: "right" }}>
                        <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: 0 }}>
                          {dollarsRound(causeTotalRaised)} of {dollarsRound(causeGoalAmount)}
                        </Text>
                      </Column>
                    </Row>
                    {causePct !== null && (
                      <>
                        <div style={{ backgroundColor: "#E5E7EB", borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ backgroundColor: CORAL, width: `${causePct}%`, height: "100%", borderRadius: 6 }} />
                        </div>
                        <Text style={{ color: TEXT_MUTED, fontSize: 11, margin: "5px 0 0" }}>
                          {causePct}% of goal reached
                        </Text>
                      </>
                    )}
                  </>
                )}
              </Section>
            )}

            {/* ── COMMUNITY / GROUP ── */}
            <Section style={{ backgroundColor: GREEN_DARK, borderRadius: 12, padding: "22px 22px", marginBottom: 14 }}>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, margin: "0 0 16px" }}>
                🌍 {communityHeading}
              </Text>
              <Row style={{ marginBottom: 14 }}>
                <Column style={{ textAlign: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>
                    Money Saved
                  </Text>
                  <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: 900, margin: 0 }}>
                    {dollarsRound(communityTotalSaved)}
                  </Text>
                </Column>
                <Column style={{ textAlign: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>
                    Total Skips
                  </Text>
                  <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: 900, margin: 0 }}>
                    {communitySkipCount.toLocaleString()}
                  </Text>
                </Column>
              </Row>
              {communityTopCategory && (
                <>
                  <Hr style={{ borderColor: "rgba(255,255,255,0.08)", margin: "0 0 12px" }} />
                  <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, margin: "0 0 6px" }}>
                    Most Skipped Category
                  </Text>
                  <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: 700, margin: 0 }}>
                    {communityTopCategory.emoji} {communityTopCategory.label}
                    <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 400 }}> — {dollarsRound(communityTopCategory.amount)} saved</span>
                  </Text>
                </>
              )}
            </Section>

            {/* ── STREAK ── */}
            {streak > 0 && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "22px 22px", marginBottom: 14, borderLeft: `4px solid ${GOLD}`, textAlign: "center" }}>
                <SectionBadge color={GOLD} bg={GOLD_LIGHT}>🔥 Your Streak</SectionBadge>
                <Text style={{ color: TEXT_PRIMARY, fontSize: 40, fontWeight: 900, margin: "0 0 4px", lineHeight: 1 }}>
                  {streak} days
                </Text>
                <Text style={{ color: TEXT_MUTED, fontSize: 13, margin: 0 }}>
                  Keep it going — log a skip today
                </Text>
              </Section>
            )}

          </Section>

          {/* CTA */}
          <Section style={{ textAlign: "center", padding: "20px 0 28px" }}>
            <Button
              href={appUrl}
              style={{
                backgroundColor: GREEN,
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 50,
                padding: "14px 40px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open iSkipped →
            </Button>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: GREEN_DARK, padding: "16px 32px", textAlign: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "0 0 4px" }}>
              You're receiving this as an iSkipped member.
            </Text>
            <Link href={unsubscribeUrl} style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
              Unsubscribe from weekly reports
            </Link>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
