import noDuplicateString from "./lib/rules/no-duplicate-string.js";
import recommendedConfig from "./lib/configs/recommended.js";
// 直接引入 package.json
import pkg from "./package.json" assert { type: "json" };

const plugin = {
  // 元数据
  meta: {
    name: pkg.name, // 自动同步 "eslint-plugin-aegis"
    version: pkg.version, // 自动同步
  },
  // 1. 导出规则定义
  rules: {
    "no-duplicate-string": noDuplicateString,
    // 'future-rule': futureRule // 以后加规则就在这里加一行
  },
};

// 2. 导出预设配置
plugin.configs = {
  // Flat Config (ESLint 9+ 直接引入方式) - 推荐
  // 使用方法: export default [ aegis.configs.recommended ];
  recommended: {
    plugins: {
      aegis: plugin,
    },
    rules: recommendedConfig.rules,
  },
};

export const meta = plugin.meta;
export const rules = plugin.rules;
export const configs = plugin.configs;

export default plugin;

/**
 * ## 本地调试/集成指南
 *
 * 1. 在此目录运行: `yarn build`
 * 2. 在目标项目中安装: `yarn add /Users/laiyoung/Documents/Profession/FE/eslint-plugin-aegis -D`
 * 3. 在 eslint.config.js 中集成使用：
 * ```javascript
 * // eslint.config.js
 * import aegis from 'eslint-plugin-aegis';
 *
 * export default [
 *   aegis.configs.recommended,
 *   // 你的其他配置...
 * ];
 * ```
 */
