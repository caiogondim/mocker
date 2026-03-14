import { Headers } from '../shared/http/index.js';

export type {
  HttpUrl,
  AbsoluteDirPath,
  NonNegativeInteger,
  HttpPort,
  ThrottleValue,
  Milliseconds,
} from '../shared/types.js';

import type { HttpUrl, AbsoluteDirPath, NonNegativeInteger, HttpPort, ThrottleValue, Milliseconds } from '../shared/types.js';

type LoggerLevels = 'silent' | 'error' | 'warn' | 'verbose';
export type MockKey = 'url' | 'method' | 'headers' | 'body' | `body.${string}`;

export type Args = Readonly<{
  port: HttpPort;
  origin: HttpUrl;
  delay: NonNegativeInteger;
  throttle: ThrottleValue;
  mode: 'read' | 'write' | 'read-write' | 'pass' | 'pass-read' | 'read-pass';
  update: 'off' | 'startup' | 'only';
  mocksDir: AbsoluteDirPath;
  logging: LoggerLevels;
  mockKeys: ReadonlySet<MockKey>;
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
  mocksDir: string;
  logging: Args['logging'];
  mockKeys: ReadonlySet<MockKey>;
  retries: number;
  redactedHeaders: Headers;
  overwriteResponseHeaders: Headers;
  overwriteRequestHeaders: Headers;
  cors: boolean;
  proxy: string;
}>;
