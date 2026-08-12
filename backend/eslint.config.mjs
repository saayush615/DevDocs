import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'prisma.config.ts'] },
  tseslint.configs.recommended, // ESLint recommended rules + TypeScript recommended rules.
  eslintConfigPrettier, // it disables any formatting rules that conflict with Prettier.
);
