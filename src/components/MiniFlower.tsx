import React from "react";

export type FlowerType = "tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender";

interface MiniFlowerProps {
  type?: FlowerType;
  completed?: boolean;
  size?: number;
  className?: string;
  tooltip?: string;
}

export function MiniFlower({
  type = "tulip",
  completed = false,
  size = 24,
  className = "",
  tooltip,
}: MiniFlowerProps) {
  // Pastel colors for active vs inactive states
  const colors = {
    tulip: {
      active: "#d946ef", // magenta/pink
      bg: "rgba(217, 70, 239, 0.15)",
      border: "#c084fc",
    },
    jasmine: {
      active: "#ffffff", // pristine white jasmine
      bg: "rgba(248, 250, 252, 0.4)",
      border: "#d97706", // delicate gold/amber border
    },
    jouri: {
      active: "#f43f5e", // crimson rose
      bg: "rgba(244, 63, 94, 0.15)",
      border: "#e11d48",
    },
    violet: {
      active: "#8b5cf6", // rich violet
      bg: "rgba(139, 92, 246, 0.15)",
      border: "#7c3aed",
    },
    daffodil: {
      active: "#f97316", // bright orange-yellow
      bg: "rgba(249, 115, 22, 0.15)",
      border: "#ea580c",
    },
    lavender: {
      active: "#a855f7", // rich lavender purple
      bg: "rgba(168, 85, 247, 0.18)",
      border: "#7e22ce",
    },
  };

  const currentTheme = colors[type] || colors.tulip;
  const fillColor = completed ? currentTheme.active : "rgba(148, 163, 184, 0.15)";
  const strokeColor = completed ? currentTheme.border : "rgba(148, 163, 184, 0.4)";

  // Render SVG based on flower type
  switch (type) {
    case "jasmine":
      // Double-layered, nested jasmine petals
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <g transform="translate(12, 12)">
            {/* Outer Petals */}
            {[0, 72, 144, 216, 288].map((angle) => (
              <path
                key={`outer-${angle}`}
                d="M 0 0 C -4 -5.5, -3.2 -9.5, 0 -9.5 C 3.2 -9.5, 4 -5.5, 0 0"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="0.8"
                transform={`rotate(${angle})`}
              />
            ))}
            {/* Inner Nested Petals, rotated 36 deg and smaller */}
            {[36, 108, 180, 252, 324].map((angle) => (
              <path
                key={`inner-${angle}`}
                d="M 0 0 C -2.8 -4, -2.2 -6.5, 0 -6.5 C 2.2 -6.5, 2.8 -4, 0 0"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="0.6"
                transform={`rotate(${angle})`}
              />
            ))}
            <circle cx="0" cy="0" r="1.8" fill={completed ? "#eab308" : "rgba(148, 163, 184, 0.5)"} stroke={completed ? "#d97706" : "rgba(148, 163, 184, 0.4)"} strokeWidth="0.4" />
          </g>
        </svg>
      );

    case "jouri":
      // Layered circles representing a rose/jouri bud
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="none"
            stroke={strokeColor}
            strokeWidth="0.8"
            strokeDasharray={completed ? undefined : "1.5 1.5"}
          />
          <circle
            cx="12"
            cy="12"
            r="6"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="0.8"
          />
          <path
            d="M 12 7 C 9 9, 9 15, 12 17 C 15 15, 15 9, 12 7"
            fill="none"
            stroke={strokeColor}
            strokeWidth="0.8"
          />
          <circle cx="12" cy="12" r="2" fill={completed ? "#fda4af" : "rgba(148, 163, 184, 0.5)"} />
        </svg>
      );

    case "violet":
      // Pansy/violet with 5 rounded heart-like petals
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <g transform="translate(12, 12)">
            {[0, 72, 144, 216, 288].map((angle, idx) => (
              <path
                key={angle}
                d="M 0 0 C -4 -5, -4 -9, -2 -10 C 0 -9, 0 -9, 2 -10 C 4 -9, 4 -5, 0 0"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="0.8"
                transform={`rotate(${angle})`}
              />
            ))}
            <circle cx="0" cy="0" r="1.5" fill={completed ? "#fef08a" : "rgba(148, 163, 184, 0.5)"} />
          </g>
        </svg>
      );

    case "daffodil":
      // Daffodil with 6 petals and central cup
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <g transform="translate(12, 12)">
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <path
                key={angle}
                d="M 0 0 C -3.5 -5, -3 -9, 0 -10 C 3 -9, 3.5 -5, 0 0"
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="0.8"
                transform={`rotate(${angle})`}
              />
            ))}
            <circle
              cx="0"
              cy="0"
              r="3.5"
              fill={completed ? "#f97316" : "rgba(148, 163, 184, 0.3)"}
              stroke={completed ? "#ea580c" : "rgba(148, 163, 184, 0.5)"}
              strokeWidth="0.8"
            />
          </g>
        </svg>
      );

    case "lavender":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <path
            d="M 12 21 L 12 6"
            stroke={completed ? "#65a30d" : "rgba(148, 163, 184, 0.5)"}
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          <circle cx="12" cy="5" r="2" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="10" cy="8" r="1.8" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="14" cy="8" r="1.8" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="9.5" cy="11" r="1.8" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="14.5" cy="11" r="1.8" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="10" cy="14" r="1.7" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
          <circle cx="14" cy="14" r="1.7" fill={fillColor} stroke={strokeColor} strokeWidth="0.6" />
        </svg>
      );

    case "tulip":
    default:
      // Classic Tulip shape
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={`${className} transition-all duration-300`}
        >
          {tooltip && <title>{tooltip}</title>}
          <path
            d="M 12 21 L 12 16"
            stroke={strokeColor}
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            d="M 12 16 C 8 12, 8 6, 12 3 C 16 6, 16 12, 12 16 Z"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="0.8"
          />
          <path
            d="M 10 16 C 6 12, 8 7, 8 7 C 9 10, 11 11, 12 11"
            fill="none"
            stroke={strokeColor}
            strokeWidth="0.8"
          />
          <path
            d="M 14 16 C 18 12, 16 7, 16 7 C 15 10, 13 11, 12 11"
            fill="none"
            stroke={strokeColor}
            strokeWidth="0.8"
          />
        </svg>
      );
  }
}
