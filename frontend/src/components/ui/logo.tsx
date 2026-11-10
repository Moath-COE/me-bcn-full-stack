import Image from "next/image";

/* The full logo ships as two official files: one for light surfaces and a white one for dark
   surfaces. `next/image` serves them at the size requested. */

const RATIO = 753 / 444;

/** The full logo: mark, wordmark and tagline. */
export function BecanLogo({
  /** Height in pixels; the width follows the logo's ratio. */
  height = 40,
  /** Dark surfaces take the white version. */
  onDark = false,
  className = "",
  priority = false,
}: {
  height?: number;
  onDark?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={onDark ? "/brand/becan-logo-light.png" : "/brand/becan-logo.png"}
      alt="Becan"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
