import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { RegisterPage } from "@/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].meta.register },
      { name: "description", content: copy[localeFromMatches(matches)].auth.registerLead },
    ],
  }),
  component: RegisterPage,
});
