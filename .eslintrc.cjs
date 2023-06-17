process.env.ESLINT_TSCONFIG = 'tsconfig.json'

module.exports = {
  extends: ['@antfu', 'plugin:@cspell/recommended'],
  ignorePatterns: [
    'build',
    '!*.d.ts',
    '!.*rc.*',
  ],
  rules: {
    // project uses eventemmiter3 which binds context by itself
    '@typescript-eslint/unbound-method': 'off',
    // it forces all type parameters to be on single line
    // unacceptable for large generics
    'antfu/generic-spacing': 'off',
    // there are many cases where comment is really not needed
    '@typescript-eslint/ban-ts-comment': 'off',
  },
}
