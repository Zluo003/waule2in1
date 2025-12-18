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
      {/* base path - monochrome black/white */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#525252' : 'currentColor'}
        strokeWidth={2}
        className="opacity-50 dark:text-white/60 text-neutral-400"
        style={{ pointerEvents: 'none' }}
        markerEnd={markerEnd}
      />

      {/* dashed overlay - monochrome */}
      <path
        d={edgePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="10 10"
        className="aurora-edge-dash text-neutral-600 dark:text-white/80"
        style={{ pointerEvents: 'none' }}
        markerEnd={markerEnd}
      />

      {/* moving dot */}
      <circle r={3} className="fill-neutral-700 dark:fill-white" style={{ pointerEvents: 'none' }}>
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