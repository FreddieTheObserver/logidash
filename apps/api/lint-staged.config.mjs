/** @typedef {import('lint-staged').Config} Config */

/** @type {Config} */
export default {
  '*.ts': ['prettier --write', 'eslint --fix'],
};
