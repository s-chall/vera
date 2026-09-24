import { NewsFeed } from "@/components/news-feed";

export const metadata = {
  title: "News",
  description: "Verified reporting from journalists and activists publishing through Vera.",
};

export default function NewsPage() {
  return (
    <main id="main-content" className="news-page">
      <NewsFeed />
    </main>
  );
}
