import scriptRouter from './script.js';
import gqlRouter    from './graphql.js';

const routes = [
  { prefix: '/script', router: scriptRouter },
  { prefix: '/',       router: gqlRouter    },
];

export default routes;