/* web-ext build/lint configuration.
 * Keeps docs, tests and old artwork out of the packaged XPI. */
module.exports = {
  ignoreFiles: [
    'tests/**',
    'web-ext-config.cjs',
    'web-ext-artifacts/**',
    'ERROR_REPORT.md',
    'README.md',
    'LICENSE',
    'icons/Icon.svg',
    'icons/Icon.png',
    'icons/Icon 256 - Monotone.svg'
  ]
};
