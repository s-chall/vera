import type { Metadata } from "next";
import { ReportingFund } from "@/components/reporting-fund";

export const metadata: Metadata = {
  title: "Reporting fund",
  description: "Contribute Bitcoin to Vera's community-funded reporting pool.",
};

export default function FundPage() {
  return <ReportingFund />;
}
