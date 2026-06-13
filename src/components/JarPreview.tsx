import { formatCurrency } from "@/lib/utils/currency";

export function makeJarPath(scale: number) {
  return [
    `M${20*scale},${40*scale}`,
    `Q${20*scale},${40*scale} ${25*scale},${35*scale}`,
    `L${35*scale},${30*scale}`,
    `Q${40*scale},${28*scale} ${42*scale},${25*scale}`,
    `L${42*scale},${15*scale}`,
    `Q${42*scale},${10*scale} ${48*scale},${10*scale}`,
    `L${72*scale},${10*scale}`,
    `Q${78*scale},${10*scale} ${78*scale},${15*scale}`,
    `L${78*scale},${25*scale}`,
    `Q${80*scale},${28*scale} ${85*scale},${30*scale}`,
    `L${95*scale},${35*scale}`,
    `Q${100*scale},${40*scale} ${100*scale},${45*scale}`,
    `L${100*scale},${155*scale}`,
    `Q${100*scale},${170*scale} ${85*scale},${170*scale}`,
    `L${35*scale},${170*scale}`,
    `Q${20*scale},${170*scale} ${20*scale},${155*scale}`,
    `Z`,
  ].join(" ");
}

export function JarPreview({ fillPct, color, gradEnd, label, amount, emptyPrompt, unitDisplay, unitCount, centerValue, centerLabel, goalAmount, hideTopLabel }: {
  fillPct: number;
  color: string;
  gradEnd: string;
  label: string | null;
  amount: string;
  emptyPrompt: string;
  unitDisplay?: string;
  unitCount?: number;
  centerValue?: string;
  centerLabel?: string;
  goalAmount?: number;
  hideTopLabel?: boolean;
}) {
  const clamp = Math.min(Math.max(fillPct, 0), 100);
  const w = 130;
  const h = 185;
  const scale = w / 120;
  const fillH = (clamp / 100) * 120 * scale;
  const jarH = 170 * scale;
  const yStart = jarH - fillH;
  const uid = `${label ?? emptyPrompt}-${color}-${Math.round(clamp)}`.replace(/\W/g, "");
  const jarPath = makeJarPath(scale);

  return (
    <div className="flex flex-col items-center" style={{ marginBottom: hideTopLabel ? 0 : 20 }}>
      {!hideTopLabel && (
        <div style={{
          fontSize: label ? 14 : 13,
          fontWeight: label ? 700 : 600,
          color: label ? color : "rgba(255,255,255,0.55)",
          textAlign: "center",
          marginBottom: 6,
          maxWidth: w,
          lineHeight: 1.3,
          padding: "0 4px",
        }}>
          {label ?? emptyPrompt}
        </div>
      )}

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={`jp-gf-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={gradEnd} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <linearGradient id={`jp-glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>
          <linearGradient id={`jp-shine-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={`jp-soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy={3*scale} stdDeviation={4*scale} floodColor={color} floodOpacity="0.25" />
          </filter>
          <clipPath id={`jp-jc-${uid}`}>
            <path d={jarPath} />
          </clipPath>
        </defs>

        <ellipse cx={60*scale} cy={169*scale} rx={38*scale} ry={7*scale} fill="rgba(0,0,0,0.22)" />
        <path d={jarPath} fill={`url(#jp-glass-${uid})`} />

        <g clipPath={`url(#jp-jc-${uid})`}>
          {clamp > 0 && (
            <rect
              x={15*scale} y={yStart}
              width={90*scale} height={fillH + 15*scale}
              fill={`url(#jp-gf-${uid})`}
              rx={4*scale}
              filter={`url(#jp-soft-${uid})`}
            >
              <animate attributeName="y" from={jarH} to={yStart} dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" />
            </rect>
          )}
          {clamp > 4 && (
            <path
              d={`M${15*scale},${yStart} Q${37*scale},${yStart-5*scale} ${60*scale},${yStart} T${105*scale},${yStart}`}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2*scale}
              strokeLinecap="round"
            />
          )}
          {clamp > 10 && (
            <circle cx={40*scale} cy={yStart + fillH*0.4} r={3*scale} fill="rgba(255,255,255,0.24)">
              <animate attributeName="cy" values={`${yStart+fillH*0.7};${yStart+fillH*0.1}`} dur="3s" repeatCount="indefinite" />
            </circle>
          )}
          {clamp > 18 && (
            <circle cx={76*scale} cy={yStart + fillH*0.58} r={2*scale} fill="rgba(255,255,255,0.18)">
              <animate attributeName="cy" values={`${yStart+fillH*0.82};${yStart+fillH*0.25}`} dur="4s" repeatCount="indefinite" />
            </circle>
          )}
        </g>

        <path
          d={`M${45*scale},${16*scale} L${45*scale},${28*scale} M${75*scale},${16*scale} L${75*scale},${28*scale}`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.5*scale}
          strokeLinecap="round"
        />
        <path d={jarPath} fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={2.4*scale} strokeLinejoin="round" />
        <path
          d={`M${36*scale},${46*scale} Q${28*scale},${82*scale} ${35*scale},${139*scale}`}
          fill="none"
          stroke={`url(#jp-shine-${uid})`}
          strokeWidth={4*scale}
          strokeLinecap="round"
          opacity="0.85"
        />

        {unitDisplay && unitCount !== undefined ? (
          <>
            <text x={60*scale} y={84*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={15*scale} fontWeight="800"
              fill={clamp > 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
              style={{ fontFamily: "inherit" }}>
              {unitCount >= 10 ? Math.round(unitCount) : parseFloat(unitCount.toFixed(1))}
            </text>
            <text x={60*scale} y={102*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={7*scale} fontWeight="600" fill="rgba(255,255,255,0.65)"
              style={{ fontFamily: "inherit" }}>
              {unitDisplay}
            </text>
            <text x={60*scale} y={114*scale} textAnchor="middle" dominantBaseline="middle"
              fontSize={6*scale} fontWeight="500" fill="rgba(255,255,255,0.4)"
              style={{ fontFamily: "inherit" }}>
              pledged
            </text>
          </>
        ) : (
          <>
            <text x={60*scale} y={92*scale} textAnchor="middle" dominantBaseline="middle"
              transform={goalAmount && goalAmount > 0 ? `translate(0 ${-8*scale})` : undefined}
              fontSize={(centerValue && centerValue.length > 4 ? 14 : 17)*scale} fontWeight="800"
              fill={clamp > 0 || centerValue ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"}
              style={{ fontFamily: "inherit" }}>
              {centerValue ?? `${Math.round(clamp)}%`}
            </text>
            {(clamp > 0 || centerLabel) && (
              <text x={60*scale} y={112*scale} textAnchor="middle" dominantBaseline="middle"
                transform={goalAmount && goalAmount > 0 ? `translate(0 ${-10*scale})` : undefined}
                fontSize={7*scale} fontWeight="600" fill="rgba(255,255,255,0.5)"
                style={{ fontFamily: "inherit" }}>
                {goalAmount && goalAmount > 0 ? "to goal of" : centerLabel ?? "to goal"}
              </text>
            )}
            {goalAmount && goalAmount > 0 && (
              <text x={60*scale} y={114*scale} textAnchor="middle" dominantBaseline="middle"
                fontSize={7*scale} fontWeight="700" fill="rgba(255,255,255,0.72)"
                style={{ fontFamily: "inherit" }}>
                {formatCurrency(goalAmount)}
              </text>
            )}
          </>
        )}
      </svg>

      <div style={{ fontSize: 26, fontWeight: 800, color: label ? "var(--text-primary)" : "var(--text-muted)", marginTop: 2 }}>
        {amount}
      </div>
    </div>
  );
}
