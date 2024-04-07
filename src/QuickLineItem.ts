import { type QuickPickItem, TextLine } from "vscode";
import { pad } from "./utils";
import { IMatchedRange } from "./search";
import { GlobalState } from "./GlobalState";
import { QuickSymbolOutlineItem, QuickOutlineItem } from "./QuickOutline";
import { hidePadding } from "./utils";

export class QuickLineItem implements QuickPickItem {

  constructor(
    readonly line: TextLine,
    readonly match: IMatchedRange,
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

  picked = false;
  hidden = false;
  expanded = false;

  *allNestedChildren(): IterableIterator<QuickOutlineItem> { }

  clearLineChildren(): void { }

  get children(): QuickOutlineItem[] {
    return [];
  }

  get description(): string {
    return `${hidePadding}${GlobalState.Get.getSearchStr(this.searchMethod)}`;
  }

  insertLineIfParent(match: IMatchedRange, line: TextLine): boolean {
    return false;
  }
}
