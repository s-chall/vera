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

export type Visibility = "members" | "media_only";

/** An image attached to an article. `url` is a short-lived signed URL. */
export type ArticleImage = {
  path: string;
  url: string | null;
  alt: string;
};

export type Article = {
  id: string;
  slug: string;
  journalistId: string;
  title: string;
  dek: string;
  /** Stored blocks; see lib/article-body.ts. */
  body: string[];
  art: string;
  category: string;
  readMins: number;
  publishedAt: number | null;
  visibility: Visibility;
  /** A remote photograph credited to its outlet (seeded stories). */
  heroImageUrl: string | null;
  heroImageCredit: string | null;
  heroImageAlt: string | null;
  earnedSats: number;
  /** An image the author uploaded; takes precedence over heroImageUrl. */
  leadImage: ArticleImage | null;
  images: ArticleImage[];
};

/** An image already scrubbed by lib/scrub-image.ts, ready to upload. */
export type PreparedImage = {
  blob: Blob;
  type: string;
  extension: string;
  alt: string;
};

export type PublishInput = {
  title: string;
  dek: string;
  body: string[];
  visibility: Visibility;
  leadImage: PreparedImage | null;
  images: PreparedImage[];
};

export type FeedFilter = "for-you" | "latest" | "following";

/** What a story is signed with: the press credential when there is one,
 *  otherwise the protected alias. */
export function bylineName(byline: { alias: string; credentialName: string | null } | null) {
  if (!byline) return "Unknown";
  return byline.credentialName ?? byline.alias;
}
