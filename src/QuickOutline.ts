import { window, SymbolInformation, SymbolKind, Selection, Range, Position, commands } from "vscode";


import { IMatchedRange, IParsedSearchString, parseSearchCommand, searchDocument, searchLine } from "./search";
import { GlobalState } from "./GlobalState";
import { QuickLineItem } from "./QuickLineItem";
import { QuickSymbolOutlineItem } from "./QuickSymbolOutlineItem";
import { forEachParent } from "./utils";
import { ISimpleSearch, IFilter, IFilterSearch } from "./ISearch";

export const selectionStyle = window.createTextEditorDecorationType({
  border: "solid",
  borderWidth: "medium",
  borderColor: "red"
});

export type QuickOutlineItem = QuickLineItem | QuickSymbolOutlineItem;
export class QuickOutline {

  constructor(
    symbols: SymbolInformation[],
    private readonly _searchMethod: "symbol" | "text") {

    // Initialize items
    const items = symbols
      .map(symbol => QuickSymbolOutlineItem.tryCreate(symbol, this._searchMethod))
      .filter(item => item !== null) as QuickSymbolOutlineItem[];
    items.sort((a, b) => a.lineStart - b.lineStart);
    this._rootItems = items;

    this._quickPick.value = GlobalState.Get.getSearchStr(this._searchMethod);
    this._quickPick.placeholder = "Jump to a symbol";
    this._quickPick.matchOnDescription = true;
    this._quickPick.keepScrollPosition = false;

    this._quickPick.onDidAccept(() => this._onDidAccept());
    this._quickPick.onDidHide(() => this.dispose());
    this._quickPick.onDidChangeActive((items) => this._onDidChangeActive(items));
    this._quickPick.onDidChangeValue((value) => {
      this._search(value);
      this._setActiveItemByPosition();
      this._update();
    });

    this._setActiveItemByPosition();
    this._update();
  }

  dispose() {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    this._editor.setDecorations(selectionStyle, []);
    this._quickPick.dispose();
  }

  private _disposed = false;
  private _quickPick = window.createQuickPick<QuickOutlineItem>();
  private _editor = window.activeTextEditor!;
  private _rootItems: QuickOutlineItem[];

  * symbolItems(): IterableIterator<QuickSymbolOutlineItem> {
    for (const item of this.items()) {
      if (item.ty === 'symbol') {
        yield item;
      }
    }
  }

  * items(): IterableIterator<QuickOutlineItem> {
    for (const item of this._rootItems) {
      yield item;
      yield* item.allNestedChildren();
    }
  }

  showAll(kinds: SymbolKind[]): void {
    for (const item of this.items()) {
      if (item.ty === "symbol" && kinds.includes(item.symbolKind)) {
        forEachParent(item, (parent) => {
          parent.expanded = true;
        });
      }
    }

    this._update();
  }

  nextSearchResult(): void {
    const active = this._quickPick.activeItems[0];
    if (!active) {
      return;
    }

    const index = this._quickPick.items.indexOf(active);
    const nextSearchResult = this._quickPick.items
      .find((item, i) => i > index && item.isSearchResult);
    if (nextSearchResult) {
      this._quickPick.activeItems = [nextSearchResult];
      return;
    }

    // If at the end, Cycle back to the first search
    const prevSearchResult = this._quickPick.items.find(item => item.isSearchResult);
    if (prevSearchResult) {
      this._quickPick.activeItems = [prevSearchResult];
      return;
    }

    // If we have no searches, fallback to the default next command
    commands.executeCommand("workbench.action.quickOpenSelectNext");
  }

  previousSearchResult(): void {
    const active = this._quickPick.activeItems[0];
    if (!active) {
      return;
    }

    const reversed = this._quickPick
      .items.map(item => item)
      .reverse();

    const index = reversed.indexOf(active);
    const nextSearchResult = reversed
      .find((item, i) => i > index && item.isSearchResult);
    if (nextSearchResult) {
      this._quickPick.activeItems = [nextSearchResult];
      return;
    }

    // If at the end, Cycle back to the first search
    const prevSearchResult = reversed.find(item => item.isSearchResult);
    if (prevSearchResult) {
      this._quickPick.activeItems = [prevSearchResult];
      return;
    }

    // If we have no searches, fallback to the default next command
    commands.executeCommand("workbench.action.quickOpenSelectPrevious");
  }

  setAllExpandEnabled(expanded: boolean): void {
    for (const item of this.items()) {
      if (item.ty === "symbol") {
        item.expanded = expanded;
      }
    }

    this._update();
  }

  private _setActiveItemByPosition(): void {
    this._deselectAll();

    const initialPosition = this._editor.selection.start;
    const closestItem = this._getClosestItem(initialPosition, Array.from(this.items()));
    if (closestItem) {
      closestItem.shouldSelect = true;
    }
  }

