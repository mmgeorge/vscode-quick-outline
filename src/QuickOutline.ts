import { window, type SymbolInformation, SymbolKind, Selection, Range, Position, type QuickPickItem, QuickInputButton, QuickPickItemKind, ThemeIcon, Uri, Location, TextDocument, commands } from "vscode";
import { selectionStyle } from "./extension";
import { createSymbolFallbackDescription, iconForKind, pad } from "./utils";
import { close } from "fs";

export type QuickItem = QuickPickItem & { symbol: SymbolInformation; };

const expandedByDefaultTypes = [
  SymbolKind.Class,
  SymbolKind.Struct,
  SymbolKind.Interface,
  SymbolKind.Object
];

const ignoredTypesIfEmpty = [
  SymbolKind.Module,
  SymbolKind.Object
];

class QuickOutlineItem implements QuickPickItem {
  constructor(
    private _symbol: SymbolInformation,
    private _depth = 0,
    readonly parent: QuickOutlineItem | null = null
  ) {
    const detail = "detail" in this._symbol &&
      typeof this._symbol["detail"] === "string" &&
      this._symbol.detail.length > 0 ? this._symbol.detail : null;

    this.expanded = false;  //expandedByDefaultTypes.includes(this._symbol.kind);
    this.description = detail ?? createSymbolFallbackDescription(this._symbol, window.activeTextEditor!);

    const line = this._symbol.location.range.start.line;
    const lineNumberFormatted = pad(line.toString());
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    this.label = `${lineNumberFormatted} ${depthPadding} ${iconForKind(this._symbol.kind)} ${this._symbol.name}`;

    if ("children" in _symbol) {
      const children = (_symbol.children as any as SymbolInformation[]) || [];
      // Symbols may not be returned to us sorted
      children.sort((a, b) => a.location.range.start.line - b.location.range.start.line);

      this.children = children.map(child => new QuickOutlineItem(child, this._depth + 1, this));
    }
  }


  readonly children: QuickOutlineItem[] = [];
  readonly description: string;
  readonly label: string;

  expanded: boolean;
  picked = false;
  hidden = false;

  get symbolKind(): SymbolKind {
    return this._symbol.kind;
  }

  get location(): Location {
    return this._symbol.location;
  }

  get lineStart(): number {
    return this.location.range.start.line;
  }

  get name(): string {
    return this._symbol.name;
  }

  *allNestedChildren(): IterableIterator<QuickOutlineItem> {
    for (const child of this.children) {
      yield child;
      yield* child.allNestedChildren();
    }
  }

  getNameRange(document: TextDocument): Range {
    const startOffset = document.offsetAt(this.location.range.start);
    const tokenOffset = document.getText(this.location.range)
      .indexOf(this.name) + startOffset;
    const tokenPosition = document.positionAt(tokenOffset);
    const newPosition = tokenPosition.translate({ characterDelta: 1 });
    const tokenRange = document.getWordRangeAtPosition(newPosition);
    const end = new Position(tokenPosition.line, tokenPosition.character + 4);

    return tokenRange ?? new Range(tokenPosition, end);
  }
}


export function setInQuickOutline(value: boolean) {
  commands.executeCommand("setContext", "inQuickOutline", value);
}


export class QuickOutline {

  constructor(symbols: SymbolInformation[]) {
    setInQuickOutline(true);

    this._quickPick.placeholder = "Jump to a symbol";
    this._quickPick.matchOnDescription = true;
    this._quickPick.ignoreFocusOut = true;
    this._quickPick.keepScrollPosition = true;
    this._quickPick.onDidChangeActive((items) => this._onDidChangeActive(items as any));
    this._quickPick.onDidAccept(() => this._onDidAccept());
    this._quickPick.onDidHide(() => {
      this.dispose();
    });

    // Initialize items
    const items = symbols.map(symbol => new QuickOutlineItem(symbol));
    items.sort((a, b) => a.lineStart - b.lineStart);
    this._rootItems = items;

    // Set the outliner to a symbol that is closest the current cursor's lined
    const initialPosition = this._editor.selection.start;
    const closestItem = this._getClosestItem(initialPosition);
    this._activeItem = closestItem;

    // Expand any parents along the way so we can see it
    let parent = closestItem.parent;
    while (parent != null) {
      parent.expanded = true;
      parent = parent.parent;
    }

    // Finally trigger an update and render the outliner
    this._updateItems();
  }

