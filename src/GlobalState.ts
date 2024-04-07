export class GlobalState {
  static Get = new GlobalState();
  private constructor() { }

  private _lastSearchBySymbol: string = "";
  private _lastSearchByText: string = "";

  setSearchStr(searchStr: string, method: "symbol" | "text"): void {
    switch (method) {
      case "symbol":
        this._lastSearchBySymbol = searchStr;
        break;
      case "text":
        this._lastSearchByText = searchStr;
        break;
    }
  }

  getSearchStr(method: "symbol" | "text"): string {
    switch (method) {
      case "symbol":
        return this._lastSearchBySymbol;
      case "text":
        return this._lastSearchByText;
    }
  }
}
