export type Clonable = Object | any[] | number | string | null;

export type Clone = <T extends Clonable>(source: T) => T;
export type SecretlessClone = <T extends Clonable>(source: T, secrets: Array<string>) => T;
