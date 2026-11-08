import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { LoginPage } from "@/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].meta.login },
      { name: "description", content: copy[localeFromMatches(matches)].auth.loginLead },
    ],
  }),
  component: LoginPage,
});
