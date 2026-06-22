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
  streak: number;
  topCategories: { emoji: string; label: string; amount: number }[];
  causeName: string | null;
  causeAmount: number;
  causeImpactText: string | null;
  causeTotalRaised: number | null;
  causeGoalAmount: number | null;
  communityTotalSaved: number;
  communitySkipCount: number;
  communityUserCount: number;
  communityTopCategory: { emoji: string; label: string; amount: number } | null;
  unsubscribeUrl: string;
  appUrl: string;
}

const GREEN = "#2ecc71";
const GREEN_LIGHT = "#e8faf0";
const GREEN_DARK = "#0f2a0f";
const CORAL = "#e8715a";
const CORAL_LIGHT = "#fdf0ee";
const GOLD = "#f5a623";
const GOLD_LIGHT = "#fef9ec";
const PURPLE = "#7C3AED";
const PURPLE_LIGHT = "#f3f0ff";
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

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
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
      margin: "0 0 14px",
    }}>
      {children}
    </Text>
  );
}

export default function WeeklyReport({
  displayName,
  weekLabel,
  totalSaved,
  skipCount,
  streak,
  topCategories,
  causeName,
  causeAmount,
  causeImpactText,
  causeTotalRaised,
  causeGoalAmount,
  communityTotalSaved,
  communitySkipCount,
  communityUserCount,
  communityTopCategory,
  unsubscribeUrl,
  appUrl,
}: WeeklyReportProps) {
  const causePct =
    causeTotalRaised !== null && causeGoalAmount && causeGoalAmount > 0
      ? Math.min(100, Math.round((causeTotalRaised / causeGoalAmount) * 100))
      : null;

  return (
    <Html>
      <Head />
      <Preview>Your iSkipped savings report — {weekLabel} · {dollars(totalSaved)} saved</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: "0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>

          {/* Top bar */}
          <Section style={{ backgroundColor: GREEN_DARK, padding: "18px 32px", textAlign: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px", margin: "0 0 2px" }}>
              <span style={{ color: "#ffffff" }}>i</span><span style={{ color: GREEN }}>skipped</span>
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
              Weekly Savings Report · {weekLabel}
            </Text>
          </Section>

          {/* Greeting banner */}
          <Section style={{ backgroundColor: GREEN, padding: "28px 32px 24px", textAlign: "center" }}>
            <Text style={{ color: "rgba(0,0,0,0.5)", fontSize: 12, fontWeight: 600, margin: "0 0 8px", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
              Hey {displayName} 👋 — here's your week
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 60, fontWeight: 900, margin: "0 0 2px", lineHeight: 1 }}>
              {dollars(totalSaved)}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, margin: 0 }}>
              saved across <strong>{skipCount}</strong> skip{skipCount !== 1 ? "s" : ""}
            </Text>
          </Section>

          <Section style={{ padding: "24px 20px 0" }}>

            {/* ── SAVINGS BREAKDOWN ── */}
            {topCategories.length > 0 && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 22px", marginBottom: 12, borderLeft: `4px solid ${GREEN}` }}>
                <Badge color={GREEN} bg={GREEN_LIGHT}>💰 Savings Breakdown</Badge>
                {topCategories.map((cat, i) => (
                  <Row key={cat.label} style={{ marginBottom: i < topCategories.length - 1 ? 10 : 0 }}>
                    <Column style={{ width: "32px" }}>
                      <Text style={{ fontSize: 18, margin: 0 }}>{cat.emoji}</Text>
                    </Column>
                    <Column>
                      <Text style={{ color: TEXT_PRIMARY, fontSize: 14, margin: 0, fontWeight: 500 }}>{cat.label}</Text>
                    </Column>
                    <Column style={{ textAlign: "right" }}>
                      <Text style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 700, margin: 0 }}>{dollars(cat.amount)}</Text>
                    </Column>
                  </Row>
                ))}
              </Section>
            )}

            {/* ── IMPACT ── */}
            {causeName && (causeAmount > 0 || causeTotalRaised !== null) && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 22px", marginBottom: 12, borderLeft: `4px solid ${CORAL}` }}>
                <Badge color={CORAL} bg={CORAL_LIGHT}>❤️ Impact</Badge>

                {causeAmount > 0 && (
                  <Row style={{ marginBottom: causeTotalRaised !== null ? 16 : 0 }}>
                    <Column>
                      <Text style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>
                        Your contribution this week
                      </Text>
                      <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: 0 }}>{causeName}</Text>
                      {causeImpactText && (
                        <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: "2px 0 0" }}>{causeImpactText}</Text>
                      )}
                    </Column>
                    <Column style={{ textAlign: "right" }}>
                      <Text style={{ color: CORAL, fontSize: 22, fontWeight: 900, margin: 0 }}>{dollars(causeAmount)}</Text>
                    </Column>
                  </Row>
                )}

                {causeTotalRaised !== null && causeGoalAmount && (
                  <>
                    <Hr style={{ borderColor: BORDER, margin: "0 0 14px" }} />
                    <Row style={{ marginBottom: 8 }}>
                      <Column>
                        <Text style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 600, margin: 0 }}>
                          Total funded — {causeName}
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

            {/* ── iSKIPPED COMMUNITY ── */}
            <Section style={{ backgroundColor: GREEN_DARK, borderRadius: 12, padding: "20px 22px", marginBottom: 12 }}>
              <Badge color={GREEN} bg="rgba(46,204,113,0.15)">🌍 iSkipped Community This Week</Badge>
              <Row style={{ marginBottom: 14 }}>
                <Column style={{ textAlign: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>Saved Together</Text>
                  <Text style={{ color: "#ffffff", fontSize: 26, fontWeight: 900, margin: 0 }}>{dollarsRound(communityTotalSaved)}</Text>
                </Column>
                <Column style={{ textAlign: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>Total Skips</Text>
                  <Text style={{ color: "#ffffff", fontSize: 26, fontWeight: 900, margin: 0 }}>{communitySkipCount.toLocaleString()}</Text>
                </Column>
                <Column style={{ textAlign: "center" }}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 4px" }}>Members Active</Text>
                  <Text style={{ color: "#ffffff", fontSize: 26, fontWeight: 900, margin: 0 }}>{communityUserCount}</Text>
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
                    <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}> — {dollarsRound(communityTopCategory.amount)} saved community-wide</span>
                  </Text>
                </>
              )}
            </Section>

            {/* ── REWARD ── */}
            {streak > 0 && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 22px", marginBottom: 12, borderLeft: `4px solid ${GOLD}`, textAlign: "center" }}>
                <Badge color={GOLD} bg={GOLD_LIGHT}>🔥 Your Streak</Badge>
                <Text style={{ color: TEXT_PRIMARY, fontSize: 36, fontWeight: 900, margin: "0 0 4px" }}>
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
