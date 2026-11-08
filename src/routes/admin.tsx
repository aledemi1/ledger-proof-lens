import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/pages/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Пользователи — Sverko" },
      { name: "description", content: "Учётные записи и роли Sverko." },
    ],
  }),
  component: AdminPage,
});
