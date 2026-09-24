import valleyImage from "@/assets/valley-reporting.png";
import roadsideImage from "@/assets/roadside-sources.png";

export const leadStory = {
  slug: "towns-erased-from-the-map",
  author: "Northstar",
  title: "Inside the towns being erased from the official map",
  dek: "Public records say these communities no longer exist. Their residents—and our reporting—show otherwise.",
  summary: "A six-month investigation into vanished boundaries, withheld records, and the people refusing to disappear.",
  readTime: "18 min read",
  filed: "Filed 2 hours ago",
  image: valleyImage,
  articleImage: roadsideImage,
};

export const reports = [
  { author: "Mothlight", title: "The procurement trail behind a failing water system", category: "Public infrastructure", time: "11 min" },
  { author: "Red Cedar", title: "Who profits when wildfire maps stop at the county line?", category: "Climate", time: "9 min" },
  { author: "Signal 29", title: "Inside the court records a city tried to seal", category: "Accountability", time: "14 min" },
];

export const payouts = [
  { alias: "Northstar", date: "Sep 22", amount: "0.0480 BTC", score: "36.4% of epoch" },
  { alias: "Mothlight", date: "Sep 18", amount: "0.0215 BTC", score: "16.3% of epoch" },
  { alias: "Red Cedar", date: "Sep 12", amount: "0.0340 BTC", score: "25.8% of epoch" },
  { alias: "Signal 29", date: "Sep 08", amount: "0.0168 BTC", score: "12.7% of epoch" },
];
