import { createFileRoute } from "@tanstack/react-router";
import { AuditsListPage } from "@/pages/AuditsListPage";

export const Route = createFileRoute("/audits/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Проверки — Sverko" },
      { name: "description", content: "Проверки сверки: в каждой отчёт и его первичные документы, статусы и расхождения." },
      { property: "og:title", content: "Проверки — Sverko" },
      { property: "og:description", content: "Сверка отчётов с первичными документами и поиск расхождений." },
    ],
  }),
  component: AuditsListPage,
});
