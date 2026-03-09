import { Readable } from 'stream';

export interface Rewindable {
  rewind(): Readable;
}
