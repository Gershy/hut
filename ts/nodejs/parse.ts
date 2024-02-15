declare namespace HutNodejsParse {
  type Cfg = { [key: string]: unknown };
  
  type ShorthandFn<N extends keyof TCfg, TCfg extends ParserCfg, T extends Parser> = {
    (name: string, prop: TCfg[N], cfg: Omit<TCfg, N>): T,
    (prop: TCfg[N], cfg: Omit<TCfg, N>): T,
    (prop: TCfg[N]): T,
    (cfg: TCfg): T,
  };
  
  export type LanguageForm = (cfg: { name: string }) => Language;
  export type Language = {
    name: string,
    fns: () => {
      nop: (cfg: any) => NopParser,
      tok: ShorthandFn<'token', TokenParserCfg, TokenParser>,
      reg: ShorthandFn<'regex', RegexParserCfg, RegexParser>,
      all: ShorthandFn<'reqs', AllParserCfg, AllParser>,
      any: ShorthandFn<'opts', AnyParserCfg, AnyParser>,
      rep: ShorthandFn<'kid', RepeatParserCfg, RepeatParser>,
    }
  };
  
  type ParserCfg = { name?: string };
  export type NopParserCfg = ParserCfg & {};
  export type TokenParserCfg = ParserCfg & { token: string, sgs?: boolean };
  export type RegexParserCfg = ParserCfg & { regex: string, sgs?: boolean, z: boolean };
  export type AllParserCfg = ParserCfg & { reqs?: Parser[] };
  export type AnyParserCfg = ParserCfg & { opts?: Parser[] };
  export type RepeatParserCfg = ParserCfg & { kid?: Parser, minReps?: number, maxReps?: number };
  
  type Parser = {
    name: null | string,
    zeroable: () => boolean,
    normalize: () => Parser
  };
  export type NopParser = Parser & { _nop: unknown };
  export type TokenParser = Parser & { token: string };
  export type RegexParser = Parser & { regex: RegExp };
  export type AllParser = Parser & { reqs: Parser[], addReq: <P extends Parser>(req: P) => { all: AllParser, req: P } };
  export type AnyParser = Parser & { opts: Parser[], addOpt: <P extends Parser>(opt: P) => { any: AllParser, opt: P } };
  export type RepeatParser = Parser & { kid: null | Parser, minReps: number, maxReps: number };
  
}