import { collectKnownDatasetTags, normalizeDatasetTags, type TagFilterRule } from "../lib/dataset-tags";
import { appState, patchState } from "../state";

type ChipFilterMode = "neutral" | "include" | "exclude";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function tagLabelSpan(text: string, strikethrough = false): HTMLElement {
  const label = el("span", "tag-chip-label");
  if (strikethrough) label.style.textDecoration = "line-through";
  label.textContent = text;
  return label;
}

function filterRuleForTag(rules: TagFilterRule[], tag: string): TagFilterRule | undefined {
  const key = tag.toLowerCase();
  return rules.find((r) => r.tag.toLowerCase() === key);
}

function filterChipMode(rules: TagFilterRule[], tag: string): ChipFilterMode {
  const rule = filterRuleForTag(rules, tag);
  if (!rule) return "neutral";
  return rule.mode;
}

export function cycleFilterTagRule(tag: string): void {
  const rules = [...appState.filterTagRules];
  const key = tag.toLowerCase();
  const idx = rules.findIndex((r) => r.tag.toLowerCase() === key);
  if (idx < 0) {
    rules.push({ tag, mode: "include" });
  } else if (rules[idx]!.mode === "include") {
    rules[idx] = { tag: rules[idx]!.tag, mode: "exclude" };
  } else {
    rules.splice(idx, 1);
  }
  patchState({ filterTagRules: rules });
}

function buildFilterChip(tag: string, mode: ChipFilterMode): HTMLButtonElement {
  const chip = el("button", `tag-chip tag-chip--${mode}`);
  chip.type = "button";
  chip.title = "Klick: neutral → + enthalten → − nicht enthalten";
  if (mode === "include") {
    const pre = el("span", "tag-chip-prefix");
    pre.textContent = "+";
    chip.append(pre, tagLabelSpan(tag));
  } else if (mode === "exclude") {
    const pre = el("span", "tag-chip-prefix");
    pre.textContent = "−";
    chip.append(pre, tagLabelSpan(tag, true));
  } else {
    chip.textContent = tag;
  }
  chip.addEventListener("click", () => cycleFilterTagRule(tag));
  return chip;
}

export function renderSidebarTagFilter(parent: HTMLElement): void {
  const section = el("div", "tag-filter-section");
  const title = el("p", "tag-section-title");
  title.textContent = "Tags";
  section.append(title);

  const rules = appState.filterTagRules;
  const known = collectKnownDatasetTags(appState.scans);
  const tagSet = new Map<string, string>();
  for (const t of known) tagSet.set(t.toLowerCase(), t);
  for (const r of rules) {
    if (!tagSet.has(r.tag.toLowerCase())) tagSet.set(r.tag.toLowerCase(), r.tag);
  }
  const allTags = [...tagSet.values()].sort((a, b) => a.localeCompare(b, "de"));

  const cloud = el("div", "tag-cloud");
  for (const tag of allTags) {
    cloud.append(buildFilterChip(tag, filterChipMode(rules, tag)));
  }

  section.append(cloud);
  parent.append(section);
}

export function renderDatasetTagsField(
  parent: HTMLElement,
  tags: string[],
  onChange: (tags: string[]) => void,
): void {
  const wrap = el("div", "tag-field-wrap");
  parent.append(wrap);

  const apply = (next: string[]) => {
    const normalized = normalizeDatasetTags(next);
    paint(normalized);
    onChange(normalized);
  };

  const paint = (current: string[]) => {
    wrap.replaceChildren();
    const label = el("span");
    label.textContent = "Tags";
    label.style.fontSize = "0.85rem";
    wrap.append(label);

    const known = collectKnownDatasetTags(appState.scans);
    const activeKeys = new Set(current.map((t) => t.toLowerCase()));

    const assigned = el("div", "tag-cloud");
    for (const tag of current) {
      const chip = el("span", "tag-chip tag-chip--assigned");
      const text = el("span");
      text.textContent = tag;
      const remove = el("button", "tag-chip-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Tag ${tag} entfernen`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        apply(current.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
      });
      chip.append(text, remove);
      assigned.append(chip);
    }
    wrap.append(assigned);

    const suggestions = el("div", "tag-cloud tag-cloud--suggest");
    let suggestCount = 0;
    for (const k of known) {
      if (activeKeys.has(k.toLowerCase())) continue;
      suggestCount++;
      const chip = el("button", "tag-chip tag-chip--suggestion");
      chip.type = "button";
      chip.textContent = k;
      chip.addEventListener("click", () => {
        apply([...current, k]);
      });
      suggestions.append(chip);
    }
    if (suggestCount) wrap.append(suggestions);

    const addRow = el("div", "tag-add-row");
    const input = el("input", "tag-cloud-input field");
    input.placeholder = "Neuer Tag, Enter";
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      const add = normalizeDatasetTags(v.split(/[,;]/));
      apply([...current, ...add]);
    });
    addRow.append(input);
    wrap.append(addRow);
  };

  paint(normalizeDatasetTags(tags));
}