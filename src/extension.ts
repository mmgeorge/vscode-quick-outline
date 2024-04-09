import { commands, window, type ExtensionContext, type SymbolInformation, SymbolKind } from "vscode";
import { QuickOutline } from "./QuickOutline";
import { GlobalState } from "./GlobalState";

export function setInQuickOutline(value: boolean) {
  commands.executeCommand("setContext", "inQuickOutline", value);
}

let quickOutline: QuickOutline | null = null;

export function activate(context: ExtensionContext) {
  let disposables = [
    commands.registerCommand('quick-outline.showOutline', showOutline),
    commands.registerCommand('quick-outline.searchTextInFile', searchTextInFile),
    commands.registerCommand('quick-outline.searchSelectionInFile', searchSelectionInFile),
    commands.registerCommand('quick-outline.nextSearchResult', () => quickOutline?.nextSearchResult()),
    commands.registerCommand('quick-outline.previousSearchResult', () => quickOutline?.previousSearchResult()),
    commands.registerCommand('quick-outline.expand', () => quickOutline?.setActiveItemExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapse', () => quickOutline?.setActiveItemExpandEnabled(false)),
    commands.registerCommand('quick-outline.expandAll', () => quickOutline?.setAllExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapseAll', () => quickOutline?.setAllExpandEnabled(false)),
    commands.registerCommand('quick-outline.showAllFunctionMethod', () => quickOutline?.showAll([SymbolKind.Function, SymbolKind.Method])),
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate() {
  quickOutline?.dispose();
}

function showOutline() {
  console.log("Called showOutline");
  return createQuickOutline("symbol"); 
}

function searchTextInFile() {
  console.log("Called searchTextInFile");
  return createQuickOutline("text");
}

function searchSelectionInFile() {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const text = editor.document.getText(editor.selection) ?? "";
  GlobalState.Get.setSearchStr("#" + text, "text");

  return searchTextInFile();
}
;

async function createQuickOutline(mode: "text" | "symbol"): Promise<void> {
  const document = window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  quickOutline = new QuickOutline(symbols, mode);
}
