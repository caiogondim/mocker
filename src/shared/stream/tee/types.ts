import stream from 'stream';
import http from 'http';

export type cloneProps = <T, U>(source: T, target: U) => T & U;

export type Stream = stream;

export type HttpServerResponse = http.ServerResponse;

export type Tee = <T>(source: T) => T[];
