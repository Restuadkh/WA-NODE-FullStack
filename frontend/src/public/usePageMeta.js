import { useEffect } from "react";

function upsertMeta(attribute, key, content) {
  let el = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = url;
}

// Metadata unik per halaman. URL canonical mengikuti domain yang dipakai pengunjung,
// sehingga tidak perlu menyimpan domain fiktif di source code.
export function usePageMeta(page) {
  useEffect(() => {
    const url = `${window.location.origin}${page.path}`;
    document.title = page.title;
    upsertMeta("name", "description", page.description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", "WA Dashboard");
    upsertMeta("property", "og:title", page.title);
    upsertMeta("property", "og:description", page.description);
    upsertMeta("property", "og:url", url);
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", page.title);
    upsertMeta("name", "twitter:description", page.description);
    upsertCanonical(url);
  }, [page]);
}
