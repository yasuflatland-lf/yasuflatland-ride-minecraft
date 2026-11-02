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

export interface SpecRule {
  name: string;
  line: number;
  fields: MetadataField[];
}

export interface Spec {
  path: string;
  title: string | undefined;
  header: MetadataField[];
  rules: SpecRule[];
  sections: { name: string; line: number }[];
  openIssues: { value: string; line: number }[];
}

export function parseSpec(path: string, text: string): Spec;
export function parseSpecs(files: FileMap): Spec[];
export function checkSpecFormat(specs: readonly Spec[]): Problem[];
export function checkSpecLinks(
  specs: readonly Spec[],
  adrs: readonly Adr[],
  files: FileMap,
): Problem[];
export function checkSpecAgreement(
  specs: readonly Spec[],
  adrs: readonly Adr[],
): Problem[];
export function checkSpecBasisSources(specs: readonly Spec[]): Problem[];
export function checkSpecClosure(
  specs: readonly Spec[],
  adrs: readonly Adr[],
): Problem[];
export function checkSpecCoverage(
  specs: readonly Spec[],
  adrs: readonly Adr[],
): Problem[];
export function checkSpecIndex(
  files: FileMap,
  specs: readonly Spec[],
): Problem[];

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
