import { forwardRef } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Ellipse, Text as SvgText, Image as SvgImage } from 'react-native-svg';
import type { Annotation, AnnotationLine, EllipseAnnotation, Point } from '@/src/types/annotation';
import { AngleAnnotationRenderer } from './angle-annotation-renderer';

type StaticAnnotationOverlayProps = {
  /** Annotations to render. */
  annotations: Annotation[];
  /** Width of the SVG viewport in pixels. */
  width: number;
  /** Height of the SVG viewport in pixels. */
  height: number;
  /** Called after the SVG has laid out and is ready for toDataURL. */
  onReady?: () => void;
  /** Optional background image (base64 data URI) rendered behind annotations.
   *  Used on Android to composite frame + annotations entirely within SVG
   *  so toDataURL produces a single image without needing captureRef. */
  backgroundImageUri?: string;
  /** Optional watermark text rendered at bottom-center of the SVG.
   *  Used to brand free-tier video exports (e.g. "recorded with divot"). */
  watermarkText?: string;
};

const toSvgPointsString = (
  points: Point[],
  width: number,
  height: number
): string => {
  return points.map((p) => `${p.x * width},${p.y * height}`).join(' ');
};

const LineRenderer = ({
  annotation,
  width,
  height,
}: {
  annotation: AnnotationLine;
  width: number;
  height: number;
}) => {
  if (annotation.type === 'straight-line' && annotation.points.length === 2) {
    const [start, end] = annotation.points;
    return (
      <Line
        x1={start.x * width}
        y1={start.y * height}
        x2={end.x * width}
        y2={end.y * height}
        stroke={annotation.color}
        strokeWidth={annotation.strokeWidth}
        strokeLinecap="round"
      />
    );
  }

  return (
    <Polyline
      points={toSvgPointsString(annotation.points, width, height)}
      fill="none"
      stroke={annotation.color}
      strokeWidth={annotation.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

const EllipseRenderer = ({
  annotation,
  width,
  height,
}: {
  annotation: EllipseAnnotation;
  width: number;
  height: number;
}) => (
  <Ellipse
    cx={annotation.center.x * width}
    cy={annotation.center.y * height}
    rx={annotation.radiusX * width}
    ry={annotation.radiusY * height}
    stroke={annotation.color}
    strokeWidth={annotation.strokeWidth}
    fill="none"
  />
);

/**
 * Static (non-interactive) SVG overlay for rendering annotations.
 * Used during frame capture — on iOS, captureRef captures the SVG directly.
 * On Android, set backgroundImageUri to composite frame + annotations in SVG,
 * then call toDataURL() on the ref to export a single PNG (bypassing captureRef
 * which can't see SVG content on Android).
 */
export const StaticAnnotationOverlay = forwardRef<Svg, StaticAnnotationOverlayProps>(
  ({ annotations, width, height, onReady, backgroundImageUri, watermarkText }, ref) => {
    const hasContent = annotations.length > 0 || !!watermarkText;
    if (!hasContent || width === 0 || height === 0) return null;

    return (
      <Svg
        ref={ref}
        style={StyleSheet.absoluteFill}
        width={width}
        height={height}
        onLayout={() => onReady?.()}
      >
        {backgroundImageUri && (
          <SvgImage
            href={backgroundImageUri}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {annotations.map((annotation) => {
          if (annotation.type === 'angle') {
            return (
              <AngleAnnotationRenderer
                key={annotation.id}
                annotation={annotation}
                width={width}
                height={height}
              />
            );
          }
          if (annotation.type === 'ellipse') {
            return (
              <EllipseRenderer
                key={annotation.id}
                annotation={annotation}
                width={width}
                height={height}
              />
            );
          }
          return (
            <LineRenderer
              key={annotation.id}
              annotation={annotation}
              width={width}
              height={height}
            />
          );
        })}
        {watermarkText && (
          <SvgText
            x={width / 2}
            y={height - 12}
            textAnchor="middle"
            fontSize={14}
            fontWeight="600"
            fill="white"
            opacity={0.5}
          >
            {watermarkText}
          </SvgText>
        )}
      </Svg>
    );
  }
);
