import { window, SymbolInformation, SymbolKind, Selection, Range, Position, type QuickPickItem, QuickInputButton, QuickPickItemKind, ThemeIcon, Uri, commands } from "vscode";
import { selectionStyle } from "./extension";


import { close } from "fs";
import { IMatchedRange, IParsedSearchString, parseSearchCommand, parseSearchString, searchDocument, searchLine } from "./search";
import { GlobalState } from "./GlobalState";
import { QuickLineItem } from "./QuickLineItem";
import { QuickSymbolOutlineItem } from "./QuickSymbolOutlineItem";
import { forEachParent } from "./utils";
import { ISearch, ISimpleSearch, IFilter, IFilterSearch } from "./ISearch";

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

export type QuickOutlineItem = QuickLineItem | QuickSymbolOutlineItem;

export function setInQuickOutline(value: boolean) {
  commands.executeCommand("setContext", "inQuickOutline", value);
}

export class QuickOutline {

  constructor(
    symbols: SymbolInformation[],
    private readonly _searchMethod: "symbol" | "text") {
    setInQuickOutline(true);

    let disableNextSearch = true;

    this._quickPick.placeholder = "Jump to a symbol";
    this._quickPick.matchOnDescription = true;
    this._quickPick.ignoreFocusOut = true;
    this._quickPick.keepScrollPosition = false;
    this._quickPick.onDidChangeActive((items) => this._onDidChangeActive(items as any));
    this._quickPick.onDidChangeValue((value) => {
      if (disableNextSearch) {
        disableNextSearch = false;
        return;
      }

      this._search(value);
    });

    this._quickPick.onDidAccept(() => this._onDidAccept());
    this._quickPick.onDidHide(() => {
      this.dispose();
    });

    // Initialize items
    const items = symbols.map(symbol => new QuickSymbolOutlineItem(symbol, this._searchMethod));
    items.sort((a, b) => a.lineStart - b.lineStart);
    this._rootItems = items;

    const searchStr = GlobalState.Get.getSearchStr(this._searchMethod);

    // Restore the previous search
    if (searchStr) {
      // This will trigger a search which we must catch!
      this._quickPick.value = searchStr;
      this._search(searchStr);
      disableNextSearch = true;
    }

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
    this._updateActiveItem();

    this._quickPick.show();
  }

  dispose() {
    if (this._disposed) {
      return;
    }

    this._disposed = true;
    setInQuickOutline(false);

    this._editor.setDecorations(selectionStyle, []);
    this._quickPick.dispose();
    this._rootItems = [];
  }

  private _disposed = false;
  private _quickPick = window.createQuickPick<QuickOutlineItem>();
  private _editor = window.activeTextEditor!;
  private _rootItems: QuickOutlineItem[];
  private _activeItem: QuickOutlineItem | null = null;

  *symbolItems(): IterableIterator<QuickSymbolOutlineItem> {
    for (const item of this.items()) {
      if (item.ty === 'symbol') {
        yield item;
      }
    }
  }

  *items(): IterableIterator<QuickOutlineItem> {
    for (const item of this._rootItems) {
      yield item;
      yield* item.allNestedChildren();
    }
  }

