import './core.js';

// Keep the browser's favicon endpoint private; send only PNG bytes to the palette.
export function createFaviconLoader(runtime, fetchImage = fetch) {
  const cache = new Map();
  return (pageUrl) => {
    const page = globalThis.ArcCore.safeUrl(pageUrl);
    if (!page) return Promise.resolve('');
    if (!cache.has(page)) cache.set(page, (async () => {
      try {
        const url = new URL(runtime.getURL('_favicon/'));
        url.searchParams.set('pageUrl', page);
        url.searchParams.set('size', '64');
        const response = await fetchImage(url.href, { signal: AbortSignal.timeout(500) });
        if (!response.ok) return '';
        const blob = await response.blob();
        if (!blob.size || blob.size > 65536) return '';
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // Chromium labels favicon responses image/bmp; validate the PNG signature instead.
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return '';
        return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
      } catch { return ''; }
    })());
    return cache.get(page);
  };
}
