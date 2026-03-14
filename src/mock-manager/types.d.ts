import { Json, HttpMethod, HttpStatusCode } from '../shared/types.js';
import { Headers } from '../shared/http/index.js';

export type MockFile = {
  request: {
    url: string;
    method: HttpMethod;
    headers: Headers;
    body: string | Json;
  };
  response: {
    statusCode: HttpStatusCode;
    headers: Headers;
    body: string | Json;
  };
};

export type RequestFile = {
  file: string;
  request: {
    url: string;
    method: HttpMethod;
    headers: Headers;
    body: string | Json;
  };
};
