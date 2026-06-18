import config from '@ljharb/eslint-config/flat';

export default [
	...config,
	{
		rules: {
			'func-style': ['error', 'declaration'],
			'max-lines-per-function': 'off',
			'multiline-comment-style': 'off',
			'no-extra-parens': 'off',
		},
	},
	{
		files: ['bin.mjs'],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
			},
		},
		rules: {
			'no-console': 'off',
		},
	},
];
