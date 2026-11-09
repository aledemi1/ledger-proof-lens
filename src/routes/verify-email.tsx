import { createFileRoute } from "@tanstack/react-router";
import { copy } from "@/i18n/messages";
import { localeFromMatches } from "@/i18n/use-locale";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: ({ matches }) => ({
    meta: [
      { title: copy[localeFromMatches(matches)].auth.verifyTitle },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function VerifyRoute() {
    const { token } = Route.useSearch();
    return <VerifyEmailPage token={token} />;
  },
});
