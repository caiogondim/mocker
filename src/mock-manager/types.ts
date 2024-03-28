import { Json } from '../shared/types';
import { Headers } from '../shared/http';

export type MockFile = {
  request: {
    url: string;
    method: string;
    headers: Headers;
    body: string | Json;
  };
  response: {
    statusCode: number;
    headers: Headers;
    body: string | Json;
  };
};

export type RequestFile = {
  file: string;
  request: {
    url: string;
    method: string;
    headers: Headers;
    body: string | Json;
  };
};
