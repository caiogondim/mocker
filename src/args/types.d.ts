import { Headers } from '../shared/http/index.js';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type HttpUrl = Brand<string, 'HttpUrl'>;
export type AbsoluteDirPath = Brand<string, 'AbsoluteDirPath'>;
export type NonNegativeInteger = Brand<number, 'NonNegativeInteger'>;
export type HttpPort = Brand<number, 'HttpPort'>;
export type ThrottleValue = Brand<number, 'ThrottleValue'>;

type LoggerLevels = 'silent' | 'error' | 'warn' | 'verbose';

export type Args = Readonly<{
  port: HttpPort;
  origin: HttpUrl;
  delay: NonNegativeInteger;
  throttle: ThrottleValue;
  mode: 'read' | 'write' | 'read-write' | 'pass' | 'pass-read' | 'read-pass';
  update: 'off' | 'startup' | 'only';
  responsesDir: AbsoluteDirPath;
  workers: NonNegativeInteger;
  logging: LoggerLevels;
  mockKeys: Set<string>;
  retries: NonNegativeInteger;
  redactedHeaders: Headers;
  overwriteResponseHeaders: Headers;
  overwriteRequestHeaders: Headers;
  cors: boolean;
  proxy: HttpUrl;
}>;

export type UnbrandedArgs = Readonly<{
  port: number;
  origin: string;
  delay: number;
  throttle: number;
  mode: Args['mode'];
  update: Args['update'];
  responsesDir: string;
  workers: number;
  logging: Args['logging'];
  mockKeys: Set<string>;
  retries: number;
  redactedHeaders: Headers;
  overwriteResponseHeaders: Headers;
  overwriteRequestHeaders: Headers;
  cors: boolean;
  proxy: string;
}>;
