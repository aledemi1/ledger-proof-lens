import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/pages/WorkspacePage";

export const Route = createFileRoute("/audits/$id/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Рабочее пространство проверки — Sverko" },
      { name: "description", content: "Результаты сверки показателей отчёта с первичными документами и подсветкой источников." },
      { property: "og:title", content: "Рабочее пространство проверки — Sverko" },
      { property: "og:description", content: "Таблица показателей и просмотр первичных документов." },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <WorkspacePage key={id} id={id} />;
}
