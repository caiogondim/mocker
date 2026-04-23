import fs from 'fs';
import { fs as memFs } from 'memfs';
import http from 'http';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type Result<T, E extends Error = Error> = { ok: true; value: T } | { ok: false; error: E };

export type ConnectionId = Brand<string, 'ConnectionId'>;
export type AbsoluteHttpUrl = Brand<string, 'AbsoluteHttpUrl'>;
export type HttpUrl = Brand<string, 'HttpUrl'>;
export type AbsoluteDirPath = Brand<string, 'AbsoluteDirPath'>;
export type NonNegativeInteger = Brand<number, 'NonNegativeInteger'>;
export type HttpPort = Brand<number, 'HttpPort'>;
export type ThrottleValue = Brand<number, 'ThrottleValue'>;
export type Milliseconds = Brand<number, 'Milliseconds'>;
export type HttpStatusCode = Brand<number, 'HttpStatusCode'>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface AsyncHttpServer extends AsyncDisposable {
  listen: (port?: number) => Promise<void>;
  close: () => Promise<void>;
  listening: boolean;
  port: number;
}

export type HttpIncomingMessage = http.IncomingMessage;

export type HttpServerResponse = http.ServerResponse;

export type HttpClientRequest = http.ClientRequest;

export type FsLike = typeof fs | typeof memFs;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

