import type { Metadata } from "next";
import { ReportingFund } from "@/components/reporting-fund";

export const metadata: Metadata = {
  title: "Total Pool",
  description: "Contribute Bitcoin to Vera's community-funded reporting pool.",
};

export default function FundPage() {
  return <ReportingFund />;
}
