// The ONE money formatter for the app. There were four copies of a function
// called formatInrShort/rupeesShort, and they disagreed: AbbrCurrency
// abbreviated above ₹10 lakh, while lib/insights and two pages abbreviated
// above ₹1 lakh. That is how an evidence drawer ended up reading
// "Gross sales ₹1.3 L" directly above "Same period last month ₹61,047" — the
// same kind of number, one rounded away and one exact, in adjacent rows.
//
// Anything that displays rupees imports from here.

// Below this, always print the exact figure. Abbreviation only earns its keep
// once a number is long enough to be unreadable at a glance — ₹22,74,15,52,137
// is noise in a tile, but "₹1.3 L" for ₹1,30,412 destroys four digits of
// precision to save six characters, on a screen whose entire purpose is
// letting someone check a number.
export const ABBREVIATE_ABOVE = 1e6; // ₹10 lakh

// Indian lakh/crore short form — but only above ABBREVIATE_ABOVE. Under it,
// this returns the full grouped figure, identical to formatInrFull.
export function formatInrShort(rupees) {
  if (rupees == null || Number.isNaN(rupees)) return "—";
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (abs < ABBREVIATE_ABOVE) return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
  // Unit chosen AFTER rounding, not before. Picking it first meant ₹99,99,999
  // rendered as "₹100.00 L" — arithmetically true, but nobody writes a crore
  // that way, and it reads as a formatting bug at exactly the moment a number
  // crosses into the range people care most about.
  const lakh = abs / 1e5;
  if (Number(lakh.toFixed(2)) >= 100) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  return `${sign}₹${lakh.toFixed(2)} L`;
}

export function formatInrFull(rupees) {
  if (rupees == null || Number.isNaN(rupees)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}
