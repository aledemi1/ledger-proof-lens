import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { LandingPage } from "@/pages/LandingPage";

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const t = copy[localeFromMatches(matches)].meta;
    return {
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: t.homeTitle },
      { name: "description", content: t.homeDescription },
      { property: "og:title", content: t.homeTitle },
      { property: "og:description", content: t.homeDescription },
    ],
    };
  },
  component: LandingPage,
});