  dispose() {
    setInQuickOutline(false);

    this._editor.setDecorations(selectionStyle, []);
    this._quickPick.dispose();
  }

  private _editor = window.activeTextEditor!;
  private _quickPick = window.createQuickPick<QuickOutlineItem>();
  private _rootItems: QuickOutlineItem[];
  private _activeItem: QuickOutlineItem | null = null;

  *items(): IterableIterator<QuickOutlineItem> {
    for (const item of this._rootItems) {
      yield item;
      yield* item.allNestedChildren();
    }
  }

  showAll(kinds: SymbolKind[]): void {
    for (const item of this.items()) {
      if (kinds.includes(item.symbolKind)) {
        let parent = item.parent;
        while (parent != null) {
          parent.expanded = true;
          parent = parent.parent;
        }
      }
    }

    this._updateItems();
  }

  setAllExpandEnabled(expanded: boolean): void {
    for (const item of this.items()) {
      item.expanded = expanded;
    }

    this._updateItems();
  }

  setActiveItemExpandEnabled(expanded: boolean): void {
    let item = this._activeItem;
    if (!item) {
      return;
    }

    // When collapsing, collapse the entire group up to the parent
    // TODO: Make configurable or as a separate command?
    if (!expanded) {
      // Go up
      if (item.parent != null) {
        item = item.parent;
        this._activeItem = item;
      }
      else {
        // No parent? Try to go back to the root previous
        const index = this._rootItems.indexOf(item);
        const prev = this._rootItems[index - 1];
        if (prev) {
          this._activeItem = prev;
        }
      }
    }
    // Otherwise if we are expanding
    else if (expanded) {
      // Jump to the first child
      if (item.children.length) {
        this._activeItem = item.children[0];
      }
      // If we have no children, instead move to the next item
      else {
        const index = this._quickPick.items.indexOf(item);
        const next = this._quickPick.items[index + 1];
        if (next) {
          this._activeItem = next;
        }
      }
    }

    item.expanded = expanded;

    // If we are collapsing an item, also collapse any children
    if (!expanded) {
      for (const child of item.allNestedChildren()) {
        child.expanded = false;
      }
    }

    this._updateItems();
  }

  private _getClosestItem(position: Position): QuickOutlineItem {
    let closestItem: QuickOutlineItem | null = null;
    let closestLineDist = Infinity;

    for (const item of this.items()) {
      const nameRange = item.getNameRange(this._editor.document);
      const nameLine = nameRange.start.line;
      const lineDist = Math.abs(position.line - nameLine);

      if (!closestItem) {
        closestItem = item;
        closestLineDist = lineDist;
        continue;
      }

      if (lineDist <= closestLineDist) {
        closestItem = item;
        closestLineDist = lineDist;
      }
    }

    return closestItem!;
  }

  private _updateItems(): void {
    this._quickPick.items = this._extractExpandedItems(this._rootItems);

    if (this._activeItem != null) {
      this._quickPick.activeItems = [this._activeItem];
    }

    this._quickPick.show();
  }

  private _onDidChangeActive(items: QuickOutlineItem[]) {
    const item = items[0];
    const nameRange = item.getNameRange(this._editor.document);

    this._editor.revealRange(item.location.range);
    this._editor.setDecorations(selectionStyle, [nameRange]);
    this._activeItem = item;
  }

  private _onDidAccept(): void {
    const item = this._activeItem;

    if (item == null) {
      return;
    }

    const nameRange = item.getNameRange(this._editor.document);

    this._editor.selection = new Selection(item.location.range.start, item.location.range.start);
    this._editor.revealRange(item.location.range);
    this._editor.setDecorations(selectionStyle, []);

    this.dispose();
  }

  private _extractExpandedItems(items: QuickOutlineItem[], out: QuickOutlineItem[] = []): QuickOutlineItem[] {
    for (const item of items) {
      out.push(item);

      if (item.expanded) {
        this._extractExpandedItems(item.children, out);
      }
    }

    return out;
  }
}