  setActiveItemExpandEnabled(expanded: boolean): void {
    let item = this._quickPick.activeItems[0];
    let activeItem = item;
    if (!item) {
      return;
    }

    // When collapsing, collapse the entire group up to the parent
    // TODO: Make configurable or as a separate command?
    if (!expanded) {
      // Go up
      if (item.parent !== null) {
        item = item.parent;
        activeItem = item;
      }
      else {
        // No parent? Try to go back to the root previous
        const index = this._rootItems.indexOf(item);
        const prev = this._rootItems[index - 1];
        if (prev) {
          activeItem = prev;
        }
      }
    }
    // Otherwise if we are expanding
    else if (expanded) {
      // Jump to the first child
      if (item.children.length) {
        activeItem = item.children[0];
      }
      // If we have no children, instead move to the next item
      else {
        const index = this._quickPick.items.indexOf(item);
        const next = this._quickPick.items[index + 1];
        if (next) {
          activeItem = next;
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

    this._deselectAll();
    activeItem.shouldSelect = true;

    this._update();
  }

  private _deselectAll(): void {
    for (const item of this.items()) {
      item.shouldSelect = false;
    }
  }

  private _hideAllItems(): void {
    for (const item of this.items()) {
      // Filter outer any lines we added from a previous search
      item.clearLineChildren();
      item.hidden = true;
      item.expanded = false;
    }
  }

  private _search(searchStr: string): void {
    // We may restore the value for a new session
    console.log("Performing search", searchStr);

    // Make sure the command box always has '#' when search -- this is a workaround
    // to shortcircuit the native searching that the input does
    if (searchStr.length !== 0 && searchStr[0] !== "#") {
      this._quickPick.value = `#${searchStr}`;
      searchStr = `#${searchStr}`;
    }

    GlobalState.Get.setSearchStr(searchStr, this._searchMethod);

    // Reset whether we marked the symbol as a search result
    for (const symbol of this.symbolItems()) {
      symbol.isSearchResult = false;
    }

    const search = parseSearchCommand(searchStr);
    if (search === null) {
      if (this._searchMethod === "text") {
        this._hideAllItems();
        return;
      } else {
        return this._searchNone();
      }
    }

    // Reset any state, mark all items as hidden
    this._hideAllItems();

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
  }

  private _searchSimple(search: ISimpleSearch): void {
    const searchResults = this._getSearchResults(search.search);
    for (const match of searchResults) {
      for (const item of this._rootItems) {
        const line = this._editor.document.lineAt(match.line);

        item.insertLineIfParent(match, line, null);
      }
    }
  }

  private _filter(filter: IFilter): void {
    // Only display filtered results if we have a search when in text mode
    if (this._searchMethod === "symbol") {
      for (const item of this.symbolItems()) {
        if (filter.filter.has(item.symbolKind)) {
          item.hidden = false;
          item.isSearchResult = true;
          console.log("FILTER, SET ITEM AS SEARCH RESULT");
          forEachParent(item, (parent) => {
            parent.hidden = false;
            parent.expanded = true;
          });
        }
      }
    }
  }

  private _filterSearch(filter: IFilterSearch): void {
    const searchResults = this._getSearchResults(filter.search);
    const hitLines = new Set<number>();
    for (const result of searchResults) {
      hitLines.add(result.line);
    }

    if (this._searchMethod === "text") {
      for (const match of searchResults) {
        for (const item of this._rootItems) {
          const line = this._editor.document.lineAt(match.line);

          item.insertLineIfParent(match, line, filter.filter);
        }
      }
    }

    else {
      for (const item of this.symbolItems()) {
        if (filter.filter.has(item.symbolKind)) {
          if (hitLines.has(item.lineStart)) {
            item.hidden = false;
            item.isSearchResult = true;
            forEachParent(item, (parent) => {
              parent.hidden = false;
              parent.expanded = true;
            });
          }
        }
      }
    }
  }

  private _updateActiveItem(item: QuickOutlineItem): void {
    if (!this._quickPick.items.includes(item)) {
      console.log("ERROR: Cannot set active item that does not exist in pick list");
      throw new Error("Cannot set active item that does not exist in pick list");
    }

    this._quickPick.activeItems = [item];
  }

  private _getClosestItem(position: Position, items: readonly QuickOutlineItem[]): QuickOutlineItem | null {
    console.log("Call get closest item");
    let closestItem: QuickOutlineItem | null = null;
    let closestLineDist = Infinity;

    const hasSelection = GlobalState.Get.getSearchStr(this._searchMethod)?.length > 0;

    for (const item of items) {
      if (hasSelection && !item.isSearchResult) {
        continue;
      }

      let line = -1;
      if (item.ty === "symbol") {
        const nameRange = item.getNameRange(this._editor.document);
        line = nameRange.start.line;
      } else {
        line = item.line.lineNumber;
      }

      const lineDist = Math.abs(position.line - line);

      if (!closestItem) {
        console.log("GET CLOSEST ITEM, INSERT BY DEFAULT");
        closestItem = item;
        closestLineDist = lineDist;
        continue;
      }

      if (lineDist <= closestLineDist) {
        closestItem = item;
        closestLineDist = lineDist;
      }
    }

    return closestItem;
  }

  private _update(): void {
    console.log("Update");
    const items = this._extractExpandedItems(this._rootItems);
    this._quickPick.items = items;

    const selected = this._quickPick.items.find(item => item.shouldSelect);
    if (selected && !selected.hidden) {
      console.log("Setting selected to", selected.ty === "symbol" ? `s:${selected.lineStart}` : selected.line.lineNumber);
      this._quickPick.activeItems = [selected];
    } else {
      console.log("No selected item found");
      this._quickPick.activeItems = [];
    }

    this._quickPick.show();
  }

  private _onDidChangeActive(items: readonly QuickOutlineItem[]) {
    if (!items.length) {
      return;
    }

    const item = items[0];
    const ranges = item.getRanges(this._editor.document);
    if (ranges.length) {
      this._editor.setDecorations(selectionStyle, ranges);
      this._editor.revealRange(ranges[0]);
    }
  }

  private _onDidAccept(): void {
    const item = this._quickPick.activeItems[0];
    if (!item) {
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

