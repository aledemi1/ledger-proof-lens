import { createFileRoute } from "@tanstack/react-router";
import { ConclusionPage } from "@/pages/ConclusionPage";

export const Route = createFileRoute("/audits/$id/conclusion")({
  head: () => ({
    meta: [
      { title: "Заключение по проверке — Sverko" },
      { name: "description", content: "Итоговое заключение по результатам проверки отчёта с выявленными замечаниями." },
      { property: "og:title", content: "Заключение по проверке — Sverko" },
      { property: "og:description", content: "Рекомендация системы, решение проверяющего и замечания." },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <ConclusionPage id={id} />;
}
