import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/pages/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Sverko — проверка достоверности отчётности по первичным документам" },
      {
        name: "description",
        content:
          "Sverko сопоставляет показатели отчёта со счетами, накладными и актами, находит расхождения и готовит обоснованное заключение со ссылками на источники.",
      },
      { property: "og:title", content: "Sverko — проверка достоверности отчётности" },
      {
        property: "og:description",
        content: "Автоматическая сверка отчётов с первичными документами: расхождения, источники и заключение.",
      },
    ],
  }),
  component: LandingPage,
});
