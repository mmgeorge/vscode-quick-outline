import { window, SymbolInformation, SymbolKind, Range, Position, type QuickPickItem, Location, TextDocument, TextLine } from "vscode";
import { createSymbolFallbackDescription, iconForKind, pad } from "./utils";
import { IMatchedRange } from "./search";
import { GlobalState } from "./GlobalState";
import { QuickLineItem } from "./QuickLineItem";
import { QuickOutlineItem } from "./QuickOutline";
import { hidePadding } from "./utils";

export class QuickSymbolOutlineItem implements QuickPickItem {
  constructor(
    private _symbol: SymbolInformation,
    readonly searchMethod: "symbol" | "text",
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

      this._children = children.map(child => new QuickSymbolOutlineItem(child, this.searchMethod, this._depth + 1, this));
    }
  }

  private readonly _description: string;
  private _children: QuickOutlineItem[] = [];
  isSearchResult = false;

  readonly ty = "symbol";
  expanded: boolean;
  picked = false;
  hidden = false;

  get label(): string {
    const indicator = this.isSearchResult ? "*" : "";
    const line = this._symbol.location.range.start.line;
    const lineNumberFormatted = pad(line.toString() + indicator);
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    return `${lineNumberFormatted} ${depthPadding} ${iconForKind(this._symbol.kind)} ${this._symbol.name}`;
  }

  get description(): string {
    return `${this._description}${hidePadding}${GlobalState.Get.getSearchStr(this.searchMethod)}`;
  }

  get children(): QuickOutlineItem[] {
    return this._children;
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
  insertLineIfParent(match: IMatchedRange, line: TextLine, filter: Set<SymbolKind> | null): boolean {
    const passesFilter = !filter || filter.has(this.symbolKind);

    if (passesFilter && line.lineNumber === this.lineStart) {
      // The search line refers exactly to this symbol. Clobber
      this.hidden = false;
      this.isSearchResult = true;
      return true;
    }

    for (const child of this._children) {
      if (child.insertLineIfParent(match, line, filter)) {
        this.expanded = true;
        this.hidden = false;
        return true;
      }
    }

    if (passesFilter && this.location.range.contains(line.range)) {
      // Ensure sorted?
      this.expanded = true;
      this.hidden = false;
      this.children.push(new QuickLineItem(line, match, this._depth + 1, this.searchMethod, this));
      return true;
    }

    return false;
  }

  clearLineChildren(): void {
    this.isSearchResult = false;
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
