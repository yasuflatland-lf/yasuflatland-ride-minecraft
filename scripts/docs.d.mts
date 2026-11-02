export interface Problem {
  path: string;
  line: number;
  message: string;
}

export interface MetadataField {
  name: string;
  value: string;
  line: number;
}

export interface Relation extends MetadataField {
  target: string | undefined;
  link: string | undefined;
  scope: string | undefined;
}

export interface Adr {
  path: string;
  number: string | undefined;
  title: string | undefined;
  fields: MetadataField[];
  relations: Relation[];
  invalidLines: number[];
}

export type FileMap = Readonly<Record<string, string>>;

export function parseAdr(path: string, text: string): Adr;
export function parseAdrs(files: FileMap): Adr[];
export function checkAdrIdentity(adrs: readonly Adr[]): Problem[];
export function checkMetadata(adrs: readonly Adr[]): Problem[];
export function checkRelationTargets(adrs: readonly Adr[]): Problem[];
export function checkRelationConflicts(adrs: readonly Adr[]): Problem[];
export function generateIndex(adrs: readonly Adr[]): string;
export function writeIndex(text: string, adrs: readonly Adr[]): string;
export function checkIndex(files: FileMap, adrs: readonly Adr[]): Problem[];
export function checkLinks(files: FileMap): Problem[];