  showAll(kinds: SymbolKind[]): void {
    for (const item of this.items()) {
      if (item.ty === "symbol" && kinds.includes(item.symbolKind)) {
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
      if (item.ty === "symbol") {
        item.expanded = expanded;
      }
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

    if (!item) {
      return;
    }

    item.expanded = expanded;

    // If we are collapsing an item, also collapse any children
    if (!expanded) {
      for (const child of item.allNestedChildren()) {
        child.expanded = false;
      }
    }

    this._updateItems();
    this._updateActiveItem();
  }

  private _prepareItemsForSearch(): void {
    for (const item of this.items()) {
      // Filter outer any lines we added from a previous search
      item.clearLineChildren();
      item.hidden = true;
      item.expanded = false;
    }
  }

  private _search(searchStr: string): void {
    // We may restore the value for a new session
    GlobalState.Get.setSearchStr(searchStr, this._searchMethod);

    // Make sure the command box always has '#' when search -- this is a workaround
    // to shortcircuit the native searching that the input does
    if (searchStr.length != 0 && searchStr[0] !== "#") {
      this._quickPick.value = `#${searchStr}`;
    }

    const search = parseSearchCommand(searchStr);
    if (search == null) {
      return this._searchNone();
    }

    // Reset any state, mark all items as hidden
    this._prepareItemsForSearch();

    switch (search.type) {
      case "simple": return this._searchSimple(search);
      case "filter": return this._filter(search);
      case "filter-search": return this._filterSearch(search);
    }
  }

  private _getSearchResults(parsedSearch: IParsedSearchString[]): IMatchedRange[] {
    if (this._searchMethod === "text") {
      return searchDocument(this._editor.document, parsedSearch);
    }

    const searchResults: IMatchedRange[] = [];
    for (const item of this.symbolItems()) {
      const match = searchLine(item.lineStart, item.name, parsedSearch);
      if (match) {
        searchResults.push(match);
      }
    }

    return searchResults;
  }

  private _searchNone(): void {
    for (const item of this.items()) {
      item.clearLineChildren();
      item.expanded = false;
      item.hidden = false;
    }

    this._updateItems();
    return;
  }

  private _searchSimple(search: ISimpleSearch): void {
    const searchResults = this._getSearchResults(search.search);
    for (const match of searchResults) {
      for (const item of this._rootItems) {
        const line = this._editor.document.lineAt(match.line);

        item.insertLineIfParent(match, line);
      }
    }

    this._updateItems();
  }

  private _filter(filter: IFilter): void {
    for (const item of this.symbolItems()) {
      if (filter.filter.has(item.symbolKind)) {
        item.hidden = false;
        forEachParent(item, (parent) => {
          parent.hidden = false;
          parent.expanded = true;
        });
      }
    }

    this._updateItems();
  }

  private _filterSearch(filter: IFilterSearch): void {
    const searchResults = this._getSearchResults(filter.search);
    const hitLines = new Set<number>();
    for (const result of searchResults) {
      hitLines.add(result.line);
    }

    for (const item of this.symbolItems()) {
      if (filter.filter.has(item.symbolKind)) {
        if (hitLines.has(item.lineStart)) {
          item.hidden = false;
          forEachParent(item, (parent) => {
            parent.hidden = false;
            parent.expanded = true;
          });
        }
      }
    }

    this._updateItems();
  }

  private _updateActiveItem(): void {
    if (!this._activeItem) {
      return;
    }

    this._quickPick.activeItems = [this._activeItem];
    // `show` seems to be required in order for the quickPick to reselect
    // the correct active item
    this._quickPick.show();
  }

  private _getClosestItem(position: Position): QuickOutlineItem {
    let closestItem: QuickOutlineItem | null = null;
    let closestLineDist = Infinity;

    for (const item of this.items()) {
      let line = -1;
      if (item.ty === "symbol") {
        const nameRange = item.getNameRange(this._editor.document);
        line = nameRange.start.line;
      } else {
        line = item.line.lineNumber;
      }

      const lineDist = Math.abs(position.line - line);

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
  }

  private _onDidChangeActive(items: QuickOutlineItem[]) {
    const item = items[0];

    if (item.ty === "symbol") {
      const nameRange = item.getNameRange(this._editor.document);

      this._editor.revealRange(item.location.range);
      this._editor.setDecorations(selectionStyle, [nameRange]);
    } else {
      const ranges = item.match.ranges.map(([start, length]) => {
        return new Range(
          new Position(item.line.lineNumber, start),
          new Position(item.line.lineNumber, start + length),
        );
      });

      for (const [start, length] of item.match.ranges) {
        this._editor.setDecorations(selectionStyle, ranges);
      }

      this._editor.revealRange(item.line.range);
    }

    this._activeItem = item;
  }

  private _onDidAccept(): void {
    const item = this._activeItem;

    if (item == null) {
      return;
    }

    let range: Range;
    if (item.ty === "symbol") {
      range = item.getNameRange(this._editor.document);
    } else {
      range = item.line.range;
    }

    this._editor.selection = new Selection(range.start, range.start);
    this._editor.revealRange(range);
    this._editor.setDecorations(selectionStyle, []);
    this._quickPick.hide();
  }

  private _extractExpandedItems(items: QuickOutlineItem[], out: QuickOutlineItem[] = []): QuickOutlineItem[] {
    for (const item of items) {
      if (item.hidden) {
        continue;
      }

      out.push(item);

      if (item.expanded) {
        this._extractExpandedItems(item.children, out);
      }
    }

    return out;
  }
}

