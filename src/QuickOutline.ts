import { window, SymbolInformation, SymbolKind, Selection, Range, Position, type QuickPickItem, QuickInputButton, QuickPickItemKind, ThemeIcon, Uri, Location, TextDocument, commands, TextLine } from "vscode";
import { selectionStyle } from "./extension";
import { createSymbolFallbackDescription, iconForKind, pad } from "./utils";


import { close } from "fs";
import { IMatchedRange, parseSearchString, searchDocument } from "./search";

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

type QuickOutlineItem = QuickLineItem | QuickSymbolOutlineItem; 

const cmd = "#";

const hidePadding = "                                                                                                                                                         ";
let currentSearchString: string = "";

class QuickLineItem implements QuickPickItem {

  constructor(
    readonly line: TextLine,
    readonly match: IMatchedRange, 
    private readonly _depth: number = 0, 
    readonly parent: QuickSymbolOutlineItem | null
  ) { 
    // The * indicates a match, which my definition is true if we are a line
    const lineNumberFormatted = pad(line.lineNumber.toString() + "*");
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    this.label = `${lineNumberFormatted} ${depthPadding} ${line.text.trim()}`;
  }

  readonly ty = "line"; 
  readonly label: string; 

  picked = false;
  hidden = false;
  expanded = false; 

  *allNestedChildren(): IterableIterator<QuickOutlineItem> { }

  clearLineChildren(): void {}
  
  get children(): QuickOutlineItem[] {
    return [];
  }

  get description(): string {
    return `${hidePadding}${currentSearchString}`;
  }

  insertLineIfParent(match: IMatchedRange, line: TextLine): boolean {
    return false; 
  }
}

class QuickSymbolOutlineItem implements QuickPickItem {
  constructor(
    private _symbol: SymbolInformation,
    private _depth = 0,
    readonly parent: QuickSymbolOutlineItem | null = null
  ) {
    const detail = "detail" in this._symbol &&
      typeof this._symbol["detail"] === "string" &&
      this._symbol.detail.length > 0 ? this._symbol.detail : null;

    this.expanded = false;
    this._description = detail ?? createSymbolFallbackDescription(this._symbol, window.activeTextEditor!);


    if ("children" in _symbol) {
      const children = (_symbol.children as any as SymbolInformation[]) || [];
      // Symbols may not be returned to us sorted
      children.sort((a, b) => a.location.range.start.line - b.location.range.start.line);

      this._children = children.map(child => new QuickSymbolOutlineItem(child, this._depth + 1, this));
    }
  }

  private readonly _description: string;
  private _children: QuickOutlineItem[] = [];
  private _isSearchResult = false; 

  readonly ty = "symbol"; 
  
  get label(): string {
    const indicator = this._isSearchResult ? "*" : ""; 
    const line = this._symbol.location.range.start.line;
    const lineNumberFormatted = pad(line.toString() + indicator);
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    return `${lineNumberFormatted} ${depthPadding} ${iconForKind(this._symbol.kind)} ${this._symbol.name}`;
  }

  expanded: boolean;
  picked = false;
  hidden = false;

  get children(): QuickOutlineItem[] {
    return this._children;
  }

  get description(): string {
    return `${this._description}${hidePadding}${currentSearchString}`;
  }

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
  

  // Returns true if inserted
  insertLineIfParent(match: IMatchedRange, line: TextLine): boolean {
    if (line.lineNumber === this.lineStart) {
      // The search line refers exactly to this symbol. Clobber
      this.hidden = false; 
      this._isSearchResult = true; 
      return true; 
    }

    for (const child of this._children) {
      if (child.insertLineIfParent(match, line)) {
        this.expanded = true; 
        this.hidden = false; 
        return true; 
      }
    }

    if (this.location.range.contains(line.range)) {
      // Ensure sorted?
      this.expanded = true; 
      this.hidden = false; 
      this.children.push(new QuickLineItem(line, match, this._depth + 1, this));
      return true; 
    }

    return false; 
  }

  clearLineChildren(): void {
    this._isSearchResult = false; 
    this._children = this._children.filter(child => child.ty !== "line"); 
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

  constructor(
    symbols: SymbolInformation[],
    searchMethod: "symbol" | "text") {
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

      if (searchMethod === "text") {
        this._searchText(value);
      }
    });
    
    this._quickPick.onDidAccept(() => this._onDidAccept());
    this._quickPick.onDidHide(() => {
      this.dispose();
    });

    // Initialize items
    const items = symbols.map(symbol => new QuickSymbolOutlineItem(symbol));
    items.sort((a, b) => a.lineStart - b.lineStart);
    this._rootItems = items;

