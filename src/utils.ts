import { SymbolKind, type SymbolInformation, TextEditor, Range } from "vscode";
import { QuickOutlineItem } from "./QuickOutline";
import { QuickSymbolOutlineItem } from "./QuickSymbolOutlineItem";

export function pad(str: string): string {
  // Simply calling pad does not seem to position correclty in the pick list...
  if (str.length === 1) {
    str += "        ";
  }

  if (str.length === 2) {
    str += "      ";
  }

  if (str.length === 3) {
    str += "    ";
  }

  if (str.length === 4) {
    str += "   ";
  }

  return str;
}

export function iconForKind(kind: SymbolKind): string {
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

export function kindToText(symbol: SymbolInformation): string {
  switch (symbol.kind) {
    case SymbolKind.Array: return `array`;
    case SymbolKind.Boolean: return `boolean`;
    case SymbolKind.Struct: return `struct`;
    case SymbolKind.Interface: return `interface`;
    case SymbolKind.Class: return `class`;
    case SymbolKind.Constructor: return `constructor`;
    case SymbolKind.Enum: return `enum`;
    case SymbolKind.Event: return `event`;
    case SymbolKind.Field: return `field`;
    case SymbolKind.File: return `file`;
    case SymbolKind.Method: return "method";
    case SymbolKind.Function: return "function";
    case SymbolKind.Constant: return "constant";
    case SymbolKind.Variable: return "variable";
    case SymbolKind.EnumMember: return "enum member";
    case SymbolKind.Property: return "property";
    case SymbolKind.TypeParameter: return "type parameter";
    case SymbolKind.Key: return `key`;
    case SymbolKind.Module: return `module`;
    case SymbolKind.Namespace: return `namespace`;
    case SymbolKind.Null: return `null`;
    case SymbolKind.Number: return `number`;
    case SymbolKind.Object: return `object`;
    case SymbolKind.Operator: return `operator`;
    case SymbolKind.Package: return `package`;
    case SymbolKind.String: return `string`;
  }
}

export function createSymbolFallbackDescription(symbol: SymbolInformation, activeTextEditor: TextEditor): string {
  const kind = symbol.kind;

  switch (kind) {
    case SymbolKind.Array: return `array`;
    case SymbolKind.Boolean: return `boolean`;
    case SymbolKind.Struct: return `struct`;
    case SymbolKind.Interface: return `interface`;
    case SymbolKind.Class: return `class`;
    case SymbolKind.Constructor: return `constructor`;
    case SymbolKind.Enum: return `enum`;
    case SymbolKind.Event: return `event`;
    case SymbolKind.File: return `file`;
    case SymbolKind.Method: {
      const start = symbol.location.range.start;
      const line = activeTextEditor.document.lineAt(start.line);
      const lineText = activeTextEditor.document.getText(line.range)
        .replace(/(.*)(\{)/s, '$1');

      return lineText.trimStart();
    }
    case SymbolKind.Function: {
      const start = symbol.location.range.start;
      const line = activeTextEditor.document.lineAt(start.line);
      const lineText = activeTextEditor.document.getText(line.range)
        .replace(/(.*)(\{)/s, '$1');

      return lineText.trimStart();
    }
    case SymbolKind.Field:
    case SymbolKind.Constant:
    case SymbolKind.Variable:
    case SymbolKind.EnumMember:
    case SymbolKind.Property:
    case SymbolKind.TypeParameter: {
      const startOffset = activeTextEditor.document.offsetAt(symbol.location.range.start);
      const tokenOffset = activeTextEditor.document
        .getText(symbol.location.range)
        .indexOf(symbol.name) + startOffset;

      const tokenPosition = activeTextEditor.document.positionAt(tokenOffset);
      const tokenRange = activeTextEditor.document.getWordRangeAtPosition(tokenPosition);

      if (!tokenRange) {
        return kindToText(symbol);
      }
      const tokenEnd = tokenRange!.end;

      const start = symbol.location.range.start;
      const line = activeTextEditor.document.lineAt(start.line);
      const range = new Range(tokenEnd, line.range.end);
      const lineText = activeTextEditor.document.getText(range)
        .replace(/^[^a-zA-Z0-9]+/, '')
        .replace(/(.*)(,)/s, '$1')
        .replace(/(.*)(;)/s, '$1');

      return lineText;
    }

    case SymbolKind.Key: return `key`;
    case SymbolKind.Module: return `module`;
    case SymbolKind.Namespace: return `namespace`;
    case SymbolKind.Null: return `null`;
    case SymbolKind.Number: return `number`;
    case SymbolKind.Object: return ``;
    case SymbolKind.Operator: return `operator`;
    case SymbolKind.Package: return `package`;
    case SymbolKind.String: return `string`;
  }
}
export function forEachParent(item: QuickOutlineItem, callback: (parent: QuickSymbolOutlineItem) => void): void {
  let parent = item.parent;
  while (parent != null) {
    callback(parent);
    parent = parent.parent;
  }
}
export const hidePadding = new Array(100).fill(" ").join(" ");

