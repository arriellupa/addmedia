// «ייבוא מקובץ»: the text of a Word or PDF file, extracted on the device (mammoth / pdf.js) and pasted into the
// editor. The file never leaves the browser. Loaded only when a student imports, so the command center's bundle
// stays small; both libraries come from npm through Vite, no CDN.

export type Progress = (done: number, total: number) => void;

/** short, emphasised lines become `# ` headings */
function headingify(lines: { text: string; strong?: boolean }[]): string {
  const out: string[] = [];
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, " ").trim();
    if (!t) {
      if (out.at(-1) !== "") out.push("");
      continue;
    }
    const words = t.split(" ").length;
    const letters = t.replace(/[^\p{L}]/gu, "");
    const latin = letters.replace(/[^A-Za-z]/g, "");
    const caps = latin.length >= 4 && latin === latin.toUpperCase();
    const endsLikeSentence = /[.,;:!?]$/.test(t);
    const short = words <= 8 && t.length <= 60;
    if (short && !endsLikeSentence && (l.strong || caps || /^(פרק|חלק|נושא|שיעור|סעיף|יחידה)\s/.test(t))) out.push(`# ${t.replace(/^#+\s*/, "")}`);
    else out.push(t);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function importDocx(file: File, onProgress?: Progress): Promise<string> {
  onProgress?.(0, 1);
  const mammoth = await import("mammoth/mammoth.browser.js");
  const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const div = document.createElement("div");
  div.innerHTML = r.value;
  const lines: { text: string; strong?: boolean }[] = [];
  for (const el of Array.from(div.children)) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) lines.push({ text: el.textContent || "", strong: true });
    else if (tag === "ul" || tag === "ol") for (const li of Array.from(el.querySelectorAll("li"))) lines.push({ text: "• " + (li.textContent || "") });
    else if (tag === "table") for (const tr of Array.from(el.querySelectorAll("tr"))) lines.push({ text: Array.from(tr.querySelectorAll("td,th")).map((c) => c.textContent?.trim()).filter(Boolean).join(" | ") });
    else {
      const text = el.textContent || "";
      const strongText = Array.from(el.querySelectorAll("strong,b")).map((s) => s.textContent || "").join("");
      lines.push({ text, strong: text.trim().length > 0 && strongText.trim().length >= text.trim().length * 0.9 });
    }
    lines.push({ text: "" });
  }
  onProgress?.(1, 1);
  return headingify(lines);
}

export async function importPdf(file: File, onProgress?: Progress): Promise<string> {
  const [m, w] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  m.GlobalWorkerOptions.workerSrc = w.default;
  const doc = await m.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: { text: string; strong?: boolean }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items = (tc.items as any[]).filter((it) => typeof it.str === "string");
    // the usual font size on the page: a line clearly larger is a heading
    const sizes = items.map((it) => Math.abs(it.transform?.[3] || 0)).filter((x) => x > 0).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] || 0;
    let line = "";
    let lineSize = 0;
    let lastY: number | null = null;
    const flush = () => {
      if (line.trim()) lines.push({ text: line, strong: median > 0 && lineSize >= median * 1.25 });
      line = "";
      lineSize = 0;
    };
    for (const it of items) {
      const y = it.transform?.[5];
      const size = Math.abs(it.transform?.[3] || 0);
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) flush();
      line += it.str + (it.hasEOL ? " " : " ");
      lineSize = Math.max(lineSize, size);
      if (y !== undefined) lastY = y;
    }
    flush();
    lines.push({ text: "" });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  await doc.destroy();
  return headingify(lines);
}

export async function importFile(file: File, onProgress?: Progress): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return importDocx(file, onProgress);
  if (name.endsWith(".pdf") || file.type === "application/pdf") return importPdf(file, onProgress);
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return (await file.text()).trim();
  throw new Error("אפשר לייבא Word (.docx), PDF או טקסט.");
}
