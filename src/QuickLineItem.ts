import { type QuickPickItem, TextLine, SymbolKind, Position, Range, TextDocument } from "vscode";
import { pad } from "./utils";
import { IMatchedRange } from "./search";
import { GlobalState } from "./GlobalState";
import { QuickOutlineItem } from "./QuickOutline";
import { hidePadding } from "./utils";
import { QuickSymbolOutlineItem } from "./QuickSymbolOutlineItem";

export class QuickLineItem implements QuickPickItem {

  constructor(
    readonly line: TextLine,
    private readonly _match: IMatchedRange,
    private readonly _depth: number = 0,
    readonly searchMethod: "symbol" | "text",
    readonly parent: QuickSymbolOutlineItem | null
  ) {
    // The * indicates a match, which my definition is true if we are a line
    const lineNumberFormatted = pad(line.lineNumber.toString() + "*");
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    this.label = `${lineNumberFormatted} ${depthPadding} ${line.text.trim()}`;
  }

  readonly ty = "line";
  readonly label: string;
  readonly alwaysShow = true;

  // Indicates whether or not the item should be marked as active on the next update
  shouldSelect: boolean = false;

  hidden = false;
  expanded = false;

  *allNestedChildren(): IterableIterator<QuickOutlineItem> { }

  clearLineChildren(): void { }

  toJSON() {
    return {
      label: this.label
    };
  }

  get isSearchResult(): boolean {
    return true;
  }

  get children(): QuickOutlineItem[] {
    return [];
  }

  get description(): string {
    return `${hidePadding}${GlobalState.Get.getSearchStr(this.searchMethod)}`;
  }

  getRanges(_document: TextDocument): Range[] {
    return this._match.ranges.map(([start, length]) => {
      return new Range(
        new Position(this.line.lineNumber, start),
        new Position(this.line.lineNumber, start + length),
      );
    });
  }

  reset(): void {
    this.shouldSelect = false;
  }

  insertLineIfParent(_match: IMatchedRange, _line: TextLine, _filter: Set<SymbolKind> | null): boolean {
    return false;
  }
}
