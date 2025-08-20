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

function bytesToBase64(bytes) {
  var binary = "";
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function colorToHex(c) {
  if (!c) return "";
  var r = Math.round((c.r || 0) * 255);
  var g = Math.round((c.g || 0) * 255);
  var b = Math.round((c.b || 0) * 255);
  var to2 = function (n) { var s = n.toString(16); return s.length === 1 ? "0" + s : s; };
  return "#" + to2(r) + to2(g) + to2(b);
}

function paintToSpec(p) {
  if (!p) return "";
  if (p.type === "SOLID") {
    var hex = colorToHex(p.color);
    var a = (p.opacity != null ? p.opacity : 1);
    return "Solid " + hex + " (opacity " + a + ")";
  }
  if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL" || p.type === "GRADIENT_ANGULAR" || p.type === "GRADIENT_DIAMOND") {
    var stops = (p.gradientStops || []).map(function (s) { return colorToHex(s.color) + "@" + (s.position != null ? s.position : 0); }).join(", ");
    return (p.type.replace("GRADIENT_", "Gradient ") + ": " + stops);
  }
  if (p.type === "IMAGE") {
    return "Image paint";
  }
  return p.type || "Unknown";
}

function paintsToSpec(paints) {
  if (!Array.isArray(paints) || !paints.length) return "none";
  return paints.map(paintToSpec).join("; ");
}

function effectsToSpec(effects) {
  if (!Array.isArray(effects) || !effects.length) return "none";
  return effects.map(function (e) {
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      var c = colorToHex(e.color);
      var a = (e.color && e.color.a != null ? e.color.a : 1);
      return (e.type + " x:" + (e.offset && e.offset.x || 0) + " y:" + (e.offset && e.offset.y || 0) + " blur:" + (e.radius || 0) + " spread:" + (e.spread || 0) + " color:" + c + " a:" + a);
    }
    if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
      return (e.type + " radius:" + (e.radius || 0));
    }
    return e.type;
  }).join("; ");
}

function getStyleName(id) {
  try { if (id && id !== "") { var s = figma.getStyleById(id); return s ? s.name : ""; } } catch (e) {}
  return "";
}

function slugifyTitle(t) {
  if (!t) return "component";
  return String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-");
}

function bool(v) { return v ? "true" : "false"; }

