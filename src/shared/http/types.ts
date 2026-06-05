import type stream from 'node:stream'

export type RequestWrite = stream.Writable['write']

export type Headers = { [header: string]: string[] | string | number | null }
