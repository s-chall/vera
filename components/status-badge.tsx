import { ShieldCheck } from "lucide-react";

/**
 * Only rendered for a journalist a review has actually verified. An unverified
 * account gets nothing rather than a badge asserting something false.
 */
export function StatusBadge({ verified, children = "Privately verified" }: {
  verified: boolean;
  children?: React.ReactNode;
}) {
  if (!verified) return null;
  return <span className="status-badge"><ShieldCheck aria-hidden="true" />{children}</span>;
}

export function UnverifiedNote() {
  return (
    <p className="unverified-note">
      Not verified. The shield appears once a review confirms you are one real person,
      and it is never something an account can set for itself.
    </p>
  );
}
