import { commands, window, type ExtensionContext, type TextEditor, type SymbolInformation, type QuickPickItem, SymbolKind, workspace } from "vscode";
import { QuickOutline } from "./QuickOutline";
import { GlobalState } from "./GlobalState";

export const selectionStyle = window.createTextEditorDecorationType({
  border: "solid",
  borderWidth: "medium",
  borderColor: "red"
});

export function setInQuickOutline(value: boolean) {
  console.log("setInQuickOutline", value);
  commands.executeCommand("setContext", "inQuickOutline", value);
}

export function setInQuickOutlineSearch(value: boolean) {
  console.log("setInQuickOutlineSearch", value);
  commands.executeCommand("setContext", "inQuickOutlineSearch", value);
}


let quickOutline: QuickOutline | null = null;
let quickOutlineForTextSearch: QuickOutline | null = null;

export function activate(context: ExtensionContext) {
  let cmds = [
    commands.registerCommand('quick-outline.showOutline', showOutline),
    commands.registerCommand('quick-outline.searchTextInFile', searchTextInFile),
    commands.registerCommand('quick-outline.searchSelectionInFile', searchSelectionInFile),
    commands.registerCommand('quick-outline.nextSearchResult', () => {
      // Could be for either
      quickOutline?.nextSearchResult();
      quickOutlineForTextSearch?.nextSearchResult();
    }),
    commands.registerCommand('quick-outline.previousSearchResult', () => {
      // Could be for either
      quickOutline?.previousSearchResult();
      quickOutlineForTextSearch?.previousSearchResult();
    }),
    commands.registerCommand('quick-outline.expand', () => quickOutline?.setActiveItemExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapse', () => quickOutline?.setActiveItemExpandEnabled(false)),
    commands.registerCommand('quick-outline.expandAll', () => quickOutline?.setAllExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapseAll', () => quickOutline?.setAllExpandEnabled(false)),
    commands.registerCommand('quick-outline.showAllFunctionMethod', () => quickOutline?.showAll([SymbolKind.Function, SymbolKind.Method])),
  ];
}

export function deactivate() {
  console.log("Deactivate");
  quickOutline?.dispose();
  quickOutlineForTextSearch?.dispose();
  setInQuickOutline(false);
  setInQuickOutlineSearch(false);
}

async function showOutline() {
  const document = window.activeTextEditor?.document;

  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  setInQuickOutline(true);
  quickOutline = new QuickOutline(symbols, "symbol");
  quickOutline.onHide = () => {
    setInQuickOutline(false);
  };
}

async function searchTextInFile(): Promise<void> {
  const document = window.activeTextEditor?.document;

  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  setInQuickOutlineSearch(true);
  quickOutlineForTextSearch = new QuickOutline(symbols, "text");
  quickOutlineForTextSearch.onHide = () => {
    setInQuickOutlineSearch(false);
  };
}

async function searchSelectionInFile() {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const text = editor.document.getText(editor.selection) ?? "";
  GlobalState.Get.setSearchStr("#" + text, "text");

  await searchTextInFile();
}
;
