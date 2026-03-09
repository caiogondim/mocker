import fs from 'fs';
import { fs as memFs } from 'memfs';
import http from 'http';
import stream from 'stream';

export interface AsyncHttpServer {
  listen: (port: number) => Promise<void>;
  close: () => Promise<void>;
  listening: boolean;
}

export type HttpIncomingMessage = http.IncomingMessage;

export type HttpServerResponse = http.ServerResponse;

export type HttpClientRequest = http.ClientRequest;

export type FsLike = typeof fs | typeof memFs;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Stream = stream;

export type StreamReadable = stream.Readable;