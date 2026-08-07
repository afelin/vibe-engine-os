#!/usr/bin/env node
/**
 * Build public white paper HTML and unify publish root.
 * - MD → site/whitepaper/index.html (from papers/vibe-engine-whitepaper.md)
 * - proof/ → site/proof/ (receipt viewer under the same Pages root)
 *
 * Zero npm deps — Node built-ins only. Safe when the manuscript is still landing:
 * missing MD writes a calm stub page so Pages deploy stays green.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MD_PATH = path.join(ROOT, "papers", "vibe-engine-whitepaper.md");
const OUT_DIR = path.join(ROOT, "site", "whitepaper");
const OUT_HTML = path.join(OUT_DIR, "index.html");
const PROOF_SRC = path.join(ROOT, "proof");
const PROOF_DST = path.join(ROOT, "site", "proof");

const FONT_LINKS = `  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/site.css" />`;

/** GitHub blob base for repo files linked from the paper (Pages has no docs/). */
const REPO_BLOB = "https://github.com/afelin/coreward/blob/main";

/** Site-local path segments under site/ — keep relative for project Pages. */
const SITE_LOCAL = /^(?:\.\.\/)?(?:css|adopt|status|legal|proof|whitepaper)(?:\/|$)/;

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Rewrite manuscript hrefs so project Pages does not 404 on ../docs etc.
 * Absolute / anchors / mailto / site-local paths are left alone.
 */
function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  if (SITE_LOCAL.test(href)) return href;
  if (href.startsWith("../")) {
    return `${REPO_BLOB}/${href.slice(3)}`;
  }
  if (/^(docs\/|papers\/|CITATION\.cff|VOWS\.md|README\.md)/.test(href)) {
    return `${REPO_BLOB}/${href}`;
  }
  return href;
}

function inlineFormat(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return `<a href="${rewriteHref(href)}">${label}</a>`;
  });
  return s;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSep(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTable(lines, start) {
  const rows = [];
  let i = start;
  while (i < lines.length && isTableRow(lines[i])) {
    if (!isTableSep(lines[i])) {
      const cells = lines[i]
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      rows.push(cells);
    }
    i += 1;
  }
  if (rows.length === 0) return { html: "", next: start + 1 };
  const [header, ...body] = rows;
  const thead = `<tr>${header.map((c) => `<th>${inlineFormat(c)}</th>`).join("")}</tr>`;
  const tbody = body
    .map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join("")}</tr>`)
    .join("\n");
  return {
    html: `<table>\n<thead>\n${thead}\n</thead>\n<tbody>\n${tbody}\n</tbody>\n</table>`,
    next: i,
  };
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let paragraph = [];

  const flushPara = () => {
    if (paragraph.length === 0) return;
    let html = inlineFormat(paragraph[0].text);
    for (let j = 1; j < paragraph.length; j++) {
      html += paragraph[j - 1].hardBreak ? "<br />\n" : " ";
      html += inlineFormat(paragraph[j].text);
    }
    out.push(`<p>${html}</p>`);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushPara();
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      flushPara();
      const { html, next } = parseTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushPara();
      out.push("<hr />");
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineFormat(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote><p>${inlineFormat(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      out.push("<ul>");
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        out.push(`<li>${inlineFormat(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push("</ul>");
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      out.push("<ol>");
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        out.push(`<li>${inlineFormat(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      out.push("</ol>");
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }

    paragraph.push({
      text: line.replace(/  $/, "").trimEnd(),
      hardBreak: /  $/.test(line),
    });
    i += 1;
  }
  flushPara();
  return out.join("\n");
}

function extractTitle(md) {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? m[1].trim() : "vibe-engine White Paper";
}

function wrapPage({ title, bodyHtml, notice }) {
  const noticeHtml = notice
    ? `<div class="note"><p>${escapeHtml(notice)}</p></div>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — vibe-engine</title>
  <meta name="description" content="vibe-engine white paper: portable open-source promotion primitives." />
${FONT_LINKS}
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="../">vibe-engine</a>
      <nav aria-label="Primary">
        <ul class="nav">
          <li><a href="./" aria-current="page">White paper</a></li>
          <li><a href="../adopt/">Adopt</a></li>
          <li><a href="../status/">Status</a></li>
          <li><a href="../proof/">Proof</a></li>
          <li><a href="../legal/">Legal</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main class="site-main">
${noticeHtml}    <article class="prose">
${bodyHtml}
    </article>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span><a href="../">vibe-engine</a></span>
      <span><a href="../legal/">Legal notices</a></span>
    </div>
  </footer>
</body>
</html>
`;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function buildWhitepaper() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(MD_PATH)) {
    // Content may land via a separate PR (papers/). Keep committed HTML so
    // Pages stays green; after that merge, this script regenerates from MD.
    if (fs.existsSync(OUT_HTML)) {
      console.log(
        `papers/vibe-engine-whitepaper.md missing — keeping existing ${path.relative(ROOT, OUT_HTML)} (build after content merges to refresh)`,
      );
      return;
    }
    const title = "vibe-engine White Paper";
    const body = `<h1>${title}</h1>
<p>Manuscript source <code>papers/vibe-engine-whitepaper.md</code> is not in this tree yet.</p>
<p>When that file lands, re-run <code>node scripts/build-whitepaper.mjs</code> (or the Pages workflow) to regenerate this page.</p>
<p>See <a href="https://github.com/afelin/coreward">the repository</a> and <a href="../adopt/">Adopt</a> for how to run the engine.</p>`;
    fs.writeFileSync(
      OUT_HTML,
      wrapPage({
        title,
        bodyHtml: body,
        notice:
          "Placeholder page — full white paper HTML is generated from papers/vibe-engine-whitepaper.md.",
      }),
      "utf8",
    );
    console.log(`wrote stub ${path.relative(ROOT, OUT_HTML)} (MD missing)`);
    return;
  }

  const md = fs.readFileSync(MD_PATH, "utf8");
  const title = extractTitle(md);
  const bodyHtml = mdToHtml(md);
  fs.writeFileSync(OUT_HTML, wrapPage({ title, bodyHtml, notice: null }), "utf8");
  console.log(`wrote ${path.relative(ROOT, OUT_HTML)} from papers/vibe-engine-whitepaper.md`);
}

function copyProof() {
  if (!fs.existsSync(PROOF_SRC)) {
    console.warn("proof/ missing — skip site/proof copy");
    return;
  }
  fs.rmSync(PROOF_DST, { recursive: true, force: true });
  copyDir(PROOF_SRC, PROOF_DST);
  console.log(`copied proof/ → ${path.relative(ROOT, PROOF_DST)}`);
}

buildWhitepaper();
copyProof();
console.log("build-whitepaper: ok");
