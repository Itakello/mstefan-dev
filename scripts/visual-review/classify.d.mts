export type VisualReviewClassification = {
  run: boolean;
  reason: string;
  changed: string[];
  matched: string[];
  nativeFavicon: boolean;
};

export function isUiImpactingPath(path: string): boolean;

export function classifyVisualReview(
  paths: string[],
  options?: { force?: boolean },
): VisualReviewClassification;
