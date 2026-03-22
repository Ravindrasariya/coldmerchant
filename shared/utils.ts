export function computeNetWeight(weight: number, bags: number, place?: string | null): number {
  if (weight <= 0) return 0;
  if (place === "mandi") return weight;
  return Math.max(0, weight - bags);
}
