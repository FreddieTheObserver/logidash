/** @typedef {import('lint-staged').Config} Config */

/** @type {Config} */
export default {
  '*.{ts,tsx,js,jsx}': ['prettier --write', 'eslint --fix'],
};
