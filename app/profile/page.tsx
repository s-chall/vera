import type { Metadata } from "next";
import { JournalistProfile } from "@/components/journalist-profile";

export const metadata: Metadata = {
  title: "Journalist profile",
  description: "Manage your Vera publishing profile, reporting, and Bitcoin payouts.",
};

export default function ProfilePage() {
  return <JournalistProfile />;
}
