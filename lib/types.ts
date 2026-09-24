export type AccountType = "journalist" | "media_org" | "funder";
export type VerificationStatus = "pending" | "approved" | "rejected";

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

export type PendingVerification = {
  id: string;
  journalistId: string;
  alias: string;
  documentPath: string | null;
  submittedAt: number;
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
  visibility: "members" | "media_only";
};

export type FeedFilter = "for-you" | "latest" | "following";
