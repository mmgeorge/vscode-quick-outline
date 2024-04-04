import { window, type SymbolInformation, SymbolKind, Selection, Range, Position, type QuickPickItem, QuickInputButton, QuickPickItemKind, ThemeIcon, Uri, Location, TextDocument } from "vscode";
import { selectionStyle } from "./extension";
import { createSymbolFallbackDescription, iconForKind, pad } from "./utils";

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
    private _depth = 0
  ) {
    const detail = "detail" in this._symbol &&
      typeof this._symbol["detail"] === "string" &&
      this._symbol.detail.length > 0 ? this._symbol.detail : null;

    this.expanded = expandedByDefaultTypes.includes(this._symbol.kind);
    this.description = detail ?? createSymbolFallbackDescription(this._symbol, window.activeTextEditor!);

    const line = this._symbol.location.range.start.line;
    const lineNumberFormatted = pad(line.toString());
    const depthPadding = "".padEnd(this._depth * 4, " ");;

    this.label = `${lineNumberFormatted} ${depthPadding} ${iconForKind(this._symbol.kind)} ${this._symbol.name}`;

    if ("children" in _symbol) {
      const children = (_symbol.children as any as SymbolInformation[]) || [];
      // Symbols may not be returned to us sorted
      children.sort((a, b) => a.location.range.start.line - b.location.range.start.line);

      this.children = children.map(child => new QuickOutlineItem(child, this._depth + 1));
    }
  }

  readonly children: QuickOutlineItem[] = [];
  readonly description: string;
  readonly label: string;
  expanded: boolean;

  get location(): Location {
    return this._symbol.location;
  }

  get lineStart(): number {
    return this.location.range.start.line;
  }

  get name(): string {
    return this._symbol.name;
  }

  getNameRange(document: TextDocument): Range {
    const startOffset = document.offsetAt(this.location.range.start);
    const tokenOffset = document.getText(this.location.range)
      .indexOf(this.name) + startOffset;
    const tokenPosition = document.positionAt(tokenOffset);
    const tokenRange = document.getWordRangeAtPosition(tokenPosition);
    const end = new Position(tokenPosition.line, tokenPosition.character + 10);

    return new Range(tokenPosition, end);
  }
}


export class QuickOutline {

  constructor(
    symbols: SymbolInformation[]) {

    this._quickPick.placeholder = "Jump to a symbol";
    this._quickPick.matchOnDescription = true;

    const items = symbols.map(symbol => new QuickOutlineItem(symbol));
    // Symbols not guarenteed to be sorted
    items.sort((a, b) => a.lineStart - b.lineStart);
    this._quickPick.items = this._extractExpandedItems(items);

    this._quickPick.onDidChangeActive((items) => this._onDidChangeActive(items as any));
    this._quickPick.onDidAccept(() => this._onDidAccept());
    this._quickPick.onDidChangeSelection((value) => {
      console.log("select", value);
    });
    this._quickPick.onDidChangeValue((value) => {
      console.log("change value", value);
    });

    this._quickPick.show();
  }

  destroy() {
    this._quickPick.dispose();
  }

  private _quickPick = window.createQuickPick<QuickOutlineItem>();
  private _lastItem: QuickOutlineItem | null = null;
  private _editor = window.activeTextEditor!;

  private _onDidChangeActive(items: QuickOutlineItem[]) {
    let item = items[0];
    this._lastItem = item;

    const nameRange = item.getNameRange(this._editor.document);

    this._editor.revealRange(item.location.range);
    this._editor.setDecorations(selectionStyle, [nameRange]);
  }

  private _onDidAccept(): void {
    const item = this._lastItem;

    if (item == null) {
      return;
    }

    const nameRange = item.getNameRange(this._editor.document);

    this._editor.selection = new Selection(item.location.range.start, item.location.range.start);
    this._editor.revealRange(item.location.range);
    this._editor.setDecorations(selectionStyle, []);

    this.destroy();
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
