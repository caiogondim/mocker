import { Headers } from '../shared/http';
import { LoggerLevels } from '../shared/logger';

export type Args = Readonly<{
  port: number;
  origin: string;
  delay: number;
  throttle: number;
  mode: 'read' | 'write' | 'read-write' | 'pass' | 'pass-read' | 'read-pass';
  update: 'off' | 'startup' | 'only';
  responsesDir: string;
  workers: number;
  cache: boolean;
  logging: LoggerLevels;
  mockKeys: Set<string>;
  retries: number;
  redactedHeaders: Headers;
  overwriteResponseHeaders: Headers;
  overwriteRequestHeaders: Headers;
  cors: boolean;
}>;
