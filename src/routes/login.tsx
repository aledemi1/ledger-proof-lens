import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Вход — Sverko" },
      { name: "description", content: "Вход в аккаунт Sverko." },
    ],
  }),
  component: LoginPage,
});
