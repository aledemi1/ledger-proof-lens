import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { AuditsListPage } from "@/pages/AuditsListPage";

export const Route = createFileRoute("/audits/")({
  head: ({ matches }) => {
    const meta = copy[localeFromMatches(matches)].meta;
    return {
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: meta.auditsTitle },
      { name: "description", content: meta.auditsDescription },
      { property: "og:title", content: meta.auditsTitle },
      { property: "og:description", content: meta.auditsDescription },
    ],
    };
  },
  component: AuditsListPage,
});
