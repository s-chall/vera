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

export function hasPhoto(slug: string) {
  return Boolean(PHOTOS[slug]);
}

/** Falls back to a generated cover so an article without a photo still reads as one. */
export function ArtBlock({ slug, kind, priority, sizes }: {
  slug: string; kind: string; priority?: boolean; sizes?: string;
}) {
  const photo = PHOTOS[slug];
  if (photo) return <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes={sizes} />;
  return <span className={`generated-art art-${kind}`} role="img" aria-label="Generated cover artwork" />;
}