async function collectDetails(node) {
  var details = {
    identity: {},
    variants: {},
    componentProps: [],
    variables: [],
    styles: {},
    layout: {},
    visual: {},
    typography: [],
    prototype: [],
    grids: [],
    exports: [],
    previewDataURI: ""
  };

  // Identity & links
  details.identity.type = node.type;
  details.identity.id = node.id;
  details.identity.key = node.key || "";
  details.identity.fileKey = figma.fileKey || "";
  details.identity.webUrl = (figma.fileKey ? ("https://www.figma.com/file/" + figma.fileKey + "?node-id=" + node.id.replace(":", "-")) : "");

  // Variant info
  try {
    if (node.type === "COMPONENT_SET") {
      details.variants.groups = node.variantGroupProperties || {};
      details.componentProps = Object.values(node.componentPropertyDefinitions || {});
    }
    if (node.type === "COMPONENT") {
      details.variants.of = node.variantProperties || null;
    }
  } catch (e) {}

  // Variables (bound variables on component root)
  try {
    if (node.boundVariables) {
      var bv = node.boundVariables;
      Object.keys(bv).forEach(function (prop) {
        var entries = bv[prop];
        if (!entries) return;
        Object.keys(entries).forEach(function (k) {
          var varId = entries[k];
          var name = "";
          var collectionName = "";
          try {
            if (figma.variables && typeof figma.variables.getVariableById === "function") {
              var v = figma.variables.getVariableById(varId);
              if (v) {
                name = v.name || "";
                try {
                  var coll = figma.variables.getVariableCollectionById(v.variableCollectionId);
                  if (coll) collectionName = coll.name || "";
                } catch (e) {}
              }
            }
          } catch (e) {}
          details.variables.push({ property: prop, channel: k, variableId: varId, name: name, collection: collectionName });
        });
      });
    }
  } catch (e) {}

  // Linked styles & resolved paints/effects
  try {
    details.styles = {
      fillStyle: getStyleName(node.fillStyleId),
      strokeStyle: getStyleName(node.strokeStyleId),
      textStyle: getStyleName(node.textStyleId),
      effectStyle: getStyleName(node.effectStyleId),
      gridStyle: getStyleName(node.gridStyleId)
    };
  } catch (e) {}

  try {
    details.visual = {
      fills: paintsToSpec(node.fills),
      strokes: paintsToSpec(node.strokes),
      strokeWeight: node.strokeWeight || 0,
      strokeAlign: node.strokeAlign || "",
      dashPattern: Array.isArray(node.dashPattern) ? node.dashPattern.join(",") : "",
      corners: (node.cornerRadius != null ? node.cornerRadius : "mixed"),
      cornerTL: node.topLeftRadius, cornerTR: node.topRightRadius, cornerBR: node.bottomRightRadius, cornerBL: node.bottomLeftRadius,
      opacity: (node.opacity != null ? node.opacity : 1),
      blendMode: node.blendMode || "",
      effects: effectsToSpec(node.effects)
    };
  } catch (e) {}

  // Auto layout / sizing
  try {
    details.layout = {
      layoutMode: node.layoutMode || "",
      layoutWrap: node.layoutWrap || "",
      primaryAxisSizingMode: node.primaryAxisSizingMode || "",
      counterAxisSizingMode: node.counterAxisSizingMode || "",
      primaryAxisAlignItems: node.primaryAxisAlignItems || "",
      counterAxisAlignItems: node.counterAxisAlignItems || "",
      paddingTop: node.paddingTop || 0,
      paddingRight: node.paddingRight || 0,
      paddingBottom: node.paddingBottom || 0,
      paddingLeft: node.paddingLeft || 0,
      itemSpacing: node.itemSpacing || 0,
      counterAxisSpacing: node.counterAxisSpacing || 0,
      width: node.width || 0,
      height: node.height || 0,
      rotation: node.rotation || 0
    };
  } catch (e) {}

  // Typography: collect direct child text nodes (keep it light to avoid deep recursion)
  try {
    if (typeof node.findAll === "function") {
      var texts = node.findAll(function (n) { return n.type === "TEXT" && n.parent === node; });
      details.typography = texts.slice(0, 12).map(function (t) {
        var fontName = t.fontName && typeof t.fontName === 'object' ? (t.fontName.family + " / " + t.fontName.style) : String(t.fontName || "");
        var lineHt = t.lineHeight && typeof t.lineHeight === 'object' ? (t.lineHeight.value + (t.lineHeight.unit ? t.lineHeight.unit : "")) : String(t.lineHeight || "");
        var letterSp = t.letterSpacing && typeof t.letterSpacing === 'object' ? (t.letterSpacing.value + (t.letterSpacing.unit ? t.letterSpacing.unit : "")) : String(t.letterSpacing || "");
        return {
          name: t.name || "text",
          characters: (t.characters || "").slice(0, 140),
          font: fontName,
          fontSize: t.fontSize,
          lineHeight: lineHt,
          letterSpacing: letterSp,
          textCase: t.textCase,
          textDecoration: t.textDecoration,
          textAlignHorizontal: t.textAlignHorizontal,
          textAlignVertical: t.textAlignVertical,
          textStyle: getStyleName(t.textStyleId)
        };
      });
    }
  } catch (e) {}

  // Prototype interactions
  try {
    if (Array.isArray(node.reactions) && node.reactions.length) {
      details.prototype = node.reactions.map(function (r) {
        return {
          trigger: r.trigger && r.trigger.type || "",
          action: r.action && r.action.type || "",
          destinationId: r.action && r.action.destinationId || "",
          navigation: r.action && r.action.navigation || "",
          transition: r.action && r.action.transition && r.action.transition.type || ""
        };
      });
    }
  } catch (e) {}

  // Grids
  try {
    if (Array.isArray(node.layoutGrids) && node.layoutGrids.length) {
      details.grids = node.layoutGrids.map(function (g) {
        return { type: g.pattern || g.layoutGrids || g.type || "GRID", count: g.count, size: g.sectionSize || g.size, gutter: g.gutterSize, alignment: g.alignment, color: (g.color ? colorToHex(g.color) : "") };
      });
    }
  } catch (e) {}

  // Export presets
  try {
    if (Array.isArray(node.exportSettings) && node.exportSettings.length) {
      details.exports = node.exportSettings.map(function (es) {
        var fmt = es.format || (es.type || "");
        var scale = (es.constraint && es.constraint.value) || es.scale || "";
        return { format: fmt, scale: scale, suffix: es.suffix || "" };
      });
    }
  } catch (e) {}

  // Preview image (PNG @2x) with fallbacks
  async function exportNodePreview(n) {
    try {
      var bytes = await n.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 }, useAbsoluteBounds: true });
      return "data:image/png;base64," + bytesToBase64(bytes);
    } catch (err) {
      console.warn("exportAsync failed for node", n.id, n.type, err);
      return "";
    }
  }

  // 1) Try exporting the node itself
  var preview = await exportNodePreview(node);

  // 2) If empty and this is a Component Set, try the first visible Component child
  if (!preview && node.type === "COMPONENT_SET" && Array.isArray(node.children)) {
    for (var ci = 0; ci < node.children.length; ci++) {
      var child = node.children[ci];
      if (child && child.type === "COMPONENT" && isVisibleByConvention(child.name)) {
        preview = await exportNodePreview(child);
        if (preview) break;
      }
    }
  }

  // 3) If still empty and this is a Component, try exporting a shallow clone inside a temporary Frame (for absolute bounds issues)
  if (!preview && node.type === "COMPONENT") {
    try {
      var temp = figma.createFrame();
      temp.name = "__tmp_export__";
      temp.opacity = 0.0001; // invisible helper
      temp.clipsContent = false;
      var clone = node.clone();
      temp.appendChild(clone);
      // Position clone at (0,0) to avoid off-canvas transforms
      clone.x = 0; clone.y = 0;
      preview = await exportNodePreview(temp);
      temp.remove();
    } catch (err2) {
      console.warn("fallback frame export failed", err2);
    }
  }

  details.previewDataURI = preview || "";

  return details;
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
  var d = comp.details || {};
  var lines = [];

  // Title
  lines.push("# " + comp.name);
  lines.push("");

  // Preview (only if present)
  if (d.previewDataURI && d.previewDataURI.length > 32) {
    lines.push("![Preview](" + d.previewDataURI + ")");
    lines.push("");
  }

  // Description
  if (comp.description && comp.description.trim().length) {
    lines.push(comp.description.trim());
    lines.push("");
  }

  // Identity
  lines.push("## Identity");
  lines.push("");
  var typeLabel = (d.identity && d.identity.type) || comp.kind || "";
  if (typeLabel) lines.push("- Type: " + typeLabel);
  if (comp.page) lines.push("- Page: " + comp.page);
  if (comp.id) lines.push("- Node ID: `" + comp.id + "`");
  if (comp.key) lines.push("- Key: `" + comp.key + "`");
  if (d.identity && d.identity.webUrl) lines.push("- Link: " + d.identity.webUrl);
  lines.push("");

  // Variants & Properties
  var hasVariantOf = d.variants && d.variants.of && Object.keys(d.variants.of).length;
  var hasVariantGroups = d.variants && d.variants.groups && Object.keys(d.variants.groups).length;
  var props = Array.isArray(d.componentProps) ? d.componentProps.filter(function(p){ return p && p.name; }) : [];
  if (hasVariantOf || hasVariantGroups || props.length) {
    lines.push("## Variants & Properties");
    lines.push("");
    if (hasVariantOf) {
      var vpairs = Object.keys(d.variants.of).map(function(k){ return k + "=" + d.variants.of[k]; }).join(", ");
      lines.push("- Variant: " + (vpairs || "—"));
    }
    if (hasVariantGroups) {
      lines.push("- Variant Groups:");
      Object.keys(d.variants.groups).forEach(function (g) {
        var v = d.variants.groups[g];
        var opts = (v && (v.values || v.options || v)) || [];
        if (Array.isArray(opts)) lines.push("  - " + g + ": " + opts.join(", "));
        else lines.push("  - " + g + ": " + JSON.stringify(opts));
      });
    }
    if (props.length) {
      lines.push("");
      lines.push("| Property | Type | Default |");
      lines.push("|---|---|---|");
      props.forEach(function (p) {
        var typ = p.type || "";
        var def = (p.defaultValue != null ? String(p.defaultValue) : "");
        lines.push("| `" + p.name + "` | " + typ + " | " + def + " |");
      });
      lines.push("");
    }
  }

  // Tokens & Styles
  var varsArr = Array.isArray(d.variables) ? d.variables.filter(function(v){ return v && (v.name || v.variableId); }) : [];
  var linked = d.styles || {};
  var anyLinked = linked.fillStyle || linked.textStyle || linked.strokeStyle || linked.effectStyle || linked.gridStyle;
  if (varsArr.length || anyLinked) {
    lines.push("## Tokens & Styles");
    lines.push("");
    if (varsArr.length) {
      lines.push("| Binding | Variable | Collection |");
      lines.push("|---|---|---|");
      varsArr.forEach(function (v) {
        var binding = (v.property ? v.property : "") + (v.channel ? ("." + v.channel) : "");
        var varName = v.name || v.variableId || "";
        var coll = v.collection || "";
        lines.push("| " + binding + " | " + varName + " | " + coll + " |");
      });
      lines.push("");
    }
    if (anyLinked) {
      lines.push("- Linked Styles:");
      if (linked.fillStyle) lines.push("  - Fill: " + linked.fillStyle);
      if (linked.textStyle) lines.push("  - Text: " + linked.textStyle);
      if (linked.strokeStyle) lines.push("  - Stroke: " + linked.strokeStyle);
      if (linked.effectStyle) lines.push("  - Effects: " + linked.effectStyle);
      if (linked.gridStyle) lines.push("  - Grid: " + linked.gridStyle);
      lines.push("");
    }
  }

  // Auto Layout & Sizing (only if something is set)
  var hasLayout = d.layout && (d.layout.layoutMode || d.layout.primaryAxisSizingMode || d.layout.counterAxisSizingMode || d.layout.width || d.layout.height);
  if (hasLayout) {
    lines.push("## Auto Layout & Sizing");
    lines.push("");
    if (d.layout.layoutMode) lines.push("- Direction: " + d.layout.layoutMode);
    if (d.layout.layoutWrap) lines.push("- Wrap: " + d.layout.layoutWrap);
    if (d.layout.primaryAxisSizingMode || d.layout.counterAxisSizingMode) lines.push("- Sizing: width=" + (d.layout.primaryAxisSizingMode || "") + ", height=" + (d.layout.counterAxisSizingMode || ""));
    lines.push("- Padding: " + [d.layout.paddingTop || 0, d.layout.paddingRight || 0, d.layout.paddingBottom || 0, d.layout.paddingLeft || 0].join(" / "));
    lines.push("- Item spacing: " + (d.layout.itemSpacing || 0) + "; Counter-axis spacing: " + (d.layout.counterAxisSpacing || 0));
    if (d.layout.primaryAxisAlignItems || d.layout.counterAxisAlignItems) lines.push("- Align: " + (d.layout.primaryAxisAlignItems || "") + " / " + (d.layout.counterAxisAlignItems || ""));
    if (d.layout.width || d.layout.height) lines.push("- Size: " + (d.layout.width || 0) + "×" + (d.layout.height || 0) + (d.layout.rotation ? "; Rotation: " + d.layout.rotation : ""));
    lines.push("");
  }

  // Visual (skip if totally empty)
  var hasVisual = d.visual && (d.visual.fills || d.visual.strokes || d.visual.effects);
  if (hasVisual) {
    lines.push("## Visual");
    lines.push("");
    if (d.visual.fills) lines.push("- Fills: " + d.visual.fills);
    if (d.visual.strokes) lines.push("- Strokes: " + d.visual.strokes + (d.visual.strokeWeight ? "; weight: " + d.visual.strokeWeight : "") + (d.visual.strokeAlign ? "; align: " + d.visual.strokeAlign : ""));
    if (d.visual.dashPattern) lines.push("- Dashes: " + d.visual.dashPattern);
    if (d.visual.corners != null) lines.push("- Corners: " + d.visual.corners + " (TL/TR/BR/BL " + [d.visual.cornerTL, d.visual.cornerTR, d.visual.cornerBR, d.visual.cornerBL].join("/") + ")");
    if (d.visual.opacity != null || d.visual.blendMode) lines.push("- Opacity: " + (d.visual.opacity != null ? d.visual.opacity : "") + (d.visual.blendMode ? "; Blend: " + d.visual.blendMode : ""));
    if (d.visual.effects) lines.push("- Effects: " + d.visual.effects);
    lines.push("");
  }

  // Typography (key texts)
  if (Array.isArray(d.typography) && d.typography.length) {
    lines.push("## Typography (key texts)");
    lines.push("");
    lines.push("| Node | Font | Size | Line Height | Letter Spacing | Style |");
    lines.push("|---|---|---:|---:|---:|---|");
    d.typography.forEach(function (t) {
      lines.push("| " + (t.name || "text") + " | " + (t.font || "") + " | " + (t.fontSize || "") + " | " + (t.lineHeight || "") + " | " + (t.letterSpacing || "") + " | " + (t.textStyle || "") + " |");
    });
    lines.push("");
  }

  // Prototype
  if (Array.isArray(d.prototype) && d.prototype.length) {
    lines.push("## Prototype");
    lines.push("");
    d.prototype.forEach(function (pr) {
      lines.push("- " + (pr.trigger || "") + " → " + (pr.action || "") + (pr.destinationId ? (" (`" + pr.destinationId + "`)") : "") + (pr.transition ? (" · " + pr.transition) : ""));
    });
    lines.push("");
  }

  // Layout Grids
  if (Array.isArray(d.grids) && d.grids.length) {
    lines.push("## Layout Grids");
    lines.push("");
    d.grids.forEach(function (g) {
      lines.push("- " + (g.type || "GRID") + ": size " + (g.size || "") + ", count " + (g.count || "") + ", gutter " + (g.gutter || "") + ", align " + (g.alignment || "") + (g.color ? (" · color " + g.color) : ""));
    });
    lines.push("");
  }

  // Export Presets
  if (Array.isArray(d.exports) && d.exports.length) {
    lines.push("## Export Presets");
    lines.push("");
    d.exports.forEach(function (e) {
      lines.push("- " + (e.format || "") + (e.scale ? (" @" + e.scale + "x") : "") + (e.suffix ? (" · suffix '" + e.suffix + "'") : ""));
    });
    lines.push("");
  }

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
    } else {
      lines.push("## " + n.name);
    }
    lines.push("");
    // Embed the rich single-entry markdown (without the leading H1) by calling toMarkdownSingle and stripping first heading line
    var md = toMarkdownSingle(n) || "";
    var parts = md.split("\n");
    // remove first line (H1) if present
    if (parts.length && parts[0].startsWith("# ")) parts.shift();
    lines.push(parts.join("\n"));
    lines.push("");
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
      async function buildItem(n) {
        var pageName = getPageName(n);
        var base = {
          kind: (n.type === "COMPONENT_SET" ? "set" : "component"),
          id: n.id,
          key: n.key || "",
          name: n.name,
          page: pageName,
          description: normalize(n.description || "")
        };
        base.details = await collectDetails(n);
        return base;
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
        var enriched = await buildItem(node);
        items.push(enriched);
        // yield to keep UI responsive
        await new Promise(function(res){ setTimeout(res, 0); });
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
