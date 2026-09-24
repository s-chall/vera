export type Byline = {
  id: string;
  alias: string;
  seal: string;
  beat: string;
  region: string;
  bio: string;
  verified: boolean;
  followers: number;
  articleCount: number;
};

export type Article = {
  id: string;
  slug: string;
  journalistId: string;
  title: string;
  dek: string;
  body: string[];
  art: string;
  category: string;
  readMins: number;
  publishedAt: number | null;
};

export type FeedFilter = "for-you" | "latest" | "following";
