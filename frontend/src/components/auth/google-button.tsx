import Image from "next/image";
import { GhostButton } from "@/components/ui/kit";

/* Outlined, not amber: the one amber button on the screen is the form's submit. */
export function GoogleButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <GhostButton onClick={onClick} disabled={disabled} className="w-full gap-3">
      <Image src="/brand/google-g.svg" alt="" width={20} height={20} unoptimized aria-hidden="true" />
      {children}
    </GhostButton>
  );
}

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-sm font-semibold text-ink-2">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
