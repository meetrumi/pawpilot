// Minimal ambient types for turndown (v7 ships no TypeScript definitions).
// Covers only the API surface PawPilot uses.

declare module 'turndown' {
  export interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: string;
    emDelimiter?: '_' | '*' | '**';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    br?: string;
    blankReplacement?: (
      content: string,
      node: unknown,
      options: TurndownOptions,
    ) => string;
    keepReplacement?: (
      content: string,
      node: unknown,
      options: TurndownOptions,
    ) => string;
    defaultReplacement?: (
      content: string,
      node: unknown,
      options: TurndownOptions,
    ) => string;
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(key: string, rule: unknown): this;
    keep(filter: string | string[]): this;
    remove(filter: string | string[]): this;
  }
}
