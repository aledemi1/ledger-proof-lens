import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { InboxPage } from "@/pages/InboxPage";

export const Route = createFileRoute("/admin_/mail")({
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].meta.inbox },
      { name: "description", content: copy[localeFromMatches(matches)].inbox.lead },
    ],
  }),
  component: InboxPage,
});
