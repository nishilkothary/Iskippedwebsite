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
  weekLabel: string;
  totalSaved: number;
  skipCount: number;
  streak: number;
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

export default function WeeklyReport({
  weekLabel,
  totalSaved,
  skipCount,
  streak,
  causeName,
  causeAmount,
  causeImpactText,
  communityTotalSaved,
  communitySkipCount,
  unsubscribeUrl,
  appUrl,
}: WeeklyReportProps) {
  const skipLabel = skipCount === 1 ? "skip" : "skips";
  const impactLine =
    causeImpactText ??
    (causeName && causeAmount > 0
      ? `${dollars(causeAmount)} pledged for ${causeName}`
      : null);

  return (
    <Html>
      <Head />
      <Preview>{`iSkipped ${dollars(totalSaved)} across ${skipCount} ${skipLabel} this week`}</Preview>
      <Body style={{ backgroundColor: BG, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>

          <Section style={{ backgroundColor: GREEN_DARK, padding: "34px 32px 30px", textAlign: "center" }}>
            <Text style={{ fontSize: 25, fontWeight: 900, margin: "0 0 16px" }}>
              <span style={{ color: "#ffffff" }}>i</span><span style={{ color: GREEN }}>skipped</span>
            </Text>
            <Text style={{ color: "#ffffff", fontSize: 54, fontWeight: 900, margin: "0 0 8px", lineHeight: 1 }}>
              {dollars(totalSaved)}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.74)", fontSize: 14, margin: "0 0 4px" }}>
              across <strong>{skipCount}</strong> {skipLabel} this week
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.42)", fontSize: 11, margin: 0, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              {weekLabel}
            </Text>
          </Section>

          <Section style={{ padding: "18px 16px 0" }}>
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
              <Text style={{ color: GREEN_DARK, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, margin: "0 0 14px" }}>
                iSkipped Community
              </Text>
              <Row>
                <Column style={{ width: "50%", textAlign: "center", paddingRight: 8 }}>
                  <Text style={{ color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 5px" }}>
                    Money Saved
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

            <Text style={{ color: GOLD, fontSize: 19, fontWeight: 900, lineHeight: 1.35, textAlign: "center", margin: "18px 0 4px" }}>
              Your weekly skip streak is <strong style={{ color: GOLD }}>{streak}</strong> week{streak === 1 ? "" : "s"}.
            </Text>
            <Text style={{ color: TEXT_MUTED, fontSize: 14, lineHeight: 1.45, textAlign: "center", margin: 0 }}>
              Keep it alive this week by skipping one more expense.
            </Text>
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
              Log your next skip
            </Button>
          </Section>

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
