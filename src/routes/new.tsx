import { createFileRoute } from "@tanstack/react-router";
import { NewAuditPage } from "@/pages/NewAuditPage";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Новый проект — Sverko" },
      { name: "description", content: "Создайте проект: загрузите отчёт и подтверждающие документы." },
      { property: "og:title", content: "Новый проект — Sverko" },
      { property: "og:description", content: "Загрузка отчёта и первичных документов для сверки." },
    ],
  }),
  component: NewAuditPage,
});
