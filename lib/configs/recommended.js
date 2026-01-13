export default {
  rules: {
    "aegis/no-duplicate-string": [
      "error",
      {
        threshold: 2,
        minLength: 2,
        ignoreStrings: [
          "application/json", // 常见 MIME
          "YYYY-MM-DD", // 日期格式
        ],
        ignorePatterns: [
          "^/", // 路径
          "^http(s)?://", // URL
          "^#([0-9A-Fa-f]{3,6})$", // HEX 颜色
          "^[0-9]+(px|rem|em|vh|vw|%)$", // CSS 单位
        ],
      },
    ],
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
        ignoreArrayIndexes: true,
        ignoreTypeIndexes: true,
        ignoreEnums: true,
        detectObjects: true,
        enforceConst: true,
        ignorePropertyPatterns: ["^width$|Width$"],
        ignoreCalleePatterns: ["^(Date|setTimeout|setInterval|delay)$"],
      },
    ],
    // 未来在这里添加 aegis/other-rule
  },
};
