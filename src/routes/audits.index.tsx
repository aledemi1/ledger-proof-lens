import { createFileRoute } from "@tanstack/react-router";
import { AuditsListPage } from "@/pages/AuditsListPage";

export const Route = createFileRoute("/audits/")({
  head: () => ({
    meta: [
      { title: "Проверки отчётности — Sverko" },
      { name: "description", content: "Список проверок отчётности по первичным документам: статусы, результаты и расхождения." },
      { property: "og:title", content: "Проверки отчётности — Sverko" },
      { property: "og:description", content: "Сверка отчётов с первичными документами и поиск расхождений." },
    ],
  }),
  component: AuditsListPage,
});
