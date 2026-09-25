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
  credentialName: string | null;
  credentialCarnet: string | null;
  credentialSection: string | null;
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
  heroImageUrl: string | null;
  heroImageCredit: string | null;
  heroImageAlt: string | null;
  earnedSats: number;
};

export type FeedFilter = "for-you" | "latest" | "following";

/** What a story is signed with: the press credential when there is one,
 *  otherwise the protected alias. */
export function bylineName(byline: { alias: string; credentialName: string | null } | null) {
  if (!byline) return "Unknown";
  return byline.credentialName ?? byline.alias;
}
