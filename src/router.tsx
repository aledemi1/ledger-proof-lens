import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { isPrefixedLocale, type Locale } from "./i18n/locales";
import { stripLocalePrefix } from "./i18n/path";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();
  let locale: Locale = "ru";

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    rewrite: {
      input: ({ url }) => {
        const segment = url.pathname.split("/").filter(Boolean)[0];
        if (segment === "ru" || isPrefixedLocale(segment)) {
          locale = segment === "ru" ? "ru" : segment;
          url.pathname = stripLocalePrefix(url.pathname);
        } else {
          locale = "ru";
        }
        return url;
      },
      output: ({ url }) => {
        const bare = stripLocalePrefix(url.pathname);
        url.pathname = locale === "ru" ? bare : bare === "/" ? `/${locale}` : `/${locale}${bare}`;
        return url;
      },
    },
  });

  return router;
};
