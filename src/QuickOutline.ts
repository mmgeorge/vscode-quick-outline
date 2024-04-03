import { window, type SymbolInformation, SymbolKind, Selection, Range, Position, type QuickPickItem } from "vscode";
import { selectionStyle } from "./extension";

export type QuickItem = QuickPickItem & { symbol: SymbolInformation; };

export class QuickOutline {

  private _getItem(symbol: SymbolInformation, depth = 0): QuickItem {
    const line = symbol.location.range.start.line;
    let lineNumberFormatted = `${line}`;

    // Simply calling pad does not seem to position correclty in the pick list...
    if (lineNumberFormatted.length === 1) {
      lineNumberFormatted += "        ";
    }

    if (lineNumberFormatted.length === 2) {
      lineNumberFormatted += "      ";
    }

    if (lineNumberFormatted.length === 3) {
      lineNumberFormatted += "    ";
    }

    if (lineNumberFormatted.length === 4) {
      lineNumberFormatted += "   ";
    }

    const depthPadding = "".padEnd(depth * 4, " ");;
    return {
      label: `${lineNumberFormatted} ${depthPadding} ${this._iconForKind(symbol.kind)} ${symbol.name}`,
      description: this._textForKind(symbol.kind),
      symbol
    };
  };

  private _quickPick = window.createQuickPick<QuickItem>();

  constructor(
    private readonly _symbols: SymbolInformation[]) {

    this._quickPick.placeholder = "Jump to a symbol";

    const items = [];

    console.log((this._symbols));

    for (const symbol of this._symbols) {
      const item = this._getItem(symbol);

      if (symbol.kind === SymbolKind.Module || symbol.kind === SymbolKind.Object) {
        const parent = symbol as any;
        if ("children" in parent && parent.children.length) {
          // Only add the item if it is "interesting", e.g., it has children
          items.push(item);

          for (const child of (symbol as any).children) {
            items.push(this._getItem(child, 1));
          }
        }
      }

      else if (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Struct || symbol.kind === SymbolKind.Interface) {
        const parent = symbol as any;
        items.push(item);

        if ("children" in parent && parent.children.length) {
          for (const child of (symbol as any).children) {
            items.push(this._getItem(child, 1));
          }
        }
      } else {
        items.push(item);
      }
    }

    this._quickPick.items = items;

    let lastItem: QuickItem;

    this._quickPick.onDidChangeActive((items) => {
      let item = items[0];
      lastItem = item;
      let symbol = item.symbol;

      if (window.activeTextEditor) {
        window.activeTextEditor.revealRange(symbol.location.range);

        const startOffset = window.activeTextEditor.document.offsetAt(symbol.location.range.start);;
        const tokenOffset = window.activeTextEditor.document
          .getText(symbol.location.range)
          .indexOf(symbol.name) + startOffset;

        const tokenPosition = window.activeTextEditor.document.positionAt(tokenOffset);
        const tokenRange = window.activeTextEditor.document.getWordRangeAtPosition(tokenPosition);

        const end = new Position(
          tokenPosition.line,
          tokenPosition.character + 10
        );
        const outRange = new Range(
          tokenPosition,
          end
        );
        window.activeTextEditor.setDecorations(selectionStyle, [tokenRange!]);
      }
    });

    this._quickPick.onDidAccept(() => {
      const item = lastItem;
      const symbol = item.symbol;

      if (window.activeTextEditor) {
        window.activeTextEditor.revealRange(symbol.location.range);

        const startOffset = window.activeTextEditor.document.offsetAt(symbol.location.range.start);;
        const tokenOffset = window.activeTextEditor.document
          .getText(symbol.location.range)
          .indexOf(symbol.name) + startOffset;

        const tokenPosition = window.activeTextEditor.document.positionAt(tokenOffset);
        const tokenRange = window.activeTextEditor.document.getWordRangeAtPosition(tokenPosition);

        const end = new Position(
          tokenPosition.line,
          tokenPosition.character + 10
        );
        const outRange = new Range(
          tokenPosition,
          end
        );

        window.activeTextEditor.selection = new Selection(symbol.location.range.start, symbol.location.range.start);
        window.activeTextEditor.setDecorations(selectionStyle, []);
      }

      this._quickPick.dispose();
    });

    this._quickPick.onDidChangeSelection((value) => {
      console.log("select", value);
    });

    this._quickPick.onDidChangeValue((value) => {
      console.log(value);

    });

    this._quickPick.show();
  }

  destroy() {
    this._quickPick.dispose();
  }

  private _iconForKind(kind: SymbolKind) {
    switch (kind) {
      case SymbolKind.Array: return `$(symbol-array)`;
      case SymbolKind.Boolean: return `$(symbol-boolean)`;
      case SymbolKind.Constant: return `$(symbol-constant)`;
      case SymbolKind.Class: return `$(symbol-class)`;
      case SymbolKind.Constructor: return `$(symbol-constructor)`;
      case SymbolKind.Enum: return `$(symbol-enum)`;
      case SymbolKind.EnumMember: return `$(symbol-enum-member)`;
      case SymbolKind.Event: return `$(symbol-event)`;
      case SymbolKind.Field: return `$(symbol-field)`;
      case SymbolKind.File: return `$(symbol-file)`;
      case SymbolKind.Function: return `$(symbol-function)`;
      case SymbolKind.Interface: return `$(symbol-interface)`;
      case SymbolKind.Key: return `$(symbol-key)`;
      case SymbolKind.Module: return `$(symbol-module)`;
      case SymbolKind.Method: return `$(symbol-method)`;
      case SymbolKind.Namespace: return `$(symbol-namespace)`;
      case SymbolKind.Null: return `$(symbol-null)`;
      case SymbolKind.Number: return `$(symbol-number)`;
      case SymbolKind.Object: return `$(symbol-object)`;
      case SymbolKind.Operator: return `$(symbol-operator)`;
      case SymbolKind.Package: return `$(symbol-package)`;
      case SymbolKind.Property: return `$(symbol-property)`;
      case SymbolKind.String: return `$(symbol-string)`;
      case SymbolKind.Struct: return `$(symbol-struct)`;
      case SymbolKind.TypeParameter: return `$(symbol-type-parameter)`;
      case SymbolKind.Variable: return `$(symbol-variable)`;
    }
  }

  private _textForKind(kind: SymbolKind) {
    switch (kind) {
      case SymbolKind.Array: return `array`;
      case SymbolKind.Boolean: return `boolean`;
      case SymbolKind.Constant: return `constant`;
      case SymbolKind.Class: return `class`;
      case SymbolKind.Constructor: return `constructor`;
      case SymbolKind.Enum: return `enum`;
      case SymbolKind.EnumMember: return `enum member`;
      case SymbolKind.Event: return `event`;
      case SymbolKind.Field: return `field`;
      case SymbolKind.File: return `file`;
      case SymbolKind.Function: return `function`;
      case SymbolKind.Interface: return `interface`;
      case SymbolKind.Key: return `key`;
      case SymbolKind.Module: return `module`;
      case SymbolKind.Method: return `method`;
      case SymbolKind.Namespace: return `namespace`;
      case SymbolKind.Null: return `null`;
      case SymbolKind.Number: return `number`;
      case SymbolKind.Object: return `object`;
      case SymbolKind.Operator: return `operator`;
      case SymbolKind.Package: return `package`;
      case SymbolKind.Property: return `property`;
      case SymbolKind.String: return `string`;
      case SymbolKind.Struct: return `struct`;
      case SymbolKind.TypeParameter: return `type parameter`;
      case SymbolKind.Variable: return `variable`;
    }
  }


}
