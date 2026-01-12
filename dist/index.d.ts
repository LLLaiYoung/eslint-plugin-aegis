/**
 * 自定义重复字符串检测规则
 */
var noDuplicateString = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow duplicate strings with granular configuration",
    },
    schema: [
      {
        type: "object",
        properties: {
          threshold: { type: "integer", minimum: 2 },
          minLength: { type: "integer", minimum: 2 },
          ignoreStrings: { type: "array", items: { type: "string" } },
          ignorePatterns: { type: "array", items: { type: "string" } }, // 接收正则字符串
          ignoreTSLiteralTypes: { type: "boolean" }, // 是否忽略 TS 的字面量类型
        },
        additionalProperties: false,
      },
    ],
    messages: {
      duplicate:
        "字符串 '{{str}}' 重复出现了 {{count}} 次 (阈值: {{threshold}}). 出现行号: {{lines}}.",
    },
  },
  create(context) {
    // 1. 获取配置
    const config = context.options[0] || {};
    const threshold = config.threshold || 2;
    const minLength = config.minLength || 5;
    const ignoreTSLiteralTypes = config.ignoreTSLiteralTypes !== false; // 默认忽略
    const ignoreSet = new Set(config.ignoreStrings || []);
    // 将正则字符串转换为 RegExp 对象
    const ignorePatterns = (config.ignorePatterns || []).map(
      (p) => new RegExp(p)
    );

    // 2. 存储当前文件所有的字符串节点
    // Map<StringValue, Array<ASTNode>>
    const stringMap = new Map();

    /**
     * 辅助函数：记录节点
     */
    function record(node, value) {
      // 1. 基础检查
      if (value.length < minLength) return;
      if (ignoreSet.has(value)) return;

      // 2. 检查字符串本身是否匹配正则
      if (ignorePatterns.some((regex) => regex.test(value))) return;

      // 3. 检查所属函数名是否匹配正则 (向上遍历多层，支持嵌套在属性或表达式中)
      let curr = node.parent;
      let depth = 0;
      while (curr && depth < 4) {
        if (curr.type === "CallExpression") {
          let funcName = "";
          if (curr.callee.type === "Identifier") {
            funcName = curr.callee.name;
          } else if (
            curr.callee.type === "MemberExpression" &&
            curr.callee.property.type === "Identifier"
          ) {
            funcName = curr.callee.property.name;
          }

          if (
            funcName &&
            ignorePatterns.some((regex) => regex.test(funcName))
          ) {
            return;
          }
        }
        curr = curr.parent;
        depth++;
      }

      if (!stringMap.has(value)) {
        stringMap.set(value, []);
      }
      stringMap.get(value).push(node);
    }

    return {
      // 监听普通字面量: "hello", 'world'
      Literal(node) {
        if (typeof node.value === "string") {
          // 忽略 import 语句中的字符串 (例如 import x from '...')
          if (
            node.parent &&
            (node.parent.type === "ImportDeclaration" ||
              node.parent.type === "ExportNamedDeclaration")
          ) {
            return;
          }
          // 是否忽略 TS 的字面量类型 (type T = 'draft')
          if (
            ignoreTSLiteralTypes &&
            node.parent &&
            node.parent.type === "TSLiteralType"
          ) {
            return;
          }
          // 是否忽略对象属性的 Key
          if (
            node.parent &&
            node.parent.type === "Property" &&
            node.parent.key === node
          ) {
            return;
          }

          record(node, node.value);
        }
      },

      // 监听不带变量的模板字符串: `hello`
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
          const rawValue = node.quasis[0].value.raw;
          // 只有当 raw 和 cooked 一样时才处理，避免处理复杂转义
          if (rawValue) {
            record(node, rawValue);
          }
        }
      },

      // 程序结束时，统计并报错
      "Program:exit"() {
        for (const [str, nodes] of stringMap) {
          if (nodes.length >= threshold) {
            // 对所有重复的节点报错
            const lineNumbers = nodes.map((n) => n.loc.start.line).join(", ");
            nodes.forEach((node) => {
              context.report({
                node,
                messageId: "duplicate",
                data: {
                  str: str.length > 20 ? str.slice(0, 20) + "..." : str, // 截断过长的错误提示
                  count: nodes.length,
                  threshold,
                  lines: lineNumbers,
                },
              });
            });
          }
        }
      },
    };
  },
};

var recommendedConfig = {
  rules: {
    "aegis/no-duplicate-string": [
      "error",
      {
        threshold: 3,
        minLength: 5,
        ignorePatterns: [
          "^/", // 路径
          "^http(s)?://", // URL
          "^#([0-9A-Fa-f]{3,6})$", // HEX 颜色
          "^[0-9]+(px|rem|em|vh|vw|%)$", // CSS 单位
          "application/json", // 常见 MIME
          "YYYY-MM-DD", // 日期格式
        ],
      },
    ],
    // 未来在这里添加 aegis/other-rule
  },
};

var name = "eslint-plugin-aegis";
var version = "1.0.0";
var pkg = {
	name: name,
	version: version};

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

const meta = plugin.meta;
const rules = plugin.rules;
const configs = plugin.configs;

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

export { configs, plugin as default, meta, rules };
