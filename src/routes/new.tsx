import { createFileRoute } from "@tanstack/react-router";
import { NewAuditPage } from "@/pages/NewAuditPage";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Новая проверка — Sverko" },
      { name: "description", content: "Создайте проверку: загрузите отчёт и подтверждающие документы." },
      { property: "og:title", content: "Новая проверка — Sverko" },
      { property: "og:description", content: "Загрузка отчёта и первичных документов для сверки." },
    ],
  }),
  component: NewAuditPage,
});
