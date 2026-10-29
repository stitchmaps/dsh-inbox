// Build-time entry: bundled by esbuild into lib/vendor.cjs so the plugin has no
// runtime node_modules and stays friendly to DSH's HMR module resolver.
export { ImapFlow } from 'imapflow'
export { simpleParser } from 'mailparser'
