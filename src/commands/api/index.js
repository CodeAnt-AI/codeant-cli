import { runApiRequest } from './request.js';

function collect(value, previous) {
  return [...previous, value];
}

export default function registerApiCommands(program, { runCmd }) {
  const api = program
    .command('api')
    .description('Call any authenticated CodeAnt application API');

  api
    .command('request <method> <path>')
    .description('Send an authenticated request to a relative CodeAnt API path')
    .option('--query <json>', 'Query parameters as a JSON object')
    .option('--body <json>', 'JSON request body')
    .option('--body-file <path>', 'Read the JSON request body from a file')
    .option('-H, --header <header>', 'Additional header (repeatable, "Name: value")', collect, [])
    .action((method, path, options) => runCmd(() => runApiRequest({
      method,
      path,
      query: options.query,
      body: options.body,
      bodyFile: options.bodyFile,
      headers: options.header,
    })));
}
