import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/pages/WorkspacePage";

export const Route = createFileRoute("/audits/$id/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Проект — Sverko" },
      { name: "description", content: "Результаты сверки показателей отчёта с первичными документами и подсветкой источников." },
      { property: "og:title", content: "Проект — Sverko" },
      { property: "og:description", content: "Отчёт слева, первичные документы справа, расхождения подсвечены по категориям." },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <WorkspacePage key={id} id={id} />;
}
