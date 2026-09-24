import type { Metadata } from "next";
import { SignupFlow } from "@/components/signup-flow";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a protected Vera publishing identity.",
};

export default function SignupPage() {
  return <SignupFlow />;
}
