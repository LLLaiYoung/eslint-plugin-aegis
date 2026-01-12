# eslint-plugin-aegis

Aegis (埃癸斯) 是希腊神话中雅典娜和宙斯持有的神盾。它象征着保护、权威与智慧。该插件旨在为你的代码提供全方位的质量保障。

## 安装

你可以通过 yarn 或 npm 安装：

```bash
yarn add eslint-plugin-aegis -D
# 或者
npm install eslint-plugin-aegis --save-dev
```

## 使用 (Flat Config)

自 ESLint v9 开始，推荐使用 Flat Config。在你的 `eslint.config.js` 中引入并配置：

```javascript
import aegis from "eslint-plugin-aegis";

export default [
  // 使用推荐配置
  aegis.configs.recommended,

  // 或者手动配置
  {
    plugins: {
      aegis,
    },
    rules: {
      "aegis/no-duplicate-string": ["error", { threshold: 3, minLength: 5 }],
    },
  },
];
```

## 规则介绍

### `aegis/no-duplicate-string`

禁止代码中出现重复的字符串。这有助于提取公共常量，提高代码的可维护性。

#### 配置项 (Options)

| 属性                   | 类型       | 默认值 | 说明                                                         |
| :--------------------- | :--------- | :----- | :----------------------------------------------------------- |
| `threshold`            | `integer`  | `2`    | 重复次数阈值。达到该值时报错。                               |
| `minLength`            | `integer`  | `5`    | 触发检查的字符串最小长度。                                   |
| `ignoreStrings`        | `string[]` | `[]`   | 精确匹配忽略的字符串列表。                                   |
| `ignorePatterns`       | `string[]` | `[]`   | 正则表达式列表，匹配的字符串或**所在的函数名**将被忽略。     |
| `ignoreTSLiteralTypes` | `boolean`  | `true` | 是否忽略 TypeScript 的字面量类型 (例如 `type T = 'draft'`)。 |

#### 特性补充

1.  **自动忽略安全场景**：自动忽略 `import` 语句、`export` 语句、TypeScript 字面量类型以及对象属性的 Key。
2.  **智能函数过滤**：如果字符串出现在某个函数调用中，且该函数名匹配 `ignorePatterns` 中的正则，则不会报错（例如忽略打点监控或国际化函数）。
3.  **支持模板字符串**：不仅检查普通字符串（Literal），还支持无变量的模板字符串（TemplateLiteral）。

#### 示例配置

```javascript
"aegis/no-duplicate-string": ["error", {
  "threshold": 3,
  "minLength": 5,
  "ignorePatterns": [
    "^/", // 路径
    "^http(s)?://", // URL
    "^#([0-9A-Fa-f]{3,6})$", // HEX 颜色
    "^[0-9]+(px|rem|em|vh|vw|%)$", // CSS 单位
    "application/json", // 常见 MIME
    "YYYY-MM-DD", // 日期格式
    "^t$" // 忽略国际化函数 t('...') 中的字符串
  ]
}]
```

## 本地调试

如果你是在本地开发并希望在其他项目中测试：

1.  在本目录下运行 `yarn build`。
2.  在目标项目运行 `yarn add /path/to/eslint-plugin-aegis -D`。
3.  在目标项目的 `eslint.config.js` 中按上述方式引入。

## License

[ISC](LICENSE)
