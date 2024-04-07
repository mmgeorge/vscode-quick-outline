// This file is derived from <https://github.com/wenhoujx/swiper/tree/main>, ported to typescript
// 
// MIT License

// Copyright (c) 2022 Wenshuai Hou

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
  
  import { TextDocument, TextLine } from "vscode";

export interface IParsedSearchString {
  pattern: string, 
  isRegex: boolean, 
  caseSensitive: boolean, 
  negate: boolean
}

export interface IMatchedRange {
  line: number, 
  ranges: [number, number][]
}

export function parseSearchString(searchStr: string): IParsedSearchString[] {
	if (!searchStr.trim().length) {
		return [];
	}
	
  return searchStr.split(" ")
		.map(subSearch => subSearch.trim())
		.filter(subSearch => subSearch)
		.map(subSearch => {
			const isNegate = subSearch.startsWith("!");

      return ({
				pattern: isNegate ? subSearch.slice(1) : subSearch,
				isRegex: isNegate ? subSearch.startsWith("!/") : subSearch.startsWith("/"),
				caseSensitive: /[A-Z]/.test(subSearch),
				negate: subSearch.startsWith("!")
			});
		});
}

export function searchDocument(document: TextDocument, parsed: IParsedSearchString[]): IMatchedRange[] {
	const items = [];
	
  for (let i = 0; i < document.lineCount; i++) {
		const matches = searchLine(i, document.lineAt(i).text, parsed);
		if (matches) {
			items.push(matches);
		}
  }
  
	return items;
}

export function searchLine(lineIndex: number, line: string, parsed: IParsedSearchString[]): IMatchedRange | null {
	const matchedRange: IMatchedRange = {
		line: lineIndex,
		ranges: []
	};
	for (const p of parsed) {
		if (p.isRegex) {
			const splitRegex = p.pattern.match(new RegExp('^/(.*?)/([gimy]*)$'));
			if (!splitRegex) {
				return null;
			}
			
      const [pattern, flags] = splitRegex.slice(1);
      // only find the first
			const regex = new RegExp(pattern, flags);
      const matches = regex.exec(line);

			if (!matches && !p.negate) {
				// regular mode, and this line doesn't match 
				return null;
			} else if (matches && p.negate) {
				// intentionally skip for case when matches but should be ignored. 
				return null;
			} else if (!matches && p.negate) {
				// negate, and doesn't match, should keep this line. 
				continue;
			} else {
				// normal mode, record the matched range. 
				matchedRange.ranges.push([matches!.index, matches![0].length]);
			}
		} else {
			const m = p.caseSensitive ? line.indexOf(p.pattern) : line.toLowerCase().indexOf(p.pattern);
			if (p.negate) {
				if (m !== -1) {
					// intentionally skip this line. 
					return null;
				}
			} else {
				if (m === -1) {
					// normal mode, no match 
					return null;
				} else {
					// normal mode, matches, record range. 
					matchedRange.ranges.push([m, p.pattern.length]);
				}
			}
		}
	}
	return matchedRange;
}