    // Only restore serach if we are searching by text
    if (searchMethod === "text" && currentSearchString.length) {
      // This will trigger a search which we must catch!
      this._quickPick.value = currentSearchString;
      this._searchText(currentSearchString);
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

  private _disposed = false;
 
  dispose() {
    if (this._disposed) {
      return; 
    }

    this._disposed = true; 
    console.log("dispose");
    setInQuickOutline(false);

    this._editor.setDecorations(selectionStyle, []);
    this._quickPick.dispose();
    this._rootItems = []; 
  }

  private _searchText(searchStrRaw: string): void {
    currentSearchString = searchStrRaw; 

    console.log("Searching", searchStrRaw);
    if (searchStrRaw.length != 0 && searchStrRaw[0] !== "#") {
      this._quickPick.value = `#${searchStrRaw}`;
    }
    
    const regex = /(#\S+)\s+(.+)/;
    const groups = searchStrRaw.match(regex); 

    let commandString = ""; 
    let searchStr: string; 
    if (!groups) {
      // Then we have a single str 
      searchStr = searchStrRaw;
    } else {
      searchStr = groups[2];
      commandString = groups[1]; 
    }
    
    if (searchStr === "") {
      for (const item of this.items()) {
        item.clearLineChildren();
        item.expanded = false; 
        item.hidden = false; 
      }

      this._updateItems();
      return; 
    }

    for (const item of this.items()) {
      // Filter outer any lines we added from a previous search
      item.clearLineChildren();
      item.hidden = true; 
      item.expanded = false; 
    }

    searchStr = searchStr.trim(); 
    

    if (searchStr === "" || searchStr === "#") {
      for (const item of this.items()) {
        item.hidden = false; 
      }

      this._updateItems(); 
      return; 
    }
    
    // Just filter the symbols
    if (isCommandString(searchStr) || (
        isCommandString(commandString) && searchStr.length === 0)) {
      console.log("Command only");
      const symbolKinds = symbolKindsForCommandString(searchStr); 

      for (const item of this.items()) {
        if (item.ty === "symbol") {
          if (symbolKinds.has(item.symbolKind)) {
              item.hidden = false; 
              let parent = item.parent; 
              while (parent != null) {
                parent.hidden = false;
                parent.expanded = true; 
                parent = parent.parent;
              }
          }
        }
      }
    }

    // We have only a search

    else if (!isCommandString(commandString)) {
      const parsed = parseSearchString(searchStrRaw.slice(1)); // Discard .
      const searchResults = 
      searchDocument(this._editor.document, parsed); 

      let foundParent = false; 
      for (const match of searchResults) {
        for (const item of this._rootItems) {
          const line = this._editor.document.lineAt(match.line); 
          
          item.insertLineIfParent(match, line);
        }
      }
    }

    // We have a search with a command string
    else  {
      console.log("Search with command");
      const parsed = parseSearchString(searchStr.slice(1)); // Discard .
      const searchResults = searchDocument(this._editor.document, parsed); 

      const symbolKinds = symbolKindsForCommandString(commandString); 
      const hitLines = new Set<number>(); 
      for (const result of searchResults) {
        hitLines.add(result.line);
      }

      for (const item of this.items()) {
        if (item.ty === "symbol") {
          if (symbolKinds.has(item.symbolKind)) {
            if (hitLines.has(item.lineStart)) {
              item.hidden = false; 
              let parent = item.parent; 
              while (parent != null) {
                parent.hidden = false;
                parent.expanded = true; 
                parent = parent.parent;
              }
            }
          }
        }
      }
    }

    this._updateItems();
  }

  protected _quickPick = window.createQuickPick<QuickOutlineItem>();
  protected _editor = window.activeTextEditor!;
  protected _rootItems: QuickOutlineItem[];
  private _activeItem: QuickOutlineItem | null = null;

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
    console.log("change active");
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

function isCommandString(maybeCommandString: string): boolean {
  if (maybeCommandString.length <= 1) {
    return false; 
  }
  const maybeFilterArg = maybeCommandString.slice(1); // Remove .
  const validFilterArgs = new Set(['f', "c", "o", "e", "t"]);

  for (const character of maybeFilterArg) {
    if (!validFilterArgs.has(character)) {
      return false; 
    }
  }

  return true; 
}


function symbolKindsForCommandString(commandString: string): Set<SymbolKind> {
  const out = new Set<SymbolKind>(); 

  if (commandString.includes("f")) {
    out.add(SymbolKind.Method); 
    out.add(SymbolKind.Function); 
  }

  if (commandString.includes("c")) {
    out.add(SymbolKind.Class); 
    out.add(SymbolKind.Property); 
  }

  if (commandString.includes("s")) {
    out.add(SymbolKind.Struct);
    out.add(SymbolKind.Property); 
  }

  if (commandString.includes("o")) {
    out.add(SymbolKind.Object); 
  }

  if (commandString.includes("e")) {
    out.add(SymbolKind.Enum); 
    out.add(SymbolKind.EnumMember); 
  }

  if (commandString.includes("t")) {
    out.add(SymbolKind.Struct);
    out.add(SymbolKind.Class); 
    out.add(SymbolKind.Interface); 
    out.add(SymbolKind.TypeParameter); 
  }

  return out;
}

