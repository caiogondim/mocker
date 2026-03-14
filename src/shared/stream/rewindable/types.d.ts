import { Readable } from 'stream';

export interface Rewindable {
  rewind(): Readable;
  release(): void;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}
