/** Text of a PDF, page by page; pdf.js is loaded only when someone imports a PDF. */
export async function pdfText(data: ArrayBuffer): Promise<string> {
  // The legacy build runs on browsers a few versions old too (older iPhones and iPads).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      let page = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        page += item.str + (item.hasEOL ? '\n' : ' ');
      }
      pages.push(page.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim());
    }
    return pages.filter(Boolean).join('\n\n');
  } finally {
    await task.destroy();
  }
}
