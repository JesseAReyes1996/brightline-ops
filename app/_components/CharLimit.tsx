// Live length feedback for text fields with a server-side limit. Fields don't
// use maxLength, which would silently cut off pasted text mid-sentence;
// instead the count turns red and the form refuses to submit until it fits.
// Lengths are of the trimmed text, because that's what the server checks.

const format = (n: number) => n.toLocaleString("en-US");

/** How many characters `value` is over `max`, or 0. */
export function overLimitBy(value: string, max: number): number {
  return Math.max(0, value.trim().length - max);
}

/** "4,684 / 5,000", shown next to the field's label. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const length = value.trim().length;
  return (
    <span className={length > max ? "error small" : "muted small"}>
      {format(length)} / {format(max)}
    </span>
  );
}

/** A message under a field that's over its limit; nothing otherwise. Give the field aria-describedby={id}. */
export function OverLimitMessage({ id, value, max, field }: { id: string; value: string; max: number; field: string }) {
  const over = overLimitBy(value, max);
  if (over === 0) return null;
  return (
    <span id={id} role="alert" className="error small">
      {field} is {format(over)} character{over === 1 ? "" : "s"} over the {format(max)}-character limit. Shorten it
      to continue.
    </span>
  );
}
