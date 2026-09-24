import { ShieldCheck } from "lucide-react";

export function StatusBadge({ children = "Privately verified" }: { children?: React.ReactNode }) {
  return <span className="status-badge"><ShieldCheck aria-hidden="true" />{children}</span>;
}
