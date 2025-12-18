import { memo } from 'react';
import type { EdgeProps } from 'reactflow';
import { getBezierPath } from 'reactflow';

const AuroraEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <g className="aurora-edge">
      <defs>
        <linearGradient id={`aurora-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#404040" stopOpacity={0.5} />
          <stop offset="50%" stopColor="#525252" stopOpacity={1} />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.5} />
        </linearGradient>
        <filter id={`aurora-glow-${id}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* base path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#525252' : 'currentColor'}
        strokeWidth={2}
        className="opacity-30 dark:text-white/40 text-slate-300"
        style={{ pointerEvents: 'none' }}
        markerEnd={markerEnd}
      />

      {/* gradient dashed overlay */}
      <path
        d={edgePath}
        fill="none"
        stroke={`url(#aurora-grad-${id})`}
        strokeWidth={2}
        strokeDasharray="10 10"
        className="aurora-edge-dash"
        style={{ 
          filter: `url(#aurora-glow-${id})`,
          pointerEvents: 'none'
        }}
        markerEnd={markerEnd}
      />

      {/* moving dot */}
      <circle r={3} className="fill-slate-700 dark:fill-white" style={{ pointerEvents: 'none' }}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} calcMode="linear" />
      </circle>

      {/* Invisible WIDE hitbox on TOP for easier selection - NO DASHES, SOLID TRANSPARENT */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={40}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          pointerEvents: 'stroke',
          cursor: 'pointer'
        }}
      />
    </g>
  );
});

export default AuroraEdge;