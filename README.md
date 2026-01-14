# eslint-plugin-aegis

Aegis (埃癸斯) 是希腊神话中雅典娜和宙斯持有的神盾。它象征着保护、权威与智慧。

该插件不是一个全新的轮子，而是针对当前市面上已有规则（如 SonarJS 等）无法满足的特定检测需求进行的补充。欢迎大家根据实际开发场景提出自己的需求，共同丰富完善这个插件，从而提升代码的可读性、可维护性与可扩展性。

## 安装

你可以通过 yarn 或 npm 安装：

```bash
yarn add eslint-plugin-aegis -D
# 或者
npm install eslint-plugin-aegis --save-dev
```

## 使用

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
      "aegis/no-duplicate-string": ["error", { threshold: 2, minLength: 2 }],
      "aegis/no-implicit-complex-object": [
        "error",
        {
          propertyThreshold: 2,
        },
      ],
      "aegis/no-magic-numbers-strict": [
        "error",
        {
          ignore: [-1, 0, 1, 2],
          ignoreCalleePatterns: ["^(Date|setTimeout|setInterval|delay)$"],
        },
      ],
    },
  },
];
```

## 规则介绍

### `aegis/no-duplicate-string`

禁止代码中出现重复的字符串。这有助于提取公共常量，提高代码的可维护性。

> [!NOTE] > **为什么要开发这个规则？**
> 虽然市面上已有如 `sonarjs/no-duplicate-string` 等规则，但在实际业务开发中，它们往往存在配置不够灵活的问题（例如无法通过正则忽略特定函数调用中的字符串、无法精细控制是否忽略 TS 字面量类型等）。本规则旨在提供更细粒度的配置，以平衡代码质量与开发效率。

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
  "threshold": 2,
  "minLength": 2,
  "ignoreStrings": [
    "application/json", // 常见 MIME
    "YYYY-MM-DD" // 日期格式
  ],
  "ignorePatterns": [
    "^/", // 路径
    "^http(s)?://", // URL
    "^#([0-9A-Fa-f]{3,6})$", // HEX 颜色
    "^[0-9]+(px|rem|em|vh|vw|%)$", // CSS 单位
    "^t$" // 忽略国际化函数 t('...') 中的字符串
  ]
}]
```

---

### `aegis/no-implicit-complex-object`

当定义的变量是较为复杂的对象字面量时，强制要求显式定义类型（Interface 或 Type）。

> [!NOTE] > **为什么要开发这个规则？**
> 在 TypeScript 开发中，虽然编译器具备强大的类型推导能力，但对于属性较多的复杂对象，过分依赖隐式推导会导致：
>
> 1. **可读性下降**：开发者难以一眼看出对象的数据结构。
> 2. **维护成本增加**：当对象结构变化时，隐式推导可能产生非预期的 `any` 或联合类型，增加排错难度。
> 3. **Vue 3 体验问题**：在使用 `ref()` 或 `reactive()` 时，若不显式定义泛型，IDE 的代码提示可能不准确。
>    本规则旨在鼓励开发者为复杂数据结构建立明确的“契约”（Interface/Type），从而提升代码的健壮性。

#### 配置项 (Options)

| 属性                 | 类型       | 默认值  | 说明                                                       |
| :------------------- | :--------- | :------ | :--------------------------------------------------------- |
| `propertyThreshold`  | `integer`  | `2`     | 属性数量阈值。当对象属性达到该值时且未显式定义类型时报错。 |
| `ignoreVue3Wrappers` | `boolean`  | `false` | 是否忽略 Vue 3 的 `ref()` 和 `reactive()` 包装对象。       |
| `ignorePatterns`     | `string[]` | `[]`    | 正则表达式列表，匹配的变量名将被忽略。                     |

#### 特性补充

1.  **Vue 3 支持**：自动识别并检查 `ref({ ... })` 和 `reactive({ ... })` 中的对象。
2.  **泛型支持**：如果已经写了泛型（如 `ref<IUser>({ ... })`），则会自动跳过检查。
3.  **函数参数支持**：自动检查函数参数中的复杂内联类型定义（如 `function(user: { name: string, age: number })`）。

#### 示例配置

```javascript
"aegis/no-implicit-complex-object": ["error", {
  "propertyThreshold": 2,
  "ignorePatterns": [".*Rules$"]
}]
```

---

### `aegis/no-magic-numbers-strict`

禁止使用魔法数字。相比于原生的 `no-magic-numbers`，本规则提供了更强大的正则模式匹配的原生支持。

#### 配置项 (Options)

| 属性                            | 类型       | 默认值  | 说明                                                                                       |
| :------------------------------ | :--------- | :------ | :----------------------------------------------------------------------------------------- |
| `ignore`                        | `number[]` | `[]`    | 忽略的具体数字列表。                                                                       |
| `detectObjects`                 | `boolean`  | `false` | 是否检测对象属性中的数字。                                                                 |
| `enforceConst`                  | `boolean`  | `false` | 是否强制要求变量声明使用 `const`。                                                         |
| `ignoreArrayIndexes`            | `boolean`  | `false` | 是否忽略数组索引 `arr[0]`。                                                                |
| `ignoreEnums`                   | `boolean`  | `false` | 是否忽略 `enum` 定义中的数字。                                                             |
| `ignoreTypeIndexes`             | `boolean`  | `false` | 是否忽略 TS 类型索引 `Data[0]`。                                                           |
| `ignoreNumericLiteralTypes`     | `boolean`  | `false` | 是否忽略 TS 数字字面量类型 (如 `type T = 1 \| 2`)。                                        |
| `ignoreReadonlyClassProperties` | `boolean`  | `false` | 是否忽略类中的 `readonly` 属性初始值。                                                     |
| `ignoreDefaultValues`           | `boolean`  | `false` | 是否忽略参数默认值中的数字 (如 `function(a = 1)`)。                                        |
| `ignoreClassFieldInitialValues` | `boolean`  | `false` | 是否忽略类字段初始值 (如 `class A { prop = 1 }`)。                                         |
| `ignorePropertyPatterns`        | `string[]` | `[]`    | 正则表达式列表，匹配的对象属性名将被忽略。                                                 |
| `ignoreCalleePatterns`          | `string[]` | `[]`    | 正则表达式列表，作为这些函数或**类构造函数**参数的数字将被忽略 (如 `setTimeout`, `Date`)。 |

#### 特性补充

1.  **正则属性过滤 (`ignorePropertyPatterns`)**：支持通过正则表达式忽略特定命名的对象属性（如 `width`, `height`, `itemSpacing` 等），非常适合 UI 布局场景。
2.  **正则函数调用过滤 (`ignoreCalleePatterns`)**：支持通过正则表达式忽略特定函数或类构造函数（如 `setTimeout`, `Date`, `Math.floor`）中的数字参数。

#### 示例配置

```javascript
"aegis/no-magic-numbers-strict": ["error", {
  "ignore": [-1, 0, 1, 2],
  "ignoreArrayIndexes": true,
  "ignoreTypeIndexes": true,
  "ignoreEnums": true,
  "detectObjects": true,
  "enforceConst": true,
  "ignorePropertyPatterns": ["^width$|Width$"],
  "ignoreCalleePatterns": ["^(Date|setTimeout|setInterval|delay)$"]
}]
```

---

在使用过程中有任何疑问或问题，需要支持其他参数或需要开发支持其他检测规则，欢迎添加 VX：LaiYoung\_，请备注: `eslint-plugin-aegis`
