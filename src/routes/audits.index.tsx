import { createFileRoute } from "@tanstack/react-router";
import { AuditsListPage } from "@/pages/AuditsListPage";

export const Route = createFileRoute("/audits/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Проекты — Sverko" },
      { name: "description", content: "Проекты сверки: в каждом отчёт и его первичные документы, статусы и расхождения." },
      { property: "og:title", content: "Проекты — Sverko" },
      { property: "og:description", content: "Сверка отчётов с первичными документами и поиск расхождений." },
    ],
  }),
  component: AuditsListPage,
});
