"use client";

import { useRef, useState } from "react";

const SPARKS = [
  { kind: "z", x: -62, y: -84, delay: "0s" },
  { kind: "px", x: 8, y: -96, delay: "0.02s" },
  { kind: "px", x: 54, y: -70, delay: "0.05s" },
  { kind: "z", x: -18, y: -108, delay: "0.04s" },
  { kind: "px", x: -78, y: -36, delay: "0.07s" },
  { kind: "z", x: 46, y: -112, delay: "0.06s" },
  { kind: "px", x: 78, y: -28, delay: "0.03s" },
  { kind: "px", x: -36, y: -58, delay: "0.08s" },
  { kind: "z", x: 22, y: -64, delay: "0.01s" },
  { kind: "px", x: 64, y: -48, delay: "0.09s" },
];

/** Playful sealed chest. Motion is skipped when the visitor asks for less motion. */
export function SealedChest() {
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [note, setNote] = useState("");
  const timer = useRef(0);

  function peek() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setNote("Still sealed.");
      return;
    }
    setNote("");
    setOpen(true);
    setBurst((n) => n + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 1100);
  }

  return (
    <button
      type="button"
      className={open ? "zl-chestBtn is-open" : "zl-chestBtn"}
      aria-pressed={open}
      aria-label="Sealed chest"
      onClick={peek}
    >
      <svg className="zl-chestSvg" viewBox="0 0 600 600" aria-hidden="true">
        <defs>
          <linearGradient id="chestGL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1C1C1C"/><stop offset="1" stopColor="#101010"/></linearGradient>
          <linearGradient id="chestGR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#121212"/><stop offset="1" stopColor="#080808"/></linearGradient>
          <linearGradient id="chestGT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2A2A2A"/><stop offset="1" stopColor="#1A1A1A"/></linearGradient>
          <radialGradient id="chestGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#F4B728" stopOpacity="0.16"/><stop offset="1" stopColor="#F4B728" stopOpacity="0"/></radialGradient>
          <filter id="chestBlur"><feGaussianBlur stdDeviation="4"/></filter>
        </defs>
        <ellipse cx="300" cy="330" rx="290" ry="230" fill="url(#chestGlow)"/>
        <ellipse cx="300" cy="387" rx="230" ry="60" fill="#000" opacity="0.6" filter="url(#chestBlur)"/>
        <polygon points="144.1,305.0 300.0,395.0 300.0,290.6 144.1,200.6" fill="url(#chestGL)" />
        <polygon points="455.9,305.0 300.0,395.0 300.0,290.6 455.9,200.6" fill="url(#chestGR)" />
        <polygon points="216.6,346.9 227.5,353.1 227.5,248.8 216.6,242.5" fill="#F4B728" opacity="0.9"/>
        <polygon points="383.4,346.9 372.5,353.1 372.5,248.8 383.4,242.5" fill="#B9871A" opacity="0.9"/>
        <polyline points="144.1,305.0 300.0,395.0 455.9,305.0" fill="none" stroke="#3A3A3A" strokeWidth="1.5" strokeLinejoin="round" />
        <polyline points="300.0,395.0 300.0,290.6" fill="none" stroke="#4A4A4A" strokeWidth="1.5" strokeLinejoin="round" />
        <polygon className="zl-interior" points="168,188 300,262 432,188 300,214" fill="#F4B728"/>
        <g className="zl-lid">
          <polygon points="131.6,194.3 300.0,291.5 300.0,266.3 131.6,169.1" fill="#161616" />
          <polygon points="468.4,194.3 300.0,291.5 300.0,266.3 468.4,169.1" fill="#0E0E0E" />
          <polygon points="131.6,169.1 300.0,266.3 300.0,221.3 172.2,147.5" fill="#202020" />
          <polygon points="468.4,169.1 300.0,266.3 300.0,221.3 427.8,147.5" fill="#141414" />
          <polygon points="300.0,73.7 427.8,147.5 300.0,221.3 172.2,147.5" fill="url(#chestGT)" />
          <polygon points="210.4,239.8 221.3,246.1 221.3,220.8 210.4,214.5" fill="#F4B728" opacity="0.9"/>
          <polygon points="389.6,239.8 378.7,246.1 378.7,220.8 389.6,214.5" fill="#B9871A" opacity="0.9"/>
          <polyline className="zl-sealLine" points="131.6,197.4 300.0,294.7 468.4,197.4" fill="none" stroke="#F4B728" strokeWidth="7" strokeLinejoin="round" opacity="0.25" filter="url(#chestBlur)"/>
          <polyline className="zl-sealLine" points="131.6,197.4 300.0,294.7 468.4,197.4" fill="none" stroke="#F4B728" strokeWidth="2" strokeLinejoin="round" />
          <polyline points="300.0,291.5 300.0,266.3 300.0,221.3" fill="none" stroke="#4A4A4A" strokeWidth="1.5" strokeLinejoin="round" />
          <polyline points="300.0,73.7 427.8,147.5 300.0,221.3 172.2,147.5 300.0,73.7" fill="none" stroke="#3A3A3A" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon className="zl-seal" points="334.0,114.5 336.8,114.6 339.5,114.9 342.1,115.5 344.5,116.3 346.8,117.3 348.9,118.5 350.7,119.9 352.2,121.4 353.4,123.0 354.3,124.8 354.8,126.6 355.0,128.4 354.8,130.2 354.3,132.0 353.4,133.7 352.2,135.3 350.7,136.8 348.9,138.2 346.8,139.4 344.5,140.4 342.1,141.2 339.5,141.8 336.8,142.2 334.0,142.3 292.1,142.3 289.4,142.2 286.7,141.8 284.1,141.2 281.7,140.4 279.4,139.4 277.3,138.2 275.5,136.8 274.0,135.3 272.8,133.7 271.9,132.0 271.4,130.2 271.2,128.4 271.4,126.6 271.9,124.8 272.8,123.0 274.0,121.4 275.5,119.9 277.3,118.5 279.4,117.3 281.7,116.3 284.1,115.5 286.7,114.9 289.4,114.6 292.1,114.5" fill="#F4B728" />
          <polygon className="zl-seal" points="307.9,152.7 310.6,152.8 313.3,153.2 315.9,153.8 318.3,154.6 320.6,155.6 322.7,156.8 324.5,158.2 326.0,159.7 327.2,161.3 328.1,163.0 328.6,164.8 328.8,166.6 328.6,168.4 328.1,170.2 327.2,172.0 326.0,173.6 324.5,175.1 322.7,176.5 320.6,177.7 318.3,178.7 315.9,179.5 313.3,180.1 310.6,180.4 307.9,180.5 266.0,180.5 263.2,180.4 260.5,180.1 257.9,179.5 255.5,178.7 253.2,177.7 251.1,176.5 249.3,175.1 247.8,173.6 246.6,172.0 245.7,170.2 245.2,168.4 245.0,166.6 245.2,164.8 245.7,163.0 246.6,161.3 247.8,159.7 249.3,158.2 251.1,156.8 253.2,155.6 255.5,154.6 257.9,153.8 260.5,153.2 263.2,152.8 266.0,152.7" fill="#F4B728" />
        </g>
      </svg>
      <span key={burst} className="zl-sparks" aria-hidden="true">
        {SPARKS.map((spark) => (
          <span
            key={`${spark.x}-${spark.y}`}
            className={spark.kind === "z" ? "zl-spark zl-sparkZ" : "zl-spark zl-sparkPx"}
            style={{ ["--x" as string]: `${spark.x}px`, ["--y" as string]: `${spark.y}px`, animationDelay: spark.delay }}
          >{spark.kind === "z" ? "Z" : ""}</span>
        ))}
      </span>
      <span className="zl-chestNote" role="status">{note}</span>
    </button>
  );
}
