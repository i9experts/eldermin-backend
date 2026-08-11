import sharp from 'sharp';

// ============================================================
// OMR DETECTION - real, working implementation, but NOT yet verified
// against real photographed answer sheets (no sample images were
// available to test against while building this). Real-world
// calibration of the darkness thresholds and marker-detection
// robustness below should be expected before relying on this in
// production - this is stated honestly rather than implied to be
// battle-tested.
//
// Approach: detect the 4 printed alignment markers in the photo, use
// them to compute a real projective transform (homography) back to the
// paper's known layout, then sample each expected bubble location
// (mapped through that transform) for darkness. A homography - not a
// simpler affine transform - is used deliberately, since a phone held
// at even a slight angle introduces genuine keystone/perspective
// distortion that an affine transform cannot correct.
// ============================================================

export interface Point { x: number; y: number; }
export interface MmPoint { xMm: number; yMm: number; }
export interface DetectedBubble { label: string; darkness: number; }
export interface QuestionDetectionResult {
  questionNumber: number;
  detectedOption: string | null;
  confidence: number;
  isAmbiguous: boolean;
}

const REFERENCE_DPI = 150; // working resolution for detection - photos are downscaled to this equivalent for speed and consistency
const MM_TO_PX = REFERENCE_DPI / 25.4;

function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

// ── Homography (4-point DLT) ─────────────────────────────────
// Solves for the 3x3 projective transform H such that dst ~= H * src
// (in homogeneous coordinates), given exactly 4 point correspondences.
// Standard direct linear transform - solved here as an 8x8 linear
// system via Gaussian elimination rather than pulling in a linear
// algebra dependency for a problem this bounded and well-defined.
export function computeHomography(src: Point[], dst: Point[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('Homography requires exactly 4 point correspondences');
  }

  const A: number[][] = [];
  const bVec: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    bVec.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    bVec.push(dy);
  }

  const h = gaussianSolve(A, bVec);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) continue;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row, i) => row[n] / (row[i] || 1e-10));
}

export function applyHomography(h: number[], p: Point): Point {
  const [a, b, c, d, e, f, g, i] = h;
  const w = g * p.x + i * p.y + 1;
  return { x: (a * p.x + b * p.y + c) / w, y: (d * p.x + e * p.y + f) / w };
}

// ── Marker detection ──────────────────────────────────────────
async function findMarkerCentroid(
  raw: Buffer, width: number, height: number,
  regionX: number, regionY: number, regionW: number, regionH: number,
  darknessThreshold = 90,
): Promise<Point | null> {
  let sumX = 0, sumY = 0, sumWeight = 0;
  const x0 = Math.max(0, Math.floor(regionX));
  const y0 = Math.max(0, Math.floor(regionY));
  const x1 = Math.min(width, Math.ceil(regionX + regionW));
  const y1 = Math.min(height, Math.ceil(regionY + regionH));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const val = raw[y * width + x];
      if (val < darknessThreshold) {
        const weight = darknessThreshold - val;
        sumX += x * weight;
        sumY += y * weight;
        sumWeight += weight;
      }
    }
  }

  if (sumWeight === 0) return null;
  return { x: sumX / sumWeight, y: sumY / sumWeight };
}

export interface OMRDetectionInput {
  imageBuffer: Buffer;
  pageWidthMm: number;
  pageHeightMm: number;
  markersMm: MmPoint[];
  questions: { questionNumber: number; bubbles: { label: string; xMm: number; yMm: number }[] }[];
  bubbleRadiusMm: number;
}

export interface OMRDetectionResult {
  results: QuestionDetectionResult[];
  markersFound: boolean;
  error?: string;
}

export async function detectOMRAnswers(input: OMRDetectionInput): Promise<OMRDetectionResult> {
  const { imageBuffer, pageWidthMm, pageHeightMm, markersMm, questions, bubbleRadiusMm } = input;

  const targetWidth = Math.round(mmToPx(pageWidthMm));
  const targetHeight = Math.round(mmToPx(pageHeightMm));

  let raw: Buffer;
  let actualWidth: number, actualHeight: number;
  try {
    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    raw = data;
    actualWidth = info.width;
    actualHeight = info.height;
  } catch (err: any) {
    return { results: [], markersFound: false, error: `Could not read the uploaded image: ${err.message}` };
  }

  const searchMargin = mmToPx(25);
  const idealPoints: Point[] = markersMm.map((m) => ({ x: mmToPx(m.xMm), y: mmToPx(m.yMm) }));
  const detectedPoints: (Point | null)[] = [];

  for (const ideal of idealPoints) {
    const found = await findMarkerCentroid(
      raw, actualWidth, actualHeight,
      ideal.x - searchMargin, ideal.y - searchMargin, searchMargin * 2, searchMargin * 2,
    );
    detectedPoints.push(found);
  }

  if (detectedPoints.some((p) => p === null)) {
    return {
      results: [],
      markersFound: false,
      error: 'Could not locate all 4 alignment markers - check the photo captures the full sheet with reasonable lighting and no glare on the corners.',
    };
  }

  const dst = detectedPoints as Point[];
  let homography: number[];
  try {
    homography = computeHomography(idealPoints, dst);
  } catch (err: any) {
    return { results: [], markersFound: false, error: `Could not compute alignment: ${err.message}` };
  }

  const bubbleRadiusPx = mmToPx(bubbleRadiusMm);
  const results: QuestionDetectionResult[] = [];

  for (const q of questions) {
    const bubbleDarkness: DetectedBubble[] = [];
    for (const bubble of q.bubbles) {
      const idealPx = { x: mmToPx(bubble.xMm), y: mmToPx(bubble.yMm) };
      const photoPoint = applyHomography(homography, idealPx);
      const darkness = sampleCircularDarkness(raw, actualWidth, actualHeight, photoPoint, bubbleRadiusPx);
      bubbleDarkness.push({ label: bubble.label, darkness });
    }

    bubbleDarkness.sort((a, b) => b.darkness - a.darkness);
    const top = bubbleDarkness[0];
    const runnerUp = bubbleDarkness[1];

    const FILLED_THRESHOLD = 0.35;
    const AMBIGUITY_GAP = 0.12;

    if (!top || top.darkness < FILLED_THRESHOLD) {
      results.push({ questionNumber: q.questionNumber, detectedOption: null, confidence: 0, isAmbiguous: false });
    } else if (runnerUp && top.darkness - runnerUp.darkness < AMBIGUITY_GAP) {
      results.push({ questionNumber: q.questionNumber, detectedOption: null, confidence: top.darkness, isAmbiguous: true });
    } else {
      results.push({ questionNumber: q.questionNumber, detectedOption: top.label, confidence: top.darkness, isAmbiguous: false });
    }
  }

  return { results, markersFound: true };
}

function sampleCircularDarkness(raw: Buffer, width: number, height: number, center: Point, radiusPx: number): number {
  let darkCount = 0, totalCount = 0;
  const x0 = Math.max(0, Math.floor(center.x - radiusPx));
  const y0 = Math.max(0, Math.floor(center.y - radiusPx));
  const x1 = Math.min(width, Math.ceil(center.x + radiusPx));
  const y1 = Math.min(height, Math.ceil(center.y + radiusPx));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x - center.x, dy = y - center.y;
      if (dx * dx + dy * dy > radiusPx * radiusPx) continue;
      totalCount++;
      if (raw[y * width + x] < 128) darkCount++;
    }
  }

  return totalCount > 0 ? darkCount / totalCount : 0;
}
