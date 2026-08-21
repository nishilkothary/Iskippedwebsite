import {
  Body,
  Button,
  Container,
  Head,
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
  displayName?: string | null;
  weekLabel: string;
  totalSaved: number;
  skipCount: number;
  streak: number;
  endedStreakWeeks?: number | null;
  causeName: string | null;
  causeAmount: number;
  causeImpactText: string | null;
  communityTotalSaved: number;
  communitySkipCount: number;
  unsubscribeUrl: string;
  appUrl: string;
}

const GREEN = "#2ecc71";
const GREEN_DARK = "#0f2a0f";
const CORAL = "#e8715a";
const GOLD = "#f5a623";
const BG = "#f0f2ef";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#111827";
const TEXT_MUTED = "#6B7280";
const BORDER = "#E5E7EB";

function dollars(n: number) {
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

function dollarsRound(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function firstName(displayName?: string | null) {
  return displayName?.trim().split(/\s+/)[0] || "there";
}

export default function WeeklyReport({
  displayName,
  weekLabel,
  totalSaved,
  skipCount,
  streak,
  endedStreakWeeks,
  causeName,
  causeAmount,
  causeImpactText,
  communityTotalSaved,
  communitySkipCount,
  unsubscribeUrl,
  appUrl,
}: WeeklyReportProps) {
  const skipLabel = skipCount === 1 ? "skip" : "skips";
  const savedSomething = skipCount > 0;
  const name = firstName(displayName);
  const impactLine =
    causeImpactText ??
    (causeName && causeAmount > 0
      ? `${dollars(causeAmount)} pledged for ${causeName}`
      : null);
  const streakEnded = skipCount === 0 && !!endedStreakWeeks && endedStreakWeeks > 0;

  return (
    <Html>
      <Head />
      <Preview>Did you skip anything this week? Log it and keep your progress going.</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>

          <Section style={{ backgroundColor: GREEN_DARK, padding: "34px 32px 32px", textAlign: "center" }}>
            <Text style={{ fontSize: 25, fontWeight: 900, margin: "0 0 16px" }}>
              <span style={{ color: "#ffffff" }}>i</span><span style={{ color: GREEN }}>skipped</span>
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 30, fontWeight: 900, margin: "0 0 10px", lineHeight: 1.15 }}>
              Hey {name}, anything you skipped this week?
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.74)", fontSize: 15, lineHeight: 1.45, margin: "0 0 22px" }}>
              Don&apos;t forget to add anything you said no to buying and keep your progress going.
            </Text>
            <Button
              href={appUrl}
              style={{
                backgroundColor: GREEN,
                color: GREEN_DARK,
                fontSize: 15,
                fontWeight: 900,
                borderRadius: 50,
                padding: "14px 38px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Log a skip
            </Button>
            <Text style={{ color: "rgba(255,255,255,0.42)", fontSize: 11, margin: "18px 0 0", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              Weekly check-in
            </Text>
          </Section>

          <Section style={{ padding: "18px 16px 0" }}>
            <Section style={{ backgroundColor: "#f7fbf7", borderRadius: 10, padding: "22px 22px", marginBottom: 12, border: `1px solid #cfe8d5`, borderTop: `4px solid ${GREEN}` }}>
              <Text style={{ color: GREEN_DARK, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 14px" }}>
                Your Skip Snapshot
              </Text>
              <Row>
                <Column style={{ width: "50%", textAlign: "center", padding: "10px 8px 8px", backgroundColor: "#edf7ef", borderRadius: 8 }}>
                  <Text style={{ color: GREEN_DARK, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 5px" }}>
                    {weekLabel}
                  </Text>
                  <Text style={{ color: savedSomething ? GREEN_DARK : TEXT_MUTED, fontSize: 28, fontWeight: 900, margin: 0 }}>
                    {skipCount}
                  </Text>
                  <Text style={{ color: TEXT_MUTED, fontSize: 12, fontWeight: 700, margin: "4px 0 0" }}>
                    {skipLabel} logged
                  </Text>
                </Column>
                <Column style={{ width: "50%", textAlign: "center", padding: "10px 8px 8px", backgroundColor: savedSomething ? "#e1f5e6" : "#f1f4f1", borderRadius: 8 }}>
                  <Text style={{ color: GREEN_DARK, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 5px" }}>
                    Saved
                  </Text>
                  <Text style={{ color: savedSomething ? GREEN_DARK : TEXT_MUTED, fontSize: 28, fontWeight: 900, margin: 0 }}>
                    {dollars(totalSaved)}
                  </Text>
                  <Text style={{ color: TEXT_MUTED, fontSize: 12, fontWeight: 700, margin: "4px 0 0" }}>
                    from skips
                  </Text>
                </Column>
              </Row>
            </Section>

            {impactLine && (
              <Section style={{ backgroundColor: CARD_BG, borderRadius: 10, padding: "22px 22px", marginBottom: 12, borderLeft: `4px solid ${CORAL}` }}>
                <Text style={{ color: CORAL, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 10px" }}>
                  Impact of Your Skips
                </Text>
                <Text style={{ color: TEXT_PRIMARY, fontSize: 24, fontWeight: 900, lineHeight: 1.25, margin: "0 0 8px" }}>
                  {impactLine}
                </Text>
              </Section>
            )}

            <Section style={{ backgroundColor: CARD_BG, borderRadius: 10, padding: "22px 22px", marginBottom: 12, border: `1px solid ${BORDER}` }}>
              <Row>
                <Column style={{ width: "50%", textAlign: "center", paddingRight: 8 }}>
                  <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 5px" }}>
                    Community Saved
                  </Text>
                  <Text style={{ color: TEXT_PRIMARY, fontSize: 26, fontWeight: 900, margin: 0 }}>
                    {dollarsRound(communityTotalSaved)}
                  </Text>
                </Column>
                <Column style={{ width: "50%", textAlign: "center", paddingLeft: 8, borderLeft: `1px solid ${BORDER}` }}>
                  <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 5px" }}>
                    Total Skips
                  </Text>
                  <Text style={{ color: TEXT_PRIMARY, fontSize: 26, fontWeight: 900, margin: 0 }}>
                    {communitySkipCount.toLocaleString()}
                  </Text>
                </Column>
              </Row>
            </Section>

            {streakEnded ? (
              <>
                <Text style={{ color: GOLD, fontSize: 19, fontWeight: 900, lineHeight: 1.35, textAlign: "center", margin: "18px 0 4px" }}>
                  Your <strong style={{ color: GOLD }}>{endedStreakWeeks}</strong>-week skip streak took a pause.
                </Text>
                <Text style={{ color: TEXT_MUTED, fontSize: 14, lineHeight: 1.45, textAlign: "center", margin: 0 }}>
                  Fresh start: log one skip this week and start a new streak.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: GOLD, fontSize: 19, fontWeight: 900, lineHeight: 1.35, textAlign: "center", margin: "18px 0 4px" }}>
                  Your streak is <strong style={{ color: GOLD }}>{streak}</strong> week{streak === 1 ? "" : "s"}.
                </Text>
                <Text style={{ color: TEXT_MUTED, fontSize: 14, lineHeight: 1.45, textAlign: "center", margin: 0 }}>
                  Keep it going by logging one thing you skipped this week.
                </Text>
              </>
            )}
          </Section>

          <Section style={{ textAlign: "center", padding: "24px 0 30px" }}>
            <Button
              href={appUrl}
              style={{
                backgroundColor: GREEN,
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 50,
                padding: "13px 34px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open iSkipped
            </Button>
          </Section>

          <Section style={{ backgroundColor: GREEN_DARK, padding: "16px 32px", textAlign: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "0 0 4px" }}>
              You're receiving this as an iSkipped member.
            </Text>
            <Link href={unsubscribeUrl} style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
              Unsubscribe from weekly check-ins
            </Link>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
