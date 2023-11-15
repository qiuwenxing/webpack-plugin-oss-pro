# webpack-plugin-oss-pro

一个可以将打包好的资源文件上传到阿里云 OSS 并且修改代码中资源文件 CND 地址的 Webpack 插件

本插件基于`webpack5`实现，使用时请检查`webpack`或`@vue/cli-service`版本是否`>=5`

# Install 安装

```
npm i webpack-plugin-oss-pro -D
```

# Options 配置参数

- cdnHost: 必传。上传后要替换的资源文件 CDN 域名
- region: 必传。阿里云上传区域
- accessKeyId: 必传。阿里云的授权 accessKeyId
- accessKeySecret: 必传。阿里云的授权 accessKeySecret
- bucket: 必传。上传到哪个 bucket
- from: 必传。上传哪些文件，支持类似 gulp.src 的 glob 方法，如'./build/\*\*', 为 glob 字符串。默认./dist/img/**
- dist: 上传到 oss 哪个目录下，默认为 oss 根目录。可作为路径前缀使用。
- timeout: oss 超时设置，默认为 30 秒(30000)
- overwrite: 是否覆盖 oss 同名文件。默认 true。
- deleteOrigin: 上传完成是否删除原文件，默认 false。
- setOssPath: 自定义每个文件上传路径。接收参数为当前文件路径。不传，或者所传函数返回 false 则按默认方式上传。
- test: 测试，仅查看文件和上传路径，但是不执行上传操作。默认 false。
- quitWpOnError: 出错是否中断打包。默认 false。
- parallel: 并发上传个数。默认 5
- fileSuffix: 需要上传的文件后缀，默认['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'webm', 'avi', 'mp4', 'mp3', 'flv', 'mov']

## 注意: accessKeyId, accessKeySecret 很重要，注意保密!!!

### Vue 例子

```javascript
// vue.config.js
const { defineConfig } = require("@vue/cli-service");
const WebpackPluginOssPro = require("webpack-plugin-oss-pro");

const prod = process.env.NODE_ENV === "production";

module.exports = defineConfig({
  configureWebpack: {
    plugins: [
      // 打包时才加载插件
      prod &&
        new WebpackPluginOssPro({
          cdnHost: "https://cdn.xxx.com",//设置cdn域名
          from: "./dist/img/**", // 需要上传到oss的文件夹
          dist: "static", // 需要上传到oss上的给定文件目录
          region: "oss-xx-xx-1",
          accessKeyId: "xxxxxxxxxxxx",
          accessKeySecret: "xxxxxxxxxxxx",
          bucket: "xxxxxxxxx",
        }),
    ].filter(Boolean),
  },
});
```

### Webpack 例子

```javascript
// webpack.config.js
const WebpackPluginOssPro = require("webpack-plugin-oss-pro");

const prod = process.env.NODE_ENV === "production";

module.exports = {
  plugins: [
    new WebpackPluginOssPro({
      cdnHost: "https://cdn.xxx.com",// 设置cdn域名
      from: "./dist/img/**", // 上传那个文件或文件夹
      dist: "static", // 需要上传到oss上的给定文件目录
      region: "oss-xx-xx-1",
      accessKeyId: "xxxxxxxxxxxx",
      accessKeySecret: "xxxxxxxxxxxx",
      bucket: "xxxxxxxxx",
    }),
  ],
};
```
