import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "@/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Новый аккаунт — Sverko" },
      { name: "description", content: "Создание аккаунта Sverko." },
    ],
  }),
  component: RegisterPage,
});
