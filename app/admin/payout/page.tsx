import type { Metadata } from "next";
import { AdminPayoutPortal } from "@/components/admin-payout";

export const metadata: Metadata = {
  title: "Payout admin",
  description: "Distribute Total Pool sats to earning journalists and reset the pool.",
};

export default function AdminPayoutPage() {
  return <AdminPayoutPortal />;
}
