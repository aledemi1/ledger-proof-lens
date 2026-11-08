import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { AdminPage } from "@/pages/AdminPage";

export const Route = createFileRoute("/admin")({
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].meta.admin },
      { name: "description", content: copy[localeFromMatches(matches)].admin.lead },
    ],
  }),
  component: AdminPage,
});
