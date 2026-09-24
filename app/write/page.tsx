import type { Metadata } from "next";
import { ArticleEditor } from "@/components/article-editor";

export const metadata: Metadata = {
  title: "Write",
  description: "Write and securely publish protected reporting with Vera.",
};

export default function WritePage() {
  return <ArticleEditor />;
}
