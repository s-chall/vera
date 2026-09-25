import Image from "next/image";
import valleyImage from "@/assets/valley-reporting.png";
import roadsideImage from "@/assets/roadside-sources.png";

/** The two photographs we have, mapped to the stories they were shot for. */
const PHOTOS: Record<string, { src: typeof valleyImage; alt: string }> = {
  "inside-the-towns-being-erased-from-the-official-map": {
    src: valleyImage, alt: "A remote mountain town beside a river",
  },
  "who-profits-when-the-water-stops": {
    src: roadsideImage, alt: "Residents and a reporter reviewing a map beside a rural road",
  },
};

export function hasPhoto(slug: string, url?: string | null) {
  return Boolean(url) || Boolean(PHOTOS[slug]);
}

/** Falls back to a generated cover so an article without a photo still reads as one. */
export function ArtBlock({ slug, kind, priority, sizes, url, alt, uploaded }: {
  slug: string; kind: string; priority?: boolean; sizes?: string;
  url?: string | null; alt?: string | null;
  uploaded?: { url: string | null; alt: string } | null;
}) {
  // An image the author uploaded, from Vera's private bucket through a
  // short-lived signed URL. Not handed to next/image: its optimiser would
  // fetch the file server-side and keep a copy outside the bucket's policies.
  if (uploaded?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="art-fill" src={uploaded.url} alt={uploaded.alt} decoding="async" />;
  }
  // A story can carry its own lead image, referenced from wherever it was
  // published rather than bundled here.
  if (url) {
    return <Image src={url} alt={alt || "Lead image"} fill priority={priority} sizes={sizes} />;
  }
  const photo = PHOTOS[slug];
  if (photo) return <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes={sizes} />;
  return <span className={`generated-art art-${kind}`} role="img" aria-label="Generated cover artwork" />;
}
