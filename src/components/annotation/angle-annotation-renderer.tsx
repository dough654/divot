import { Line, Circle, Path, Text as SvgText, G } from 'react-native-svg';
import type { AngleAnnotation } from '@/src/types/annotation';
import { computeAngleLabelPosition } from '@/src/utils/angle-math';

type AngleAnnotationRendererProps = {
  annotation: AngleAnnotation;
  width: number;
  height: number;
};

const ARC_RADIUS_PX = 20;

/**
 * Builds an SVG arc path string near the vertex to visually indicate the angle.
 */
const buildArcPath = (
  vertexX: number,
  vertexY: number,
  rayAX: number,
  rayAY: number,
  rayBX: number,
  rayBY: number,
  radius: number
): string => {
  // Unit vectors from vertex to each ray endpoint
  const dxA = rayAX - vertexX;
  const dyA = rayAY - vertexY;
  const lenA = Math.sqrt(dxA * dxA + dyA * dyA);
  if (lenA === 0) return '';

  const dxB = rayBX - vertexX;
  const dyB = rayBY - vertexY;
  const lenB = Math.sqrt(dxB * dxB + dyB * dyB);
  if (lenB === 0) return '';

  const arcStartX = vertexX + (dxA / lenA) * radius;
  const arcStartY = vertexY + (dyA / lenA) * radius;
  const arcEndX = vertexX + (dxB / lenB) * radius;
  const arcEndY = vertexY + (dyB / lenB) * radius;

  // Determine sweep direction using cross product
  const cross = dxA * dyB - dyA * dxB;
  const sweepFlag = cross > 0 ? 1 : 0;

  // Determine if the angle is > 180 (large arc flag)
  // Since we always show 0-180, large arc is 0
  const largeArcFlag = 0;

  return `M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${arcEndX} ${arcEndY}`;
};

/**
 * Renders an angle annotation as two SVG lines from the vertex to each ray endpoint,
 * a small arc near the vertex, a circle at the vertex, and a degree label.
 */
export const AngleAnnotationRenderer = ({
  annotation,
  width,
  height,
}: AngleAnnotationRendererProps) => {
  const { vertex, rayEndpointA, rayEndpointB, angleDegrees, color, strokeWidth } =
    annotation;

  const vx = vertex.x * width;
  const vy = vertex.y * height;
  const ax = rayEndpointA.x * width;
  const ay = rayEndpointA.y * height;
  const bx = rayEndpointB.x * width;
  const by = rayEndpointB.y * height;

  const arcPath = buildArcPath(vx, vy, ax, ay, bx, by, ARC_RADIUS_PX);

  const labelPos = computeAngleLabelPosition(vertex, rayEndpointA, rayEndpointB, 0.1);
  const labelX = labelPos.x * width;
  const labelY = labelPos.y * height;

  return (
    <G>
      {/* Ray A */}
      <Line
        x1={vx}
        y1={vy}
        x2={ax}
        y2={ay}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Ray B */}
      <Line
        x1={vx}
        y1={vy}
        x2={bx}
        y2={by}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Arc */}
      {arcPath !== '' && (
        <Path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth * 0.75}
        />
      )}
      {/* Vertex dot */}
      <Circle cx={vx} cy={vy} r={4} fill={color} />
      {/* Angle label */}
      <SvgText
        x={labelX}
        y={labelY}
        fill={color}
        fontSize={14}
        fontWeight="bold"
        textAnchor="middle"
        alignmentBaseline="central"
      >
        {`${angleDegrees}°`}
      </SvgText>
    </G>
  );
};
