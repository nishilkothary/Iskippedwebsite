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
const GREEN_DARK = "#1a3a1a";
const BG = "#f4f6f3";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 14px" }}>
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
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 540, margin: "0 auto" }}>

          {/* Wordmark */}
          <Section style={{ textAlign: "center", paddingBottom: 20 }}>
            <Text style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", margin: "0 0 4px" }}>
              <span style={{ color: TEXT_PRIMARY }}>i</span><span style={{ color: GREEN }}>skipped</span>
            </Text>
            <Text style={{ color: TEXT_MUTED, fontSize: 11, margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              Weekly Savings Report · {weekLabel}
            </Text>
          </Section>

          {/* ── TOTAL SAVED ── */}
          <Section style={{ backgroundColor: GREEN, borderRadius: 16, padding: "32px", marginBottom: 10, textAlign: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, margin: "0 0 8px", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              Total Saved
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 56, fontWeight: 900, margin: "0 0 4px", lineHeight: 1 }}>
              {dollars(totalSaved)}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, margin: "0 0 0" }}>
              across {skipCount} skip{skipCount !== 1 ? "s" : ""} this week
            </Text>
          </Section>

          {/* Savings breakdown */}
          {topCategories.length > 0 && (
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "22px 24px", marginBottom: 10 }}>
              <SectionLabel>Savings Breakdown</SectionLabel>
              {topCategories.map((cat, i) => (
                <Row key={cat.label} style={{ marginBottom: i < topCategories.length - 1 ? 12 : 0 }}>
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
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "22px 24px", marginBottom: 10 }}>
              <SectionLabel>Impact</SectionLabel>

              {/* User's contribution this week */}
              {causeAmount > 0 && (
                <Row style={{ marginBottom: causeTotalRaised !== null ? 16 : 0 }}>
                  <Column>
                    <Text style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 500, margin: "0 0 2px" }}>
                      Your contribution this week
                    </Text>
                    <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: 0 }}>{causeName}</Text>
                    {causeImpactText && (
                      <Text style={{ color: TEXT_MUTED, fontSize: 12, margin: "2px 0 0" }}>{causeImpactText}</Text>
                    )}
                  </Column>
                  <Column style={{ textAlign: "right" }}>
                    <Text style={{ color: GREEN, fontSize: 20, fontWeight: 800, margin: 0 }}>{dollars(causeAmount)}</Text>
                  </Column>
                </Row>
              )}

              {/* Cause total progress */}
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
                        <div style={{ backgroundColor: GREEN, width: `${causePct}%`, height: "100%", borderRadius: 6 }} />
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

          {/* Community */}
          <Section style={{ backgroundColor: GREEN_DARK, borderRadius: 12, padding: "22px 24px", marginBottom: 10 }}>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 14px" }}>
              Community
            </Text>
            <Row style={{ marginBottom: 12 }}>
              <Column>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: "0 0 2px" }}>Saved together</Text>
                <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: 800, margin: 0 }}>{dollarsRound(communityTotalSaved)}</Text>
              </Column>
              <Column style={{ textAlign: "right" }}>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: "0 0 2px" }}>Total skips</Text>
                <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: 800, margin: 0 }}>{communitySkipCount.toLocaleString()}</Text>
              </Column>
            </Row>
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "0 0 0" }}>
              from {communityUserCount} member{communityUserCount !== 1 ? "s" : ""} this week
            </Text>
            {communityTopCategory && (
              <>
                <Hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "12px 0" }} />
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 6px" }}>
                  Most skipped this week
                </Text>
                <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {communityTopCategory.emoji} {communityTopCategory.label} — {dollarsRound(communityTopCategory.amount)} saved community-wide
                </Text>
              </>
            )}
          </Section>

          {/* ── REWARD ── */}
          {streak > 0 && (
            <Section style={{ backgroundColor: CARD_BG, borderRadius: 12, padding: "20px 24px", marginBottom: 10, textAlign: "center" }}>
              <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 8px" }}>
                Reward
              </Text>
              <Text style={{ fontSize: 32, margin: "0 0 4px" }}>🔥</Text>
              <Text style={{ color: TEXT_PRIMARY, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>
                {streak}-day streak
              </Text>
              <Text style={{ color: TEXT_MUTED, fontSize: 13, margin: 0 }}>
                Keep it going — log a skip today
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={{ textAlign: "center", padding: "20px 0 24px" }}>
            <Button
              href={appUrl}
              style={{
                backgroundColor: GREEN,
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 50,
                padding: "14px 36px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open iSkipped →
            </Button>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: "0 0 16px" }} />

          <Section style={{ textAlign: "center" }}>
            <Text style={{ color: TEXT_LIGHT, fontSize: 11, margin: "0 0 4px" }}>
              You're receiving this as an iSkipped member.
            </Text>
            <Link href={unsubscribeUrl} style={{ color: TEXT_LIGHT, fontSize: 11 }}>
              Unsubscribe from weekly reports
            </Link>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
