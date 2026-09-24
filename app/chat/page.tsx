import type { Metadata } from "next";
import { ChatBriefs } from "@/components/chat-briefs";

export const metadata: Metadata = {
  title: "Chat",
  description: "Follow your deposit address into biweekly payouts to journalist pseudonyms.",
};

export default function ChatPage() {
  return <ChatBriefs />;
}
