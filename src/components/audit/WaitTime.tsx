import { fill } from "@/i18n/fill";
import { useCopy } from "@/i18n/messages";
import { waitBounds } from "@/lib/waitEstimate";

/** Shows a rough remaining time. The number comes from pages still to read and text already read. */
export function WaitTime({ seconds, next = false }: { seconds?: number | undefined; next?: boolean }) {
  const t = useCopy();
  if (!seconds || seconds < 1) return null;
  const bounds = waitBounds(seconds);
  const time = bounds.kind === "under"
    ? t.work.underMinute
    : bounds.kind === "about"
      ? fill(t.work.aboutMinutes, { n: bounds.n })
      : fill(t.work.rangeMinutes, { low: bounds.low, high: bounds.high });
  return <p className="mt-1 text-muted-foreground">{fill(next ? t.work.etaNext : t.work.etaLeft, { time })}</p>;
}
