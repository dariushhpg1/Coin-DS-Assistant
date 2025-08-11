// DSDoc — code.js (no spreads, no auto-refresh, manual Scan only)

function isComponentLike(n) {
  return n.type === "COMPONENT" || n.type === "COMPONENT_SET";
}

function getPageName(node) {
  var p = node.parent;
  while (p && p.type !== "PAGE") p = p.parent;
  return p && p.type === "PAGE" ? p.name : "";
}

function normalize(s) {
  if (!s) return "";
  return String(s).replace(/\r\n/g, "\n").replace(/\u0000/g, "");
}

// Only include "published" components by naming convention: ignore names starting with "." or "_"
function isVisibleByConvention(name) {
  if (!name) return false;
  var n = String(name).trim();
  return !(n[0] === "." || n[0] === "_");
}

// Async, page-by-page scanner that avoids reading descriptions during scan and yields between pages to keep Figma responsive.
async function collectComponents() {
  // Scan page-by-page and yield to the event loop to avoid freezing.
  var pages = figma.root.children.filter(function(n){ return n.type === "PAGE"; });
  var out = [];

  for (var p = 0; p < pages.length; p++) {
    var page = pages[p];

    // Use the criteria-based API to avoid scanning unrelated node types.
    var nodes = [];
    if (typeof page.findAllWithCriteria === "function") {
      nodes = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
    } else {
      nodes = page.findAll(isComponentLike);
    }

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];

      if (n.type === "COMPONENT_SET") {
        if (!isVisibleByConvention(n.name)) { continue; }
        out.push({
          kind: "set",
          id: n.id,
          key: n.key || "",
          name: n.name,
          page: page.name,
          // skip description during scan to reduce payload/serialization cost
          description: ""
        });
      } else if (n.type === "COMPONENT") {
        // Skip variants: if a component's parent is a Component Set, treat the set as the single result
        if (n.parent && n.parent.type === "COMPONENT_SET") { continue; }
        if (!isVisibleByConvention(n.name)) { continue; }
        out.push({
          kind: "component",
          id: n.id,
          key: n.key || "",
          name: n.name,
          page: page.name,
          description: ""
        });
      }
    }

    // Yield back to keep UI responsive
    await new Promise(function(res){ setTimeout(res, 0); });
  }

  // Sort by name for stable UI
  out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return out;
}

function toMarkdownSingle(comp) {
  var lines = [];
  lines.push("# " + comp.name);
  lines.push("");
  if (comp.description && comp.description.trim().length) {
    lines.push(comp.description.trim());
    lines.push("");
  } else {
    lines.push("_No description_");
    lines.push("");
  }
  lines.push("---");
  lines.push("- Page: " + (comp.page || "-"));
  lines.push("- Node ID: `" + comp.id + "`");
  if (comp.key) lines.push("- Key: `" + comp.key + "`");
  lines.push("");
  return lines.join("\n");
}

function toMarkdownCombined(list) {
  var lines = [];
  lines.push("# Component Documentation");
  lines.push("");
  for (var i = 0; i < list.length; i++) {
    var n = list[i];
    if (n.kind === "set") {
      lines.push("## " + n.name + " (Component Set)");
      lines.push((n.description && n.description.trim()) || "_No description_");
      lines.push("");
      lines.push("- Page: " + (n.page || "-"));
      lines.push("- Node ID: `" + n.id + "`");
      if (n.key) lines.push("- Key: `" + n.key + "`");
      lines.push("");
    } else {
      lines.push("## " + n.name);
      lines.push((n.description && n.description.trim()) || "_No description_");
      lines.push("");
      lines.push("- Page: " + (n.page || "-"));
      lines.push("- Node ID: `" + n.id + "`");
      if (n.key) lines.push("- Key: `" + n.key + "`");
      lines.push("");
    }
  }
  return lines.join("\n");
}

figma.showUI(__html__, { width: 640, height: 640 });

figma.ui.onmessage = function (msg) {
  if (!msg || !msg.type) return;

  if (msg.type === "scan") {
    (async function () {
      try {
        if (typeof figma.loadAllPagesAsync === "function") {
          await figma.loadAllPagesAsync();
        }
      } catch (e) {
        // Non-fatal; continue
        console.warn("loadAllPagesAsync failed/unsupported:", e);
      }

      try {
        var list = await collectComponents();
        figma.ui.postMessage({ type: "scan-result", payload: { components: list } });
      } catch (err) {
        console.error("Scan failed:", err);
        figma.ui.postMessage({ type: "scan-result", payload: { components: [] } });
      }
    })();
  }

  if (msg.type === "sync") {
    (async function () {
      var selectedIds = (msg.payload && msg.payload.selectedIds) || [];
      var mode = (msg.payload && msg.payload.mode) || "multi";

      // Resolve only selected nodes and read their descriptions lazily
      function buildItem(n) {
        var pageName = getPageName(n);
        if (n.type === "COMPONENT_SET") {
          return {
            kind: "set",
            id: n.id,
            key: n.key || "",
            name: n.name,
            page: pageName,
            description: normalize(n.description || "")
          };
        } else {
          return {
            kind: "component",
            id: n.id,
            key: n.key || "",
            name: n.name,
            page: pageName,
            description: normalize(n.description || "")
          };
        }
      }

      var items = [];
      var seen = {}; // id -> true (to dedupe when multiple variants map to the same set)
      for (var i = 0; i < selectedIds.length; i++) {
        var node = await figma.getNodeByIdAsync(selectedIds[i]);
        if (!node) continue;
        // If a selected node is a variant (component under a set), consolidate to its parent set
        if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
          node = node.parent;
        }
        if (!isVisibleByConvention(node.name)) continue;
        if (seen[node.id]) continue;
        seen[node.id] = true;
        items.push(buildItem(node));
      }

      // Build files
      var files = [];
      if (mode === "combined") {
        var combined = toMarkdownCombined(items);
        files.push({ filename: "components.md", content: combined });
      } else {
        for (var s = 0; s < items.length; s++) {
          var item = items[s];
          var safeName = (item.name || "component").replace(/[\\\/:*?"<>|]+/g, "_").slice(0, 120);
          var md = toMarkdownSingle(item);
          files.push({ filename: safeName + ".md", content: md });
        }
      }

      figma.ui.postMessage({ type: "files-ready", payload: { files: files, mode: mode } });
    })();
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};
