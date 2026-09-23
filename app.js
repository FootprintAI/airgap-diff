// Airgap Diff — all comparison runs in this tab. Nothing here ever calls fetch/XHR/WebSocket;
// the only network activity the whole page makes is the initial load of its own files and the
// Google Fonts stylesheet in index.html. Diffing is done by the vendored copy of jsdiff
// (vendor/diff.min.js, BSD-3-Clause, see vendor/LICENSE-jsdiff.txt) — no CDN at runtime.
(function () {
  "use strict";

  const CONTEXT_LINES = 3;

  const state = {
    granularity: "line",
    layout: "split",
    ignoreWhitespace: false,
    ignoreCase: false,
    hideUnchanged: true,
  };

  const el = {
    leftText: document.getElementById("left-text"),
    rightText: document.getElementById("right-text"),
    leftOpen: document.getElementById("left-open"),
    rightOpen: document.getElementById("right-open"),
    leftFile: document.getElementById("left-file"),
    rightFile: document.getElementById("right-file"),
    leftFileName: document.getElementById("left-file-name"),
    rightFileName: document.getElementById("right-file-name"),
    inputView: document.getElementById("input-view"),
    controls: document.querySelector(".controls"),
    layoutGroup: document.getElementById("layout-group"),
    result: document.getElementById("result"),
    summary: document.getElementById("summary"),
    diffViewport: document.getElementById("diff-viewport"),
    compareBtn: document.getElementById("compare-btn"),
    backBtn: document.getElementById("back-btn"),
    copyBtn: document.getElementById("copy-btn"),
    ignoreWhitespace: document.getElementById("ignore-whitespace"),
    ignoreCase: document.getElementById("ignore-case"),
    hideUnchanged: document.getElementById("hide-unchanged"),
  };

  let lastDiffText = ""; // plain-text rendering, filled on compare, used by "Copy diff"

  // ---------------------------------------------------------------- wiring

  document.querySelectorAll(".seg[data-granularity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.granularity = btn.dataset.granularity;
      document.querySelectorAll(".seg[data-granularity]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      el.layoutGroup.style.opacity = state.granularity === "line" ? "1" : "0.45";
      el.layoutGroup.querySelectorAll("button").forEach((b) => (b.disabled = state.granularity !== "line"));
    });
  });

  document.querySelectorAll(".seg[data-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.layout = btn.dataset.layout;
      document.querySelectorAll(".seg[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    });
  });

  el.ignoreWhitespace.addEventListener("change", () => (state.ignoreWhitespace = el.ignoreWhitespace.checked));
  el.ignoreCase.addEventListener("change", () => (state.ignoreCase = el.ignoreCase.checked));
  el.hideUnchanged.addEventListener("change", () => (state.hideUnchanged = el.hideUnchanged.checked));

  function wireFileOpen(openBtn, fileInput, textarea, nameEl) {
    openBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        textarea.value = String(reader.result);
        nameEl.textContent = file.name;
        nameEl.hidden = false;
      };
      reader.readAsText(file);
    });
  }
  wireFileOpen(el.leftOpen, el.leftFile, el.leftText, el.leftFileName);
  wireFileOpen(el.rightOpen, el.rightFile, el.rightText, el.rightFileName);

  el.compareBtn.addEventListener("click", runCompare);
  el.backBtn.addEventListener("click", () => {
    el.result.hidden = true;
    el.inputView.hidden = false;
    el.controls.hidden = false;
  });
  el.copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastDiffText);
      el.copyBtn.textContent = "Copied";
      setTimeout(() => (el.copyBtn.textContent = "Copy diff"), 1200);
    } catch (err) {
      el.copyBtn.textContent = "Copy failed";
      setTimeout(() => (el.copyBtn.textContent = "Copy diff"), 1200);
    }
  });

  // ---------------------------------------------------------------- compare

  function runCompare() {
    const left = el.leftText.value;
    const right = el.rightText.value;

    el.inputView.hidden = true;
    el.controls.hidden = true;
    el.result.hidden = false;
    el.diffViewport.innerHTML = "";

    if (state.granularity === "line") {
      renderLineDiff(left, right);
    } else {
      renderInlineDiff(left, right, state.granularity);
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------- line diff (split + unified)

  function renderLineDiff(left, right) {
    const parts = Diff.diffLines(left, right, {
      ignoreWhitespace: state.ignoreWhitespace,
      ignoreCase: state.ignoreCase,
    });

    // Turn jsdiff's part list into row objects, pairing an immediately-adjacent
    // removed+added run of lines so a "changed" line shows on the same row.
    const rows = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const lines = splitLines(part.value);
      if (!part.added && !part.removed) {
        for (const line of lines) rows.push({ type: "same", left: line, right: line });
        continue;
      }
      if (part.removed && parts[i + 1] && parts[i + 1].added) {
        const addedLines = splitLines(parts[i + 1].value);
        const max = Math.max(lines.length, addedLines.length);
        for (let j = 0; j < max; j++) {
          rows.push({
            type: "change",
            left: j < lines.length ? lines[j] : null,
            right: j < addedLines.length ? addedLines[j] : null,
          });
        }
        i++; // consumed the paired added part
        continue;
      }
      if (part.removed) {
        for (const line of lines) rows.push({ type: "del", left: line, right: null });
        continue;
      }
      // part.added, unpaired
      for (const line of lines) rows.push({ type: "add", left: null, right: line });
    }

    let added = 0, removed = 0;
    for (const r of rows) {
      if (r.type === "add" || (r.type === "change" && r.right !== null && r.left === null)) added++;
      if (r.type === "del" || (r.type === "change" && r.left !== null && r.right === null)) removed++;
      if (r.type === "change" && r.left !== null && r.right !== null) {
        added++;
        removed++;
      }
    }

    renderSummary(added, removed, "line");
    lastDiffText = rowsToPlainText(rows);

    if (rows.every((r) => r.type === "same")) {
      el.diffViewport.innerHTML = '<div class="empty-state">No differences.</div>';
      return;
    }

    if (state.layout === "split") {
      el.diffViewport.appendChild(buildSplitTable(rows));
    } else {
      el.diffViewport.appendChild(buildUnified(rows));
    }
  }

  function splitLines(value) {
    // jsdiff keeps the trailing newline on each line; split into individual display lines,
    // dropping one trailing empty line caused by a final \n so a diff doesn't show a phantom
    // blank row at end of file.
    if (value === "") return [];
    const lines = value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function buildSplitTable(rows) {
    const wrap = document.createElement("table");
    wrap.className = "split-table";
    let ln = { left: 1, right: 1 };
    const collapsible = markCollapsible(rows);

    let i = 0;
    while (i < collapsible.length) {
      const item = collapsible[i];
      if (item.collapsed) {
        // Line numbers for this block must be fixed NOW, as its own private copy: `ln` keeps
        // mutating for every row rendered after this point, so a click handler that closed over
        // the shared counter would render this block with numbers from wherever the document had
        // reached by click time, not where this block actually starts.
        const blockLn = { left: ln.left, right: ln.right };
        wrap.appendChild(collapseRow(item.rows.length, () => {
          const frag = document.createDocumentFragment();
          for (const r of item.rows) frag.appendChild(splitRow(r, blockLn));
          wrap.replaceChild(frag, placeholder);
        }));
        const placeholder = wrap.lastElementChild;
        // advance the real counter as if the hidden rows had been rendered, so numbers after
        // the collapsed block stay correct even before it is expanded
        for (const r of item.rows) advanceLineNumbers(r, ln);
        i++;
        continue;
      }
      wrap.appendChild(splitRow(item.row, ln));
      i++;
    }
    return wrap;
  }

  function advanceLineNumbers(row, ln) {
    if (row.left !== null) ln.left++;
    if (row.right !== null) ln.right++;
  }

  function splitRow(row, ln) {
    const tr = document.createElement("tr");
    tr.className = row.type === "change" ? "row-del row-add" : row.type === "add" ? "row-add" : row.type === "del" ? "row-del" : "";
    const leftNum = row.left !== null ? ln.left++ : "";
    const rightNum = row.right !== null ? ln.right++ : "";
    const [leftHtml, rightHtml] = lineCellHtml(row);
    tr.innerHTML =
      `<td class="ln">${leftNum}</td>` +
      `<td class="col-left${row.left === null ? " row-empty" : ""}">${leftHtml}</td>` +
      `<td class="ln">${rightNum}</td>` +
      `<td class="col-right${row.right === null ? " row-empty" : ""}">${rightHtml}</td>`;
    return tr;
  }

  // A "change" row (a line paired with its replacement, not a pure add or pure delete) gets a
  // character-level diff of its own two lines, so only the substring that actually changed is
  // highlighted -- the way GitHub's line diff does it -- instead of tinting the entire old and
  // new line as if nothing in them survived. Every other row type has no counterpart line to
  // diff against, so it just gets its text escaped as-is.
  function lineCellHtml(row) {
    if (row.type === "change" && row.left !== null && row.right !== null) {
      return charDiffHtml(row.left, row.right);
    }
    return [row.left !== null ? escapeHtml(row.left) : " ", row.right !== null ? escapeHtml(row.right) : " "];
  }

  function charDiffHtml(oldLine, newLine) {
    const parts = Diff.diffChars(oldLine, newLine);
    let left = "", right = "";
    for (const part of parts) {
      const text = escapeHtml(part.value);
      if (part.added) {
        right += `<span class="intraline-add">${text}</span>`;
      } else if (part.removed) {
        left += `<span class="intraline-del">${text}</span>`;
      } else {
        left += text;
        right += text;
      }
    }
    return [left, right];
  }

  function buildUnified(rows) {
    const wrap = document.createElement("div");
    wrap.className = "unified";
    let ln = { left: 1, right: 1 };
    const collapsible = markCollapsible(rows);

    for (const item of collapsible) {
      if (item.collapsed) {
        const blockLn = { left: ln.left, right: ln.right };
        const holder = document.createElement("div");
        holder.appendChild(collapseRow(item.rows.length, () => {
          const frag = document.createDocumentFragment();
          for (const r of item.rows) for (const node of unifiedLinesFor(r, blockLn)) frag.appendChild(node);
          holder.replaceWith(frag);
        }, true));
        for (const r of item.rows) advanceLineNumbers(r, ln);
        wrap.appendChild(holder);
        continue;
      }
      for (const node of unifiedLinesFor(item.row, ln)) wrap.appendChild(node);
    }
    return wrap;
  }

  function unifiedLinesFor(row, ln) {
    const nodes = [];
    if (row.type === "same") {
      nodes.push(unifiedLine(" ", escapeHtml(row.left), ln.left++, ln.right++));
      return nodes;
    }
    if (row.type === "change" && row.left !== null && row.right !== null) {
      const [leftHtml, rightHtml] = charDiffHtml(row.left, row.right);
      nodes.push(unifiedLine("-", leftHtml, ln.left++, null, "del"));
      nodes.push(unifiedLine("+", rightHtml, null, ln.right++, "add"));
      return nodes;
    }
    if (row.left !== null) nodes.push(unifiedLine("-", escapeHtml(row.left), ln.left++, null, "del"));
    if (row.right !== null) nodes.push(unifiedLine("+", escapeHtml(row.right), null, ln.right++, "add"));
    return nodes;
  }

  // `html` is pre-escaped (and, for a changed line, already carries its own intraline-add/del
  // spans) -- callers own escaping so a plain unchanged line and a character-diffed changed line
  // can share this one renderer without double-escaping the latter's markup.
  function unifiedLine(prefix, html, leftNum, rightNum, cls) {
    const div = document.createElement("div");
    div.className = "unified-line" + (cls ? " " + cls : "");
    div.innerHTML =
      `<span class="ln${leftNum ? "" : " blank"}">${leftNum || " "}</span>` +
      `<span class="ln${rightNum ? "" : " blank"}">${rightNum || " "}</span>` +
      `<span class="prefix">${prefix}</span>` +
      `<span>${html}</span>`;
    return div;
  }

  function collapseRow(count, onExpand, plain) {
    const row = plain ? document.createElement("div") : document.createElement("tr");
    row.className = "collapse-row";
    const label = `⋯ ${count} unchanged line${count === 1 ? "" : "s"} — click to show`;
    if (plain) {
      row.textContent = label;
      row.style.cursor = "pointer";
      row.style.padding = "6px 14px";
      row.style.color = "var(--text-faint)";
      row.style.fontStyle = "italic";
    } else {
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = label;
      row.appendChild(td);
    }
    row.addEventListener("click", onExpand, { once: true });
    return row;
  }

  function markCollapsible(rows) {
    if (!state.hideUnchanged) return rows.map((row) => ({ row }));
    const out = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].type !== "same") {
        out.push({ row: rows[i] });
        i++;
        continue;
      }
      let j = i;
      while (j < rows.length && rows[j].type === "same") j++;
      const runLength = j - i;
      const isFirst = i === 0;
      const isLast = j === rows.length;
      const headKeep = isFirst ? 0 : CONTEXT_LINES;
      const tailKeep = isLast ? 0 : CONTEXT_LINES;
      if (runLength <= headKeep + tailKeep + 1) {
        for (let k = i; k < j; k++) out.push({ row: rows[k] });
      } else {
        for (let k = i; k < i + headKeep; k++) out.push({ row: rows[k] });
        out.push({ collapsed: true, rows: rows.slice(i + headKeep, j - tailKeep) });
        for (let k = j - tailKeep; k < j; k++) out.push({ row: rows[k] });
      }
      i = j;
    }
    return out;
  }

  function rowsToPlainText(rows) {
    const lines = [];
    for (const r of rows) {
      if (r.type === "same") {
        lines.push("  " + r.left);
        continue;
      }
      if (r.left !== null) lines.push("- " + r.left);
      if (r.right !== null) lines.push("+ " + r.right);
    }
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- word / char diff

  function renderInlineDiff(left, right, granularity) {
    const options = { ignoreCase: state.ignoreCase };
    const parts =
      granularity === "word"
        ? Diff.diffWordsWithSpace(left, right, options)
        : Diff.diffChars(left, right, options);

    let added = 0, removed = 0;
    const html = [];
    const plain = [];
    for (const part of parts) {
      const text = escapeHtml(part.value);
      if (part.added) {
        added += granularity === "word" ? countWords(part.value) : part.value.length;
        html.push(`<${granularity === "word" ? "ins" : "span"} class="${granularity}-add">${text}</${granularity === "word" ? "ins" : "span"}>`);
        plain.push(`{+${part.value}+}`);
      } else if (part.removed) {
        removed += granularity === "word" ? countWords(part.value) : part.value.length;
        html.push(`<${granularity === "word" ? "del" : "span"} class="${granularity}-del">${text}</${granularity === "word" ? "del" : "span"}>`);
        plain.push(`[-${part.value}-]`);
      } else {
        html.push(text);
        plain.push(part.value);
      }
    }

    renderSummary(added, removed, granularity);
    lastDiffText = plain.join("");

    if (added + removed === 0) {
      el.diffViewport.innerHTML = '<div class="empty-state">No differences.</div>';
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "unified-block";
    wrap.innerHTML = html.join("");
    // preserve newlines/whitespace as typed
    wrap.style.whiteSpace = "pre-wrap";
    wrap.style.wordBreak = "break-word";
    el.diffViewport.appendChild(wrap);
  }

  function countWords(s) {
    const m = s.match(/\S+/g);
    return m ? m.length : 0;
  }

  function renderSummary(added, removed, granularity) {
    const unit = granularity === "line" ? "line" : granularity === "word" ? "word" : "character";
    const plural = (n) => (n === 1 ? unit : unit + "s");
    el.summary.innerHTML =
      `<span class="add-count">+${added} ${plural(added)} added</span>` +
      `<span class="del-count">-${removed} ${plural(removed)} removed</span>`;
  }
})();
