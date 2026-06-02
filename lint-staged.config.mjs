/** @typedef {import('lint-staged').Config} Config */

/** @type {Config} */
export default {
  '*.{js,jsx,mjs,cjs,json,md,yml,yaml,css,html}':
    'prettier --write --ignore-unknown',
};
