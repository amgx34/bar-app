import { initBotId } from 'botid/client/core';

// Server actions post to their page's path. A no-op in local development.
initBotId({
  protect: [
    { path: '/signup', method: 'POST' },
    { path: '/setup', method: 'POST' },
    { path: '/api/demo', method: 'POST' },
  ],
});
