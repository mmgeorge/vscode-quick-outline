import { SymbolKind } from "vscode";
import { IParsedSearchString } from "./search";

export interface ISimpleSearch {
  type: "simple";
  search: IParsedSearchString[];
}
export interface IFilterSearch {
  type: "filter-search";
  search: IParsedSearchString[];
  filter: Set<SymbolKind>;
}
export interface IFilter {
  type: "filter";
  filter: Set<SymbolKind>;
}

export type ISearch = ISimpleSearch | IFilter | IFilterSearch;
