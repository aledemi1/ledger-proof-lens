import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { StatsPage } from "@/pages/StatsPage";

export const Route = createFileRoute("/admin_/stats")({
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].meta.stats },
      { name: "description", content: copy[localeFromMatches(matches)].stats.lead },
    ],
  }),
  component: StatsPage,
});
