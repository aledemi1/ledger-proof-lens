import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { NewAuditPage } from "@/pages/NewAuditPage";

export const Route = createFileRoute("/new")({
  head: ({ matches }) => {
    const meta = copy[localeFromMatches(matches)].meta;
    return {
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: meta.newTitle },
      { name: "description", content: meta.newDescription },
      { property: "og:title", content: meta.newTitle },
      { property: "og:description", content: meta.newDescription },
    ],
    };
  },
  component: NewAuditPage,
});
