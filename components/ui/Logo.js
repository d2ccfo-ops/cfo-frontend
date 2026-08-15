// The CFO OS mark.
//
// Rendered as a CSS MASK over `currentColor`, not as an <img>. The source art
// is near-black ink on a near-white plate with no alpha channel, so dropping it
// in as an image would paint a white rectangle on the dark theme's sidebar and
// a subtly-wrong off-white patch on the light theme's cards. Masking throws the
// plate away and keeps only the ink's coverage, so the glyph takes the colour
// of whatever text colour it inherits — one asset that is correct in both
// themes, and correct again if the palette changes.
//
// The two assets are generated from logo.png by normalising its measured levels
// (plate 252, ink 23) into alpha and trimming the ~25% padding it ships with.
//
// Width is derived from height rather than set, because both files are stored
// at a fixed height and a hardcoded box would letterbox or crush the glyph.

const WORDMARK_RATIO = 562 / 102; // measured off public/logo-wordmark.png
const MARK_RATIO = 1;

function masked(src, { height, ratio, className, label }) {
  const style = {
    height,
    width: height * ratio,
    // Both prefixes: Safari still ships the mask shorthand only behind -webkit-.
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
  return (
    <span
      role="img"
      aria-label={label}
      // bg-current is the whole trick: the painted colour is the inherited
      // text colour, and the mask decides where it lands.
      className={`inline-block flex-none bg-current ${className}`}
      style={style}
    />
  );
}

/** The full "CFO OS" wordmark. */
export function Logo({ height = 22, className = "" }) {
  return masked("/logo-wordmark.png", { height, ratio: WORDMARK_RATIO, className, label: "CFO OS" });
}

/** The "C" alone — for square slots: the collapsed rail and small chrome. */
export function LogoMark({ height = 20, className = "" }) {
  return masked("/logo-mark.png", { height, ratio: MARK_RATIO, className, label: "CFO OS" });
}

export default Logo;
