import { handleApi } from '../src/server/api';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleApi(request);
  },
};

