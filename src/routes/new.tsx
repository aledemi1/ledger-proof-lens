import { createFileRoute } from "@tanstack/react-router";
import { NewAuditPage } from "@/pages/NewAuditPage";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "Новая проверка — Sverko" },
      { name: "description", content: "Создайте проверку: загрузите отчёт и подтверждающие документы." },
      { property: "og:title", content: "Новая проверка — Sverko" },
      { property: "og:description", content: "Загрузка отчёта и первичных документов для сверки." },
    ],
  }),
  component: NewAuditPage,
});
