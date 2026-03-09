import stream from 'stream';

export type Stream = stream;

export type RequestWrite = stream.Writable['write'];

export type Headers = { [header: string]: string[] | string | number | null | undefined };
