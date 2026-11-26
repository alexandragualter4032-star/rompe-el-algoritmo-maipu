import { handleApi } from '../src/server/api.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleApi(request);
  },
};